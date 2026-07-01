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

export function SearchMap({ facilities }: { facilities: FacilityGeo[] }) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

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
    const list: FacilityGeo[] = [];
    for (const id of visibleIds) {
      const f = filteredById.get(id);
      if (f) list.push(f);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleIds, filteredById]);

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
        </div>
        <ul className="flex-1 overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800">
          {visibleList.map((f) => (
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
                <div className="text-sm font-medium">{f.name}</div>
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
