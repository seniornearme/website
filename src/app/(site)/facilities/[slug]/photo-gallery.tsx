"use client";

import { useState } from "react";

type Photo = { url: string; thumb_url: string | null; label: string | null };

export function PhotoGallery({ photos, name }: { photos: Photo[]; name: string }) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<number>>(new Set());

  const usable = photos.filter((_, i) => !broken.has(i));
  if (!usable.length) return null;

  const activeIdx = broken.has(active) ? photos.findIndex((_, i) => !broken.has(i)) : active;
  const alt = (p: Photo) => (p.label ? `${p.label} — ${name}` : name);

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[activeIdx]?.url}
          alt={photos[activeIdx] ? alt(photos[activeIdx]) : name}
          className="h-64 w-full object-cover sm:h-80"
          onError={() => setBroken((b) => new Set(b).add(activeIdx))}
        />
        {usable.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {usable.length} photos
          </span>
        )}
      </div>

      {photos.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) =>
            broken.has(i) ? null : (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={p.label ?? `Photo ${i + 1}`}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  i === activeIdx ? "border-blue-600" : "border-transparent opacity-80 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumb_url ?? p.url}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setBroken((b) => new Set(b).add(i))}
                />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
