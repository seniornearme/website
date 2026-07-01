"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FacilityGeo } from "./search-map";

type FacilityDetail = {
  street_address: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  license_number: string | null;
  capacity: number | null;
  administrator: string | null;
  licensee: string | null;
};

const KEEP_UPPER = new Set(["LLC", "II", "III", "IV", "INC", "LP", "RCFE", "ARF"]);

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) =>
      KEEP_UPPER.has(w.toUpperCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

function typeLabel(t: FacilityGeo["facility_type"]): string {
  if (t === "rcfe") return "Assisted living · RCFE";
  if (t === "arf") return "Adult residential · ARF";
  return "Care facility";
}

function normalizeWebsite(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export function FacilityCard({
  facility,
  distanceMi,
  onClose,
}: {
  facility: FacilityGeo;
  distanceMi: number | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<FacilityDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Rendered with key={facility.id}, so this mounts fresh per facility and the
  // initial state (loading, no detail) is correct without resetting in-effect.
  useEffect(() => {
    let active = true;
    const supabase = createClient();
    supabase
      .from("facilities")
      .select(
        "street_address,city,zip,phone,email,website,license_number,capacity,administrator,licensee",
      )
      .eq("id", facility.id)
      .single()
      .then(({ data }) => {
        if (!active) return;
        setDetail(data as FacilityDetail | null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [facility.id]);

  const cityLine = [detail?.city ?? facility.city, "CA", detail?.zip]
    .filter(Boolean)
    .join(" ");
  const address = [detail?.street_address, cityLine].filter(Boolean).join(", ");
  const phone = detail?.phone;
  const website = detail?.website;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`;

  return (
    <div className="flex h-full flex-col">
      {/* Photo placeholder + close */}
      <div className="relative shrink-0">
        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 text-white/90">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to results"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow hover:bg-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-xl font-semibold leading-tight">
            {titleCase(facility.name)}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {typeLabel(facility.facility_type)}
            {facility.capacity ? ` · ${facility.capacity} beds` : ""}
            {distanceMi != null
              ? ` · ${distanceMi < 10 ? distanceMi.toFixed(1) : Math.round(distanceMi)} mi away`
              : ""}
          </p>
          {facility.status !== "active" && (
            <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {facility.status}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 rounded-lg border border-zinc-200 py-2 text-xs text-blue-600 transition-colors hover:bg-blue-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m21.71 11.29-9-9a1 1 0 0 0-1.42 0l-9 9a1 1 0 0 0 0 1.42l9 9a1 1 0 0 0 1.42 0l9-9a1 1 0 0 0 0-1.42ZM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5Z" /></svg>
            Directions
          </a>
          <a
            href={phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : undefined}
            aria-disabled={!phone}
            className={`flex flex-col items-center gap-1 rounded-lg border border-zinc-200 py-2 text-xs transition-colors dark:border-zinc-700 ${
              phone
                ? "text-blue-600 hover:bg-blue-50 dark:hover:bg-zinc-900"
                : "pointer-events-none text-zinc-300 dark:text-zinc-600"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1-.25 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.25 1l-2.2 2.22Z" /></svg>
            Call
          </a>
          <a
            href={website ? normalizeWebsite(website) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!website}
            className={`flex flex-col items-center gap-1 rounded-lg border border-zinc-200 py-2 text-xs transition-colors dark:border-zinc-700 ${
              website
                ? "text-blue-600 hover:bg-blue-50 dark:hover:bg-zinc-900"
                : "pointer-events-none text-zinc-300 dark:text-zinc-600"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" /></svg>
            Website
          </a>
        </div>

        {/* Info rows */}
        <div className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
          <InfoRow icon="pin" loading={loading && !address}>
            {address || facility.city}
          </InfoRow>
          {(phone || loading) && (
            <InfoRow icon="phone" loading={loading && !phone}>
              {phone ? (
                <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="text-blue-600 hover:underline">
                  {phone}
                </a>
              ) : (
                ""
              )}
            </InfoRow>
          )}
          {detail?.license_number && (
            <InfoRow icon="doc">License #{detail.license_number}</InfoRow>
          )}
          {detail?.administrator && (
            <InfoRow icon="user">Administrator: {titleCase(detail.administrator)}</InfoRow>
          )}
          {detail?.licensee && (
            <InfoRow icon="building">Licensee: {titleCase(detail.licensee)}</InfoRow>
          )}
        </div>

        {/* Claim CTA */}
        <div className="p-4">
          <button
            type="button"
            className="w-full rounded-lg border border-zinc-300 py-2 text-sm font-medium transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Own this facility? Claim this listing
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  loading,
  children,
}: {
  icon: "pin" | "phone" | "doc" | "user" | "building";
  loading?: boolean;
  children: React.ReactNode;
}) {
  const paths: Record<typeof icon, React.ReactNode> = {
    pin: <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
    phone: <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1-.25 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.25 1l-2.2 2.22Z" />,
    doc: <path d="M6 2h9l5 5v15H6V2Zm8 1v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
    user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
    building: <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  };
  const filled = icon === "pin" || icon === "phone";
  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        className="mt-0.5 shrink-0 text-zinc-400"
        aria-hidden="true"
      >
        {paths[icon]}
      </svg>
      <div className="min-w-0 break-words">
        {loading ? (
          <span className="inline-block h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
