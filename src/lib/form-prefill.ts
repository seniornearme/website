/**
 * Server-side pre-fill of CDSS compliance forms (repaired fillable copies in
 * public/forms) with a facility's identity fields via pdf-lib.
 *
 * PREFILL_MAPS is per-form and deliberately conservative: only header fields
 * whose placement was visually verified (field-name renders of page 1) or
 * whose names are unambiguous. Field names come from the PDFs themselves —
 * misses are skipped silently, so a CDSS form revision degrades to "less
 * pre-filled", never to wrong data in the wrong box. Forms without an entry
 * are served as-is (still fillable).
 */
import { PDFDocument } from "pdf-lib";

export type FacilityIdentity = {
  name: string;
  license_number: string | null;
  street_address: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  administrator: string | null;
  licensee: string | null;
};

type Slot =
  | "name" | "license" | "address" | "cityStateZip" | "fullAddress"
  | "phone" | "areaCode" | "phoneLocal" | "admin" | "licensee" | "type";

export const PREFILL_MAPS: Record<string, Record<string, Slot>> = {
  lic602a: { lic602a_1: "name", lic602a_2: "phone", lic602a_4: "fullAddress" },
  lic624a: {
    "LIC 624A_1": "name", "LIC 624A_2": "license", "LIC 624A_3": "areaCode",
    "LIC 624A_4": "phoneLocal", "LIC 624A_5": "address", "LIC 624A_6": "cityStateZip",
  },
  lic625: {
    "LIC 625 9": "name", "LIC 625 10": "address", "LIC 625 14": "license",
    "LIC 625 15": "areaCode", "LIC 625 16": "phoneLocal",
  },
  lic624: {
    Facility: "name", "Facility File Number": "license", Phone: "phone",
    Address: "address", "City State": "cityStateZip",
  },
  lic9060: { Facility: "name", "Facility Number": "license" },
  lic999: {
    FacilityName: "name", Address: "fullAddress",
    Pg2FacilityName: "name", Pg2Address: "fullAddress",
  },
  lic613c: { Facility: "name", FacilityAdd: "fullAddress" },
  lic622: { "facility name1": "name", "facility number1": "license", administrator: "admin" },
  lic405: { "FACILITY NUMBER:": "license" },
  lic500: { "facility number": "license", "facility type": "type" },
  lic501: { "facility1 pg1": "name" },
  lic9020: { "fnumber 1": "license" },
  admission_agreement: { "facility 1 pg 1": "name", "facility # pg 1": "license" },
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function slotValues(f: FacilityIdentity): Record<Slot, string> {
  const name = titleCase(f.name);
  const address = f.street_address ? titleCase(f.street_address) : "";
  const cityStateZip = [f.city ? titleCase(f.city) : "", "CA", f.zip ?? ""]
    .filter(Boolean).join(", ").replace(", CA,", ", CA");
  const digits = (f.phone ?? "").replace(/\D/g, "");
  return {
    name,
    license: f.license_number ?? "",
    address,
    cityStateZip: [f.city ? titleCase(f.city) : "", `CA ${f.zip ?? ""}`.trim()].filter(Boolean).join(", "),
    fullAddress: [address, cityStateZip].filter(Boolean).join(", "),
    phone: f.phone ?? "",
    areaCode: digits.slice(0, 3),
    phoneLocal: digits.length >= 10 ? `${digits.slice(3, 6)}-${digits.slice(6, 10)}` : "",
    admin: f.administrator ? titleCase(f.administrator) : "",
    licensee: f.licensee ? titleCase(f.licensee) : "",
    type: "RCFE",
  };
}

/**
 * Fill the mapped identity fields of `pdfBytes` (a repaired public/forms
 * copy). Returns the saved PDF with fields still editable. Fields that no
 * longer exist are skipped.
 */
export async function prefillForm(
  formKey: string,
  pdfBytes: Uint8Array | ArrayBuffer,
  facility: FacilityIdentity,
): Promise<{ bytes: Uint8Array; filled: number }> {
  const doc = await PDFDocument.load(pdfBytes);
  const map = PREFILL_MAPS[formKey];
  let filled = 0;
  if (map) {
    const values = slotValues(facility);
    const form = doc.getForm();
    for (const [fieldName, slot] of Object.entries(map)) {
      const value = values[slot];
      if (!value) continue;
      try {
        const field = form.getTextField(fieldName);
        field.setText(value);
        filled++;
      } catch { /* field renamed or missing in a newer revision — skip */ }
    }
    try { form.updateFieldAppearances(); } catch { /* best effort */ }
  }
  return { bytes: await doc.save(), filled };
}
