"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FacilityCard, titleCase } from "./facility-card";

export type FacilityGeo = {
  id: string;
  name: string;
  slug: string;
  facility_type: "rcfe" | "arf" | "other";
  status: string;
  city: string | null;
  county: string | null;
  capacity: number | null;
  lng: number;
  lat: number;
};

type TypeFilter = "all" | "rcfe" | "arf";
type BedsFilter = "any" | "small" | "medium" | "large";
type LngLat = { lng: number; lat: number };

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const LABEL_FONT = "Noto Sans Regular";
const CA_CENTER: [number, number] = [-119.4179, 36.7783];
const INITIAL_ZOOM = 5.5;
const MIN_ZOOM = 5;
const MAX_ZOOM = 18;
const RADIUS_OPTIONS = [5, 10, 25, 50] as const;

const MARKER_COLORS: Record<string, string> = {
  rcfe: "#2563eb",
  arf: "#059669",
  other: "#6b7280",
};

function isOutsideCalifornia(loc: LngLat): boolean {
  return (
    loc.lng < -124.6 || loc.lng > -114.0 || loc.lat < 32.4 || loc.lat > 42.1
  );
}

function distanceMiles(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatMiles(mi: number): string {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

function circlePolygon(
  center: LngLat,
  radiusMiles: number,
  points = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const R = 3958.8;
  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;
  const d = radiusMiles / R;
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const brng = (i / points) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brng),
    );
    const lng2 =
      lng +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat),
        Math.cos(d) - Math.sin(lat) * Math.sin(lat2),
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: {},
  };
}

function bedsMatch(capacity: number | null, filter: BedsFilter): boolean {
  if (filter === "any") return true;
  const c = capacity ?? 0;
  if (filter === "small") return c > 0 && c <= 6;
  if (filter === "medium") return c >= 7 && c <= 15;
  return c >= 16;
}

// Draw a teardrop pin with a house glyph directly to canvas — synchronous and
// robust (no Image element / SVG data-URL loading, which can hang headless).
const TEARDROP_PATH =
  "M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z";
const HOUSE_PATH = "M15 9.2l5.4 4.4v5.6h-3.6v-3.6h-3.6v3.6H9.6v-5.6z";

function makeMarkerImageData(color: string): ImageData | null {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = 30 * scale;
  canvas.height = 40 * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(TEARDROP_PATH));
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(15, 14.5, 9, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fill(new Path2D(HOUSE_PATH));
  return ctx.getImageData(0, 0, 30 * scale, 40 * scale);
}

export function SearchMap({ facilities }: { facilities: FacilityGeo[] }) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [bedsFilter, setBedsFilter] = useState<BedsFilter>("any");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null);

  // Map pins reflect type + beds + radius (not the text query, which only
  // narrows the list so an address query never blanks the map).
  const filtered = useMemo(() => {
    let r = facilities;
    if (typeFilter !== "all")
      r = r.filter((f) => f.facility_type === typeFilter);
    if (bedsFilter !== "any") r = r.filter((f) => bedsMatch(f.capacity, bedsFilter));
    if (userLocation && radiusMiles != null) {
      r = r.filter(
        (f) =>
          distanceMiles(userLocation, { lng: f.lng, lat: f.lat }) <=
          radiusMiles,
      );
    }
    return r;
  }, [facilities, typeFilter, bedsFilter, userLocation, radiusMiles]);

  const filteredById = useMemo(() => {
    const map = new Map<string, FacilityGeo>();
    for (const f of filtered) map.set(f.id, f);
    return map;
  }, [filtered]);

  const facilitiesById = useMemo(() => {
    const map = new Map<string, FacilityGeo>();
    for (const f of facilities) map.set(f.id, f);
    return map;
  }, [facilities]);

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: filtered.map((f) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
        properties: {
          id: f.id,
          name: f.name,
          label: titleCase(f.name),
          facility_type: f.facility_type,
          city: f.city ?? "",
          capacity: f.capacity ?? 0,
        },
      })),
    }),
    [filtered],
  );

  const recomputeVisible = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const next = new Set<string>();
    for (const f of filtered) {
      if (bounds.contains([f.lng, f.lat])) next.add(f.id);
      if (next.size >= 300) break;
    }
    setVisibleIds(next);
  }, [filtered]);

  const recomputeRef = useRef(recomputeVisible);
  useEffect(() => {
    recomputeRef.current = recomputeVisible;
  }, [recomputeVisible]);

  const selectFacility = useCallback((f: FacilityGeo) => {
    setSelectedId(f.id);
    const map = mapRef.current;
    if (!map) return;
    const desktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;
    const padding = desktop
      ? { left: 784, top: 0, right: 0, bottom: 0 }
      : {
          top: 0,
          left: 0,
          right: 0,
          bottom: Math.round(
            (typeof window !== "undefined" ? window.innerHeight : 700) * 0.62,
          ),
        };
    map.easeTo({
      center: [f.lng, f.lat],
      zoom: Math.max(map.getZoom(), 14),
      padding,
      duration: 500,
    });
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLE_URL,
      center: CA_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      renderWorldCopies: false,
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    if (
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined"
    ) {
      (window as unknown as { __searchMap?: MapLibreMap }).__searchMap = map;
    }

    map.scrollZoom.disable();
    map.scrollZoom.enable({ around: "center" });
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserLocation: true,
      showAccuracyCircle: true,
      fitBoundsOptions: { maxZoom: 13 },
    });
    map.addControl(geolocate, "top-right");
    geolocate.on("geolocate", (e) => {
      const pos = e as unknown as GeolocationPosition;
      setUserLocation({ lng: pos.coords.longitude, lat: pos.coords.latitude });
    });

    map.on("load", () => {
      for (const [type, color] of Object.entries(MARKER_COLORS)) {
        const id = `marker-${type}`;
        if (!map.hasImage(id)) {
          const data = makeMarkerImageData(color);
          if (data) map.addImage(id, data, { pixelRatio: 2 });
        }
      }

      map.addSource("radius", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: "radius-outline",
        type: "line",
        source: "radius",
        paint: {
          "line-color": "#2563eb",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
        },
      });

      map.addSource("facilities", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "facilities",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#60a5fa",
            50,
            "#3b82f6",
            250,
            "#1d4ed8",
          ],
          "circle-radius": ["step", ["get", "point_count"], 16, 50, 22, 250, 28],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "facilities",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-size": 12,
          "text-font": [LABEL_FONT],
        },
        paint: { "text-color": "#ffffff" },
      });

      // P4 icon markers + name labels (one symbol layer).
      map.addLayer({
        id: "facility-markers",
        type: "symbol",
        source: "facilities",
        filter: ["!", ["has", "point_count"]],
        layout: {
          "icon-image": [
            "match",
            ["get", "facility_type"],
            "rcfe",
            "marker-rcfe",
            "arf",
            "marker-arf",
            "marker-other",
          ],
          "icon-size": 0.85,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "text-field": ["get", "label"],
          "text-font": [LABEL_FONT],
          "text-size": 11,
          "text-anchor": "left",
          "text-offset": [1.1, -1.1],
          "text-max-width": 12,
          "text-optional": true,
        },
        paint: {
          "text-color": "#374151",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      });

      const hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 24,
        className: "facility-hover-popup",
      });
      const showHover = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as {
          label?: string;
          city?: string;
          facility_type?: string;
          capacity?: number;
        };
        const type = (p.facility_type || "").toUpperCase();
        const sub = [p.city, type].filter(Boolean).join(" · ");
        const beds = p.capacity ? ` · ${p.capacity} beds` : "";
        const geom = f.geometry as GeoJSON.Point;
        hoverPopup
          .setLngLat(geom.coordinates as [number, number])
          .setHTML(
            `<div class="fhp-card">` +
              `<div class="fhp-thumb"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#185fa5" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg></div>` +
              `<div><div class="fhp-name">${escapeHtml(p.label || "")}</div>` +
              `<div class="fhp-sub">${escapeHtml(sub + beds)}</div></div></div>`,
          )
          .addTo(map);
      };

      map.on("click", "clusters", async (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = features[0]?.properties?.cluster_id;
        if (clusterId == null) return;
        const source = map.getSource("facilities") as maplibregl.GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const geom = features[0].geometry as GeoJSON.Point;
        map.easeTo({ center: geom.coordinates as [number, number], zoom });
      });

      map.on("click", "facility-markers", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties?.id as string;
        setSelectedId(id);
      });

      const setCursor = (c: string) => {
        map.getCanvas().style.cursor = c;
      };
      map.on("mouseenter", "clusters", () => setCursor("pointer"));
      map.on("mouseleave", "clusters", () => setCursor(""));
      map.on("mouseenter", "facility-markers", (e) => {
        setCursor("pointer");
        showHover(e);
      });
      map.on("mousemove", "facility-markers", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const geom = f.geometry as GeoJSON.Point;
        hoverPopup.setLngLat(geom.coordinates as [number, number]);
      });
      map.on("mouseleave", "facility-markers", () => {
        setCursor("");
        hoverPopup.remove();
      });

      map.on("moveend", () => recomputeRef.current());
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("facilities") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;
    source.setData(geojson);
    recomputeVisible();
  }, [geojson, mapReady, recomputeVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("radius") as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;
    source.setData(
      userLocation && radiusMiles != null
        ? {
            type: "FeatureCollection",
            features: [circlePolygon(userLocation, radiusMiles)],
          }
        : { type: "FeatureCollection", features: [] },
    );
  }, [userLocation, radiusMiles, mapReady]);

  const q = query.trim().toLowerCase();
  const visibleList = useMemo(() => {
    const items: { facility: FacilityGeo; distance: number | null }[] = [];
    for (const id of visibleIds) {
      const f = filteredById.get(id);
      if (!f) continue;
      if (
        q &&
        !f.name.toLowerCase().includes(q) &&
        !(f.city ?? "").toLowerCase().includes(q)
      )
        continue;
      items.push({
        facility: f,
        distance: userLocation
          ? distanceMiles(userLocation, { lng: f.lng, lat: f.lat })
          : null,
      });
    }
    if (userLocation) items.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    else items.sort((a, b) => a.facility.name.localeCompare(b.facility.name));
    return items;
  }, [visibleIds, filteredById, userLocation, q]);

  const outsideCA = userLocation ? isOutsideCalifornia(userLocation) : false;
  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (bedsFilter !== "any" ? 1 : 0) +
    (radiusMiles != null ? 1 : 0);
  const selectedFacility = selectedId
    ? (facilitiesById.get(selectedId) ?? null)
    : null;
  const selectedDistance =
    selectedFacility && userLocation
      ? distanceMiles(userLocation, {
          lng: selectedFacility.lng,
          lat: selectedFacility.lat,
        })
      : null;

  const handleRadiusChange = (value: string) => {
    const r = value === "any" ? null : Number(value);
    setRadiusMiles(r);
    const map = mapRef.current;
    if (r != null && userLocation && map) {
      const coords = circlePolygon(userLocation, r).geometry.coordinates[0];
      const bounds = coords.reduce(
        (b, c) => b.extend(c as [number, number]),
        new maplibregl.LngLatBounds(
          coords[0] as [number, number],
          coords[0] as [number, number],
        ),
      );
      map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 600 });
    }
  };

  const handleSearchSubmit = async () => {
    const term = query.trim();
    const map = mapRef.current;
    if (!term || !map) return;
    const lower = term.toLowerCase();

    // 1. Exact city match -> fly to that city's centroid.
    const cityHits = facilities.filter(
      (f) => (f.city ?? "").toLowerCase() === lower,
    );
    if (cityHits.length) {
      const lng = cityHits.reduce((s, f) => s + f.lng, 0) / cityHits.length;
      const lat = cityHits.reduce((s, f) => s + f.lat, 0) / cityHits.length;
      map.flyTo({ center: [lng, lat], zoom: 12, duration: 800 });
      return;
    }
    // 2. Facility-name match -> fly to it and open its card.
    const nameHit = facilities.find((f) => f.name.toLowerCase().includes(lower));
    if (nameHit) {
      selectFacility(nameHit);
      return;
    }
    // 3. Geocode as an address via the API.
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data?.result) {
        map.flyTo({
          center: [data.result.lng, data.result.lat],
          zoom: 13,
          duration: 800,
        });
      }
    } catch {
      /* ignore */
    }
  };

  const chipClass =
    "shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm";
  const panelBase =
    "absolute z-10 flex flex-col bg-white dark:bg-zinc-900 shadow-xl overflow-hidden " +
    "left-0 right-0 bottom-0 h-[40vh] rounded-t-2xl " +
    "md:left-3 md:top-3 md:bottom-3 md:right-auto md:h-auto md:w-[384px] md:rounded-2xl";
  const cardPanel =
    "absolute z-20 flex flex-col bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden " +
    "left-0 right-0 bottom-0 h-[66vh] rounded-t-2xl " +
    "md:left-[400px] md:top-3 md:bottom-3 md:right-auto md:h-auto md:w-[368px] md:rounded-2xl";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div ref={mapContainer} className="h-full w-full" />

      <aside className={panelBase}>
        <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 p-3">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2">
              <svg
                className="shrink-0 text-zinc-400"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearchSubmit();
                }}
                placeholder="Search address, city, ZIP, or name"
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                aria-label="Search by address, city, ZIP, or facility name"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-label="Filters"
              aria-expanded={filtersOpen}
              className="relative shrink-0 rounded-full border border-zinc-300 bg-white p-2.5 text-zinc-600 md:hidden dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 4h18l-7 8.5V19l-4 2v-8.5z" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          <div
            className={`${filtersOpen ? "flex" : "hidden"} mt-2 gap-2 overflow-x-auto pb-1 md:flex`}
          >
            <select
              className={chipClass}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              aria-label="Facility type"
            >
              <option value="all">All types</option>
              <option value="rcfe">RCFE — Elder care</option>
              <option value="arf">ARF — Adult residential</option>
            </select>
            <select
              className={chipClass}
              value={bedsFilter}
              onChange={(e) => setBedsFilter(e.target.value as BedsFilter)}
              aria-label="Capacity"
            >
              <option value="any">Any beds</option>
              <option value="small">≤6 (board &amp; care)</option>
              <option value="medium">7–15 beds</option>
              <option value="large">16+ beds</option>
            </select>
            {userLocation && (
              <select
                className={chipClass}
                value={radiusMiles == null ? "any" : String(radiusMiles)}
                onChange={(e) => handleRadiusChange(e.target.value)}
                aria-label="Distance"
              >
                <option value="any">Any distance</option>
                {RADIUS_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    Within {r} mi
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="mt-1 px-1 text-xs text-zinc-500">
            {filtered.length.toLocaleString()} facilities
            {userLocation && radiusMiles != null ? ` within ${radiusMiles} mi` : ""}
            {outsideCA ? " · you appear to be outside California" : ""}
          </p>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
          {visibleList.length === 0 && (
            <li className="p-4 text-sm text-zinc-500">
              {q
                ? "No matches in view. Press Enter to search this address or city."
                : "Pan or zoom the map to see facilities here."}
            </li>
          )}
          {visibleList.map(({ facility: f, distance }) => (
            <li key={f.id}>
              <button
                type="button"
                className={`w-full text-left p-3 transition-colors ${
                  selectedId === f.id
                    ? "bg-blue-50 dark:bg-blue-950"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
                onClick={() => selectFacility(f)}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{titleCase(f.name)}</span>
                  {distance != null && (
                    <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">
                      {formatMiles(distance)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {[f.city, f.facility_type.toUpperCase()]
                    .filter(Boolean)
                    .join(" · ")}
                  {f.capacity ? ` · ${f.capacity} beds` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {selectedFacility && (
        <section className={cardPanel}>
          <FacilityCard
            key={selectedFacility.id}
            facility={selectedFacility}
            distanceMi={selectedDistance}
            onClose={() => setSelectedId(null)}
          />
        </section>
      )}
    </div>
  );
}
