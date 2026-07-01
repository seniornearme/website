"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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
type LngLat = { lng: number; lat: number };

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const CA_CENTER: [number, number] = [-119.4179, 36.7783];
const INITIAL_ZOOM = 5.5;
const MIN_ZOOM = 5;
const MAX_ZOOM = 18;
const RADIUS_OPTIONS = [5, 10, 25, 50] as const;

// Rough California bounding box — used to warn users located outside the state,
// since the directory only covers CA facilities.
function isOutsideCalifornia(loc: LngLat): boolean {
  return (
    loc.lng < -124.6 || loc.lng > -114.0 || loc.lat < 32.4 || loc.lat > 42.1
  );
}

function distanceMiles(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
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

// Approximate a geodesic circle as a polygon for the radius overlay.
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

export function SearchMap({ facilities }: { facilities: FacilityGeo[] }) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const base =
      typeFilter === "all"
        ? facilities
        : facilities.filter((f) => f.facility_type === typeFilter);
    if (userLocation && radiusMiles != null) {
      return base.filter(
        (f) =>
          distanceMiles(userLocation, { lng: f.lng, lat: f.lat }) <=
          radiusMiles,
      );
    }
    return base;
  }, [facilities, typeFilter, userLocation, radiusMiles]);

  const filteredById = useMemo(() => {
    const map = new Map<string, FacilityGeo>();
    for (const f of filtered) map.set(f.id, f);
    return map;
  }, [filtered]);

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: filtered.map((f) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [f.lng, f.lat] },
        properties: {
          id: f.id,
          name: f.name,
          slug: f.slug,
          facility_type: f.facility_type,
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
      if (next.size >= 200) break;
    }
    setVisibleIds(next);
  }, [filtered]);

  // Keep the latest recomputeVisible reachable from the once-only map init,
  // so map events can call it without re-creating the map on every filter change.
  const recomputeRef = useRef(recomputeVisible);
  useEffect(() => {
    recomputeRef.current = recomputeVisible;
  }, [recomputeVisible]);

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

    // Zoom around the map center rather than the cursor. Cursor-anchored zoom
    // (the default) walks the camera toward the pointer on every wheel tick,
    // which is what let zoom-out drift the center south out of California.
    // scrollZoom is enabled by default and enable() no-ops when already on,
    // so we must disable() first.
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
      setUserLocation({
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
      });
    });

    map.on("load", () => {
      // Radius overlay (added before the facility layers so pins draw on top).
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
          "circle-radius": [
            "step",
            ["get", "point_count"],
            16,
            50,
            22,
            250,
            28,
          ],
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
          "text-font": ["Noto Sans Regular"],
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "facilities",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": [
            "match",
            ["get", "facility_type"],
            "rcfe",
            "#3b82f6",
            "arf",
            "#10b981",
            "#6b7280",
          ],
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

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

      map.on("click", "unclustered-point", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties?.id as string;
        setSelectedId(id);
        const geom = f.geometry as GeoJSON.Point;
        map.easeTo({ center: geom.coordinates as [number, number], zoom: 14 });
      });

      const setCursor = (cursor: string) => {
        map.getCanvas().style.cursor = cursor;
      };
      map.on("mouseenter", "clusters", () => setCursor("pointer"));
      map.on("mouseleave", "clusters", () => setCursor(""));
      map.on("mouseenter", "unclustered-point", () => setCursor("pointer"));
      map.on("mouseleave", "unclustered-point", () => setCursor(""));

      map.on("moveend", () => recomputeRef.current());

      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Push filtered facilities to the map + refresh the in-view list.
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

  // Draw/clear the radius circle overlay.
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

  const visibleList = useMemo(() => {
    const items: { facility: FacilityGeo; distance: number | null }[] = [];
    for (const id of visibleIds) {
      const f = filteredById.get(id);
      if (!f) continue;
      items.push({
        facility: f,
        distance: userLocation
          ? distanceMiles(userLocation, { lng: f.lng, lat: f.lat })
          : null,
      });
    }
    if (userLocation) {
      items.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    } else {
      items.sort((a, b) => a.facility.name.localeCompare(b.facility.name));
    }
    return items;
  }, [visibleIds, filteredById, userLocation]);

  const outsideCA = userLocation ? isOutsideCalifornia(userLocation) : false;

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
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 600 });
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden">
      <aside className="flex flex-col shrink-0 md:w-96 md:max-w-96 max-h-[45vh] md:max-h-none md:h-full overflow-hidden border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h1 className="text-lg font-semibold">
            {filtered.length.toLocaleString()} facilities
            {userLocation && radiusMiles != null
              ? ` within ${radiusMiles} mi`
              : ""}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            {visibleList.length.toLocaleString()} visible in current view
          </p>
          <select
            className="mt-3 w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent p-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
          >
            <option value="all">All types</option>
            <option value="rcfe">RCFE — Elder care</option>
            <option value="arf">ARF — Adult residential</option>
          </select>
          {userLocation ? (
            <select
              className="mt-3 w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent p-2 text-sm"
              value={radiusMiles == null ? "any" : String(radiusMiles)}
              onChange={(e) => handleRadiusChange(e.target.value)}
            >
              <option value="any">Any distance</option>
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  Within {r} miles
                </option>
              ))}
            </select>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">
              Tap the location button on the map to find facilities near you.
            </p>
          )}
          {outsideCA && (
            <p className="mt-2 text-xs text-amber-600">
              You appear to be outside California. SeniorNearMe currently covers
              California facilities only.
            </p>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800">
          {visibleList.map(({ facility: f, distance }) => (
            <li key={f.id}>
              <button
                type="button"
                className={`w-full text-left p-3 transition-colors ${
                  selectedId === f.id
                    ? "bg-blue-50 dark:bg-blue-950"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
                onClick={() => {
                  setSelectedId(f.id);
                  mapRef.current?.easeTo({
                    center: [f.lng, f.lat],
                    zoom: 14,
                  });
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{f.name}</span>
                  {distance != null && (
                    <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">
                      {formatMiles(distance)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {[f.city, f.facility_type.toUpperCase()]
                    .filter(Boolean)
                    .join(" · ")}
                  {f.capacity ? ` · cap. ${f.capacity}` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div ref={mapContainer} className="flex-1 min-h-0" />
    </div>
  );
}
