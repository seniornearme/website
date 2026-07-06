/**
 * CDSS/CCLD compliance library for California RCFEs (Title 22, Div 6, Ch 8).
 *
 * Every form links to the official CDSS PDF (each URL verified live). The
 * owner compliance tracker seeds from this library: `per` says whether an
 * item is tracked once per facility or per staff member / resident instance,
 * and `recurrence` drives due-date math ("once" items are done when completed;
 * "recurring" items roll due_date forward by `months`; "event" items are
 * reference-only — they're triggered by incidents, not a calendar).
 *
 * Keys are stable identifiers — renaming one orphans tracker rows.
 * This is a convenience reference, not legal advice; the disclaimer shown
 * alongside it points owners at CCLD for authoritative requirements.
 */

export type Recurrence =
  | { kind: "once" }
  | { kind: "recurring"; months: number }
  | { kind: "event" };

export type ComplianceForm = {
  key: string;
  code: string | null; // official form number, null for non-form requirements
  name: string;
  description: string;
  url: string | null; // official CDSS PDF (verified)
  per: "facility" | "staff" | "resident";
  recurrence: Recurrence;
};

export type ComplianceCategory = {
  key: string;
  label: string;
  per: "facility" | "staff" | "resident";
  forms: ComplianceForm[];
};

const CDSS = "https://www.cdss.ca.gov/cdssweb/entres/forms/English";
const CDSS_LC = "https://www.cdss.ca.gov/cdssweb/entres/forms/english";
const PORTALS = "https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/I-L";

export const COMPLIANCE_LIBRARY: ComplianceCategory[] = [
  {
    key: "facility",
    label: "Licensing & facility",
    per: "facility",
    forms: [
      {
        key: "lic200",
        code: "LIC 200",
        name: "Application for a Community Care Facility License",
        description:
          "Filed at initial licensure. Submit an updated application when ownership, location, or capacity changes.",
        url: `${CDSS}/LIC200.pdf`,
        per: "facility",
        recurrence: { kind: "once" },
      },
      {
        key: "lic999",
        code: "LIC 999",
        name: "Facility Sketch",
        description:
          "Floor plan and grounds sketch on file with CCLD. Update whenever the physical layout or room use changes.",
        url: `${CDSS}/LIC999.pdf`,
        per: "facility",
        recurrence: { kind: "once" },
      },
      {
        key: "lic500",
        code: "LIC 500",
        name: "Personnel Report",
        description:
          "Roster of all facility personnel. Keep current — update when staff are hired or leave.",
        url: `${CDSS}/LIC500.pdf`,
        per: "facility",
        recurrence: { kind: "once" },
      },
      {
        key: "lic610e",
        code: "LIC 610E",
        name: "Emergency Disaster Plan (RCFE)",
        description:
          "Written disaster and mass-casualty plan, posted in the facility. Review and update at least annually.",
        url: `${PORTALS}/LIC610E.pdf`,
        per: "facility",
        recurrence: { kind: "recurring", months: 12 },
      },
      {
        key: "disaster_drills",
        code: null,
        name: "Disaster & fire drills",
        description:
          "Conduct and document drills at least every six months (Title 22 §87212). Keep a dated log of each drill.",
        url: null,
        per: "facility",
        recurrence: { kind: "recurring", months: 6 },
      },
      {
        key: "annual_fee",
        code: null,
        name: "Annual licensing fee",
        description:
          "CCLD annual fee, due each year on your licensure anniversary. Late payment incurs penalties.",
        url: null,
        per: "facility",
        recurrence: { kind: "recurring", months: 12 },
      },
      {
        key: "fire_clearance",
        code: null,
        name: "Fire clearance",
        description:
          "Issued by the local fire authority. A new clearance is required before accepting non-ambulatory or bedridden residents, or when capacity changes.",
        url: null,
        per: "facility",
        recurrence: { kind: "event" },
      },
      {
        key: "theft_loss_policy",
        code: null,
        name: "Theft & loss policy and records",
        description:
          "Written policy and ongoing log for resident property theft or loss (Health & Safety Code §1569.153).",
        url: null,
        per: "facility",
        recurrence: { kind: "once" },
      },
    ],
  },
  {
    key: "staff",
    label: "Staff & personnel",
    per: "staff",
    forms: [
      {
        key: "lic501",
        code: "LIC 501",
        name: "Personnel Record",
        description: "Completed for each employee at hire and kept in their personnel file.",
        url: `${CDSS}/LIC501.pdf`,
        per: "staff",
        recurrence: { kind: "once" },
      },
      {
        key: "lic508",
        code: "LIC 508",
        name: "Criminal Record Statement",
        description: "Signed by each employee at hire, before working in the facility.",
        url: `${PORTALS}/LIC508.pdf`,
        per: "staff",
        recurrence: { kind: "once" },
      },
      {
        key: "lic9163",
        code: "LIC 9163",
        name: "Request for Live Scan Service",
        description:
          "Fingerprint background clearance for each employee, obtained before they work unsupervised.",
        url: `${PORTALS}/LIC9163.pdf`,
        per: "staff",
        recurrence: { kind: "once" },
      },
      {
        key: "lic503",
        code: "LIC 503",
        name: "Health Screening Report — Facility Personnel",
        description:
          "Health screening and TB clearance at hire; keep TB clearance current (retest every two years).",
        url: `${PORTALS}/LIC503.pdf`,
        per: "staff",
        recurrence: { kind: "recurring", months: 24 },
      },
      {
        key: "admin_cert",
        code: null,
        name: "Administrator certification",
        description:
          "The certified administrator's certificate renews every two years with 40 hours of continuing education.",
        url: "https://www.cdss.ca.gov/inforesources/community-care-licensing/administrator-certification-program",
        per: "staff",
        recurrence: { kind: "recurring", months: 24 },
      },
      {
        key: "first_aid_cpr",
        code: null,
        name: "First aid & CPR certification",
        description:
          "Keep staff first aid and CPR certifications current (most certifications renew every two years).",
        url: null,
        per: "staff",
        recurrence: { kind: "recurring", months: 24 },
      },
    ],
  },
  {
    key: "resident",
    label: "Resident records",
    per: "resident",
    forms: [
      {
        key: "lic601",
        code: "LIC 601",
        name: "Identification and Emergency Information",
        description: "Completed at admission for each resident and kept current.",
        url: `${CDSS_LC}/lic601.pdf`,
        per: "resident",
        recurrence: { kind: "once" },
      },
      {
        key: "lic602a",
        code: "LIC 602A",
        name: "Physician's Report (RCFE)",
        description:
          "Medical assessment completed by a physician before admission. Reassess annually and on significant change of condition.",
        url: `${PORTALS}/LIC602A.pdf`,
        per: "resident",
        recurrence: { kind: "recurring", months: 12 },
      },
      {
        key: "lic603",
        code: "LIC 603",
        name: "Preplacement Appraisal Information",
        description: "Completed before admission to document the prospective resident's needs.",
        url: `${CDSS}/LIC603.pdf`,
        per: "resident",
        recurrence: { kind: "once" },
      },
      {
        key: "lic603a",
        code: "LIC 603A",
        name: "Resident Appraisal",
        description:
          "Functional appraisal at admission; reappraise when the resident's condition changes.",
        url: `${CDSS}/LIC603A.pdf`,
        per: "resident",
        recurrence: { kind: "once" },
      },
      {
        key: "lic625",
        code: "LIC 625",
        name: "Appraisal / Needs and Services Plan",
        description:
          "Individual needs and services plan at admission. Review at least annually and whenever needs change.",
        url: `${PORTALS}/LIC625.pdf`,
        per: "resident",
        recurrence: { kind: "recurring", months: 12 },
      },
      {
        key: "admission_agreement",
        code: "LIC 604A",
        name: "Admission Agreement",
        description:
          "Signed admission agreement for each resident (LIC 604A is the CDSS guideline checklist for required contents).",
        url: `${CDSS}/LIC604A.pdf`,
        per: "resident",
        recurrence: { kind: "once" },
      },
      {
        key: "lic613c",
        code: "LIC 613C",
        name: "Personal Rights (RCFE)",
        description: "Personal rights acknowledgment signed by each resident at admission.",
        url: `${CDSS_LC}/lic613c.pdf`,
        per: "resident",
        recurrence: { kind: "once" },
      },
      {
        key: "lic621",
        code: "LIC 621",
        name: "Personal Property and Valuables",
        description: "Inventory of each resident's property and valuables, kept current.",
        url: `${CDSS}/LIC621.pdf`,
        per: "resident",
        recurrence: { kind: "once" },
      },
    ],
  },
  {
    key: "operations",
    label: "Incidents & ongoing operations",
    per: "facility",
    forms: [
      {
        key: "lic624",
        code: "LIC 624",
        name: "Unusual Incident / Injury Report",
        description:
          "Report incidents to CCLD by phone the next working day and submit the written report within 7 days.",
        url: `${CDSS}/LIC624.pdf`,
        per: "facility",
        recurrence: { kind: "event" },
      },
      {
        key: "lic622",
        code: "LIC 622",
        name: "Centrally Stored Medication and Destruction Record",
        description:
          "Maintained continuously for each resident's centrally stored medications.",
        url: `${CDSS}/LIC622.pdf`,
        per: "facility",
        recurrence: { kind: "event" },
      },
      {
        key: "menus_activities",
        code: null,
        name: "Menus & activity calendars",
        description:
          "Weekly menus and monthly activity calendars, planned in advance and posted in the facility.",
        url: null,
        per: "facility",
        recurrence: { kind: "event" },
      },
    ],
  },
];

export const ALL_COMPLIANCE_FORMS = COMPLIANCE_LIBRARY.flatMap((c) => c.forms);
export const COMPLIANCE_FORM_MAP = new Map(ALL_COMPLIANCE_FORMS.map((f) => [f.key, f]));

/** Items the tracker schedules (event-driven ones are reference-only). */
export const isTrackable = (f: ComplianceForm) => f.recurrence.kind !== "event";

/** Next due date after completing an item on `completed` (YYYY-MM-DD). */
export function nextDueDate(form: ComplianceForm, completed: string): string | null {
  if (form.recurrence.kind !== "recurring") return null;
  const d = new Date(`${completed}T00:00:00`);
  d.setMonth(d.getMonth() + form.recurrence.months);
  return d.toISOString().slice(0, 10);
}

export type DueState = "overdue" | "due_soon" | "ok" | "done" | "unscheduled";

/** Display state for a tracker row, `today` as YYYY-MM-DD. */
export function dueState(
  form: ComplianceForm,
  item: { last_completed: string | null; due_date: string | null },
  today: string,
): DueState {
  if (form.recurrence.kind === "once") return item.last_completed ? "done" : "unscheduled";
  if (!item.due_date) return "unscheduled";
  if (item.due_date < today) return "overdue";
  const soon = new Date(`${today}T00:00:00`);
  soon.setDate(soon.getDate() + 30);
  return item.due_date <= soon.toISOString().slice(0, 10) ? "due_soon" : "ok";
}
