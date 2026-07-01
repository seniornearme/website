/**
 * CDSS Community Care Licensing — CKAN DataStore fetch + row mapping.
 *
 * Package: ccl-facilities (46ffcbdf-4874-4cc1-92c2-fb715e3ad014)
 * Resources refresh every ~6 months. Poll `package_show` and compare
 * `last_modified` per resource to detect updates.
 */

export const RCFE_RESOURCE_ID = "744d1583-f9eb-45b6-b0f8-b9a9dab936a6";
export const ARF_RESOURCE_ID = "9f5d1d00-6b24-4f44-a158-9cbe4b43f117";

const DATASTORE_URL = "https://data.chhs.ca.gov/api/3/action/datastore_search";
const PAGE_SIZE = 1000;

export type CdssRawRow = {
  facility_type: string;
  facility_number: string | number;
  facility_name: string;
  licensee: string | null;
  facility_administrator: string | null;
  facility_telephone_number: string | null;
  facility_address: string | null;
  facility_city: string | null;
  facility_state: string | null;
  facility_zip: string | number | null;
  county_name: string | null;
  regional_office: string | number | null;
  facility_capacity: string | number | null;
  facility_status: string | null;
  license_first_date: string | null;
  closed_date: string | null;
  file_date: string | number | null;
};

type DataStoreResponse = {
  success: boolean;
  result: {
    total: number;
    records: CdssRawRow[];
  };
};

export async function fetchAllRecords(resourceId: string): Promise<CdssRawRow[]> {
  const all: CdssRawRow[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const url = `${DATASTORE_URL}?resource_id=${resourceId}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CKAN ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as DataStoreResponse;
    if (!body.success) throw new Error("CKAN reported success=false");

    total = body.result.total;
    all.push(...body.result.records);
    offset += PAGE_SIZE;
    console.log(`  ${resourceId.slice(0, 8)}…  ${all.length} / ${total}`);
  }

  return all;
}

// ============================================================================
// Mapping CDSS raw → our facilities row shape
// ============================================================================

export type FacilityRow = {
  license_number: string;
  facility_type: "rcfe" | "arf" | "other";
  status: "active" | "pending" | "closed" | "suspended" | "unknown";
  name: string;
  slug: string;
  street_address: string | null;
  city: string | null;
  county: string | null;
  state: string;
  zip: string | null;
  phone: string | null;
  capacity: number | null;
  administrator: string | null;
  licensee: string | null;
  license_issue_date: string | null;
};

function normFacilityType(raw: string): "rcfe" | "arf" | "other" {
  const s = raw.trim().toUpperCase();
  if (s.startsWith("RCFE")) return "rcfe";
  if (s.startsWith("ARF")) return "arf";
  return "other";
}

function normStatus(
  raw: string | null,
  closedDate: string | null,
): FacilityRow["status"] {
  if (closedDate && closedDate !== "null" && closedDate.trim() !== "") {
    return "closed";
  }
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "LICENSED") return "active";
  if (s === "CLOSED") return "closed";
  if (s === "PENDING") return "pending";
  if (s.includes("SUSPEND")) return "suspended";
  return "unknown";
}

function normStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "null") return null;
  return s;
}

function normZip(v: unknown): string | null {
  const s = normStr(v);
  if (!s) return null;
  // Preserve leading zeros; ZIP is 5 digits in CA. If it's numeric-typed and
  // lost a leading zero, pad. If it's ZIP+4, take the first 5.
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length === 0) return null;
  return digits.length >= 5 ? digits.slice(0, 5) : digits.padStart(5, "0");
}

function normCapacity(v: unknown): number | null {
  const s = normStr(v);
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function normDate(v: unknown): string | null {
  // Handle M/D/YYYY (e.g. "5/20/2010") — return ISO YYYY-MM-DD
  const s = normStr(v);
  if (!s) return null;
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map((p) => parseInt(p, 10));
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function slugify(name: string, licenseNumber: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base}-${licenseNumber}`;
}

export function mapCdssRow(raw: CdssRawRow): FacilityRow | null {
  const licenseNumber = normStr(raw.facility_number);
  const name = normStr(raw.facility_name);
  if (!licenseNumber || !name) return null;

  return {
    license_number: licenseNumber,
    facility_type: normFacilityType(raw.facility_type ?? ""),
    status: normStatus(raw.facility_status, raw.closed_date),
    name,
    slug: slugify(name, licenseNumber),
    street_address: normStr(raw.facility_address),
    city: normStr(raw.facility_city),
    county: normStr(raw.county_name),
    state: normStr(raw.facility_state) ?? "CA",
    zip: normZip(raw.facility_zip),
    phone: normStr(raw.facility_telephone_number),
    capacity: normCapacity(raw.facility_capacity),
    administrator: normStr(raw.facility_administrator),
    licensee: normStr(raw.licensee),
    license_issue_date: normDate(raw.license_first_date),
  };
}
