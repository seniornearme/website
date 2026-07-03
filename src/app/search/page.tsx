import { Suspense } from "react";
import { SearchMap } from "./search-map";

// The facility dataset is NOT embedded here — SearchMap fetches it from
// /api/facilities (compact, cached). Keeps this page's payload tiny so it
// loads fast on phones.
export const revalidate = 3600;

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="h-full w-full" />}>
      <SearchMap />
    </Suspense>
  );
}
