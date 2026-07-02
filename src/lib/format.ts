// Shared display formatters used by the search card and facility detail page.

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function typeLabel(t: "rcfe" | "arf" | "other" | string): string {
  if (t === "rcfe") return "Assisted living · RCFE";
  if (t === "arf") return "Adult residential · ARF";
  return "Care facility";
}

export function normalizeWebsite(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
