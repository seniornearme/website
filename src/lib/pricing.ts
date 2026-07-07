/**
 * Estimated monthly cost ranges for RCFEs.
 *
 * Model: the published statewide median — $7,350/mo for California assisted
 * living (Genworth/CareScout Cost of Care Survey 2024) — adjusted two ways:
 *
 * 1. County cost factor from the Zillow Observed Rent Index (latest month,
 *    county level), normalized so the facility-weighted average factor is 1
 *    (the state median then anchors the "average facility's county").
 *    Housing costs vary more than care costs (staffing has statewide wage
 *    floors), so factors are damped 50% toward 1.
 * 2. Capacity class: small board-and-care homes price below the survey
 *    median (which skews toward larger communities); big communities with
 *    tiered care price above it.
 *
 * Estimates only — owner-provided pricing (pricing_source = 'owner')
 * replaces them wherever present. Methodology published on /about-our-data.
 */
import pricingData from "./pricing-data.json";

export const CA_MEDIAN_MONTHLY = 7350; // Genworth/CareScout 2024, CA assisted living

const FACTORS: Record<string, number> = pricingData.factors;

// [min multiplier, max multiplier] on the county-adjusted base
const CAPACITY_CLASS: [max: number, lo: number, hi: number][] = [
  [6, 0.7, 1.05],       // small board-and-care home
  [15, 0.75, 1.15],     // mid-size home
  [49, 0.85, 1.3],      // small community
  [Infinity, 0.95, 1.5],// large community with care tiers
];

const round100 = (n: number) => Math.round(n / 100) * 100;

export function countyFactor(county: string | null): number {
  const raw = county ? FACTORS[county.toUpperCase().trim()] : undefined;
  const f = raw ?? 1;
  return 1 + (f - 1) * 0.5; // damp housing-cost spread toward care-cost spread
}

export function estimateRange(
  county: string | null,
  capacity: number | null,
): { min: number; max: number } {
  const base = CA_MEDIAN_MONTHLY * countyFactor(county);
  const cls = CAPACITY_CLASS.find(([max]) => (capacity ?? 6) <= max)!;
  return { min: round100(base * cls[1]), max: round100(base * cls[2]) };
}

export const fmtUsd = (n: number) => `$${n.toLocaleString("en-US")}`;
