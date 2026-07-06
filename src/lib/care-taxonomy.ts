/**
 * Canonical care & amenities taxonomy for RCFE listings.
 *
 * Facilities store an array of feature KEYS in facilities.amenities (jsonb).
 * Each feature carries the regex used to detect it in a facility's own
 * website text (photo-pipeline harvest); owners can override the detected
 * set with checkboxes on their manage page (amenities_source = 'owner',
 * which the pipeline then never overwrites).
 *
 * Keys are stable identifiers — renaming one orphans stored data.
 */

export type CareFeature = { key: string; label: string; pattern: RegExp };
export type CareGroup = { key: string; label: string; features: CareFeature[] };

export const CARE_TAXONOMY: CareGroup[] = [
  {
    key: "care",
    label: "Care & support",
    features: [
      { key: "memory_care", label: "Memory care", pattern: /memory care|dementia|alzheim/i },
      { key: "hospice_care", label: "Hospice care", pattern: /hospice/i },
      { key: "respite_care", label: "Respite & short-term stays", pattern: /respite|short.?term stay/i },
      { key: "non_ambulatory", label: "Non-ambulatory care", pattern: /non.?ambulatory/i },
      { key: "bedridden_care", label: "Bedridden care", pattern: /bed.?ridden|bed.?bound/i },
      { key: "incontinence_care", label: "Incontinence care", pattern: /incontinen/i },
      { key: "diabetes_care", label: "Diabetes care", pattern: /diabet|insulin/i },
      { key: "medication_management", label: "Medication management", pattern: /medication (management|administration|assistance|reminder)|manage[a-z]*\s+medication/i },
      { key: "mobility_assistance", label: "Mobility & transfer assistance", pattern: /mobility assist|transfer assist|assist[a-z]* with (walking|transfers|ambulation)/i },
      { key: "personal_care", label: "Bathing, dressing & grooming", pattern: /bathing|dressing|grooming|personal hygiene|activities of daily living|\badls?\b/i },
      { key: "24_hour_care", label: "24-hour care & supervision", pattern: /\b24\s?\/\s?7\b|\b24[- ]?(hours?|hrs?)\b|around.?the.?clock|round.?the.?clock/i },
      { key: "awake_night_staff", label: "Awake overnight staff", pattern: /awake (night|overnight|staff)|staff awake|overnight supervision/i },
      { key: "nurse_on_staff", label: "Nurse on staff (RN/LVN)", pattern: /\brn\b|\blvn\b|registered nurse|vocational nurse|licensed nurse/i },
      { key: "visiting_physician", label: "Visiting physician", pattern: /visiting (physician|doctor|podiatrist|nurse)|physician[a-z ]{0,15}(visit|house call)|doctor visits/i },
      { key: "therapy_services", label: "Physical, occupational & speech therapy", pattern: /physical therap|occupational therap|speech therap/i },
    ],
  },
  {
    key: "rooms",
    label: "Rooms & building",
    features: [
      { key: "private_rooms", label: "Private rooms", pattern: /private (room|bedroom|suite)/i },
      { key: "shared_rooms", label: "Shared rooms", pattern: /(shared|semi.?private|companion) (room|bedroom|suite)/i },
      { key: "furnished_rooms", label: "Furnished rooms", pattern: /furnish/i },
      { key: "wheelchair_accessible", label: "Wheelchair accessible", pattern: /wheelchair (accessible|ramp|friendly)|handicap access|ada (accessible|compliant)|barrier.?free|accessible (bathroom|shower)/i },
      { key: "single_story", label: "Single-story home", pattern: /single.?story|one.?story|single.?level/i },
      { key: "air_conditioning", label: "Air conditioning", pattern: /air.?condition|central air|climate control/i },
      { key: "emergency_call_system", label: "Emergency call system", pattern: /emergency (call|response|alert)|call (button|system)|life alert/i },
      { key: "housekeeping", label: "Housekeeping & laundry", pattern: /housekeeping|laundry|linen service|cleaning service/i },
    ],
  },
  {
    key: "dining",
    label: "Dining",
    features: [
      { key: "home_cooked_meals", label: "Home-cooked meals", pattern: /home.?(cooked|made) meal|freshly (cooked|prepared)|home.?cooking/i },
      { key: "cafeteria_style_meals", label: "Cafeteria-style meals", pattern: /cafeteria/i },
      { key: "restaurant_style_meals", label: "Restaurant-style meals", pattern: /restaurant.?style|chef.?prepared/i },
      { key: "special_diets", label: "Special diets accommodated", pattern: /special diet|dietary (need|restriction|requirement|preference)|diabetic (diet|meal)|low.?sodium|pureed|vegetarian|kosher/i },
    ],
  },
  {
    key: "lifestyle",
    label: "Activities & lifestyle",
    features: [
      { key: "daily_activities", label: "Daily activities program", pattern: /daily activit|activit(y|ies) program|social activit|group activit|recreational/i },
      { key: "exercise_programs", label: "Exercise & fitness", pattern: /exercise|fitness|yoga|stretching|tai chi/i },
      { key: "outdoor_space", label: "Garden & outdoor space", pattern: /garden|patio|courtyard|backyard|outdoor (space|area|seating)|landscaped/i },
      { key: "transportation", label: "Transportation", pattern: /transportation(?!\s?(coordination|arrang))|escort[a-z ]{0,20}appointment/i },
      { key: "outings", label: "Outings", pattern: /outings|field trips|shopping trips|excursions|day trips/i },
      { key: "transportation_coordination", label: "Transportation coordination", pattern: /transportation (coordination|arrangements?)|(coordinate|arrange)[a-z ]{0,20}transport/i },
      { key: "religious_services", label: "Religious services", pattern: /religious|church|worship|bible|spiritual (service|care)|\bmass\b/i },
      { key: "pet_friendly", label: "Pet friendly", pattern: /pet.?friendly|pets? (allowed|welcome|visits?)/i },
      { key: "tv_wifi", label: "Cable TV & WiFi", pattern: /cable tv|cable television|wi.?fi|wireless internet|smart tv/i },
      { key: "salon_services", label: "Salon & barber services", pattern: /salon|barber|hairdress|manicure|beautician/i },
      { key: "music_arts", label: "Music & arts", pattern: /music (therapy|program)|music (&|and) arts|arts (and|&) crafts|crafting|painting class/i },
    ],
  },
  {
    key: "payment",
    label: "Payment options",
    features: [
      { key: "private_pay", label: "Private pay", pattern: /private pay/i },
      { key: "ltc_insurance", label: "Long-term care insurance", pattern: /long.?term care insurance|ltc insurance/i },
      { key: "va_benefits", label: "VA benefits (Aid & Attendance)", pattern: /va (aid|benefit)|veterans? (aid|benefit|affairs)|aid (and|&) attendance/i },
      { key: "calaim_accepted", label: "CalAIM accepted", pattern: /\bcal.?aim\b/i },
      { key: "medi_cal_alw", label: "Assisted Living Waiver (Medi-Cal)", pattern: /assisted living waiver|\balw\b|medi[-\s]cal\b/i },
    ],
  },
];

const ALL_FEATURES = CARE_TAXONOMY.flatMap((g) => g.features);
const FEATURE_ORDER = new Map(ALL_FEATURES.map((f, i) => [f.key, i]));

/**
 * Table-stakes services every licensed RCFE provides — shown on every listing
 * and pre-checked in the owner editor, regardless of what the website says.
 * Owner-curated sets are taken verbatim (an owner can uncheck these).
 */
export const DEFAULT_FEATURES = [
  "medication_management",
  "24_hour_care",
  "personal_care",
  "housekeeping",
  "private_pay",
];

export function withDefaultFeatures(keys: string[], source: string | null): string[] {
  return source === "owner"
    ? sortCareFeatures(keys)
    : sortCareFeatures([...keys, ...DEFAULT_FEATURES]);
}

/** Scan free text (a facility's own website copy) for taxonomy features. */
export function extractCareFeatures(text: string): string[] {
  return ALL_FEATURES.filter((f) => f.pattern.test(text)).map((f) => f.key);
}

/** Group stored keys for display; unknown/legacy keys are dropped. */
export function groupCareFeatures(
  keys: string[],
): { key: string; label: string; features: { key: string; label: string }[] }[] {
  const have = new Set(keys);
  return CARE_TAXONOMY.map((g) => ({
    key: g.key,
    label: g.label,
    features: g.features.filter((f) => have.has(f.key)).map(({ key, label }) => ({ key, label })),
  })).filter((g) => g.features.length > 0);
}

/** Canonical ordering for persistence — keeps stored arrays stable. */
export function sortCareFeatures(keys: string[]): string[] {
  return [...new Set(keys)]
    .filter((k) => FEATURE_ORDER.has(k))
    .sort((a, b) => FEATURE_ORDER.get(a)! - FEATURE_ORDER.get(b)!);
}
