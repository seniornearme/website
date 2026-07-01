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

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const CA_CENTER: [number, number] = [-119.4179, 36.7783];
const INITIAL_ZOOM = 5.5;
const MIN_ZOOM = 5;
const MAX_ZOOM = 18;

// Rough California bounding box — used to warn users located outside the state,
// since the directory only covers CA facilities.
function isOutsideCalifornia(loc: { lng: number; lat: number }): boolean {
  return (
    loc.lng < -124.6 || loc.lng > -114.0 || loc.lat < 32.4 || loc.lat > 42.1
  );
}

function distanceMiles(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
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

export function SearchMap({ facilities }: { facilities: FacilityGeo[] }) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const geolocateRef = useRef<maplibregl.GeolocateControl | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [userLocation, setUserLocation] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      typeFilter === "all"
        ? facilities
        : facilities.filter((f) => f.facility_type === typeFilter),
    [facilities, typeFilter],
  );

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
    if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
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
    geolocateRef.current = geolocate;
    map.addControl(geolocate, "top-right");
    geolocate.on("geolocate", (e) => {
      const pos = e as unknown as GeolocationPosition;
      setLocating(false);
      setGeoError(null);
      setUserLocation({
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
      });
    });
    geolocate.on("error", (err) => {
      setLocating(false);
      setGeoError(
        err && (err as GeolocationPositionError).code === 1
          ? "Location permission denied. Enable it in your browser to use “Near me”."
          : "Couldn’t get your location. Try again.",
      );
    });

    map.on("load", () => {
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

      map.on("moveend", () => recomputeVisible());

      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [recomputeVisible]);

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

  const handleNearMe = () => {
    if (!geolocateRef.current) return;
    setGeoError(null);
    setLocating(true);
    // trigger() returns false when geolocation isn't available in this browser;
    // otherwise the control fires a "geolocate" or "error" event that clears
    // the locating state.
    const started = geolocateRef.current.trigger();
    if (!started) {
      setLocating(false);
      setGeoError("Location isn’t available in this browser.");
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden">
      <aside className="flex flex-col shrink-0 md:w-96 md:max-w-96 max-h-[45vh] md:max-h-none md:h-full overflow-hidden border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <h1 className="text-lg font-semibold">
            {filtered.length.toLocaleString()} facilities
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
          <button
            type="button"
            onClick={handleNearMe}
            disabled={locating}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-zinc-300 bg-white p-2 text-sm font-medium transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-transparent dark:hover:bg-zinc-900"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            {locating ? "Locating…" : "Near me"}
          </button>
          {geoError && (
            <p className="mt-2 text-xs text-red-600">{geoError}</p>
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
