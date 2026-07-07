/**
 * Brave-style facility descriptions: one or two factual sentences in the
 * shape of a business-profile blurb ("A licensed six-bed residential care
 * home in Reseda, California. Compassionate 24-hour care, home-cooked meals,
 * CalAIM & private pay.").
 *
 * Preferred path (ANTHROPIC_API_KEY set): Claude Haiku synthesizes from the
 * facility's own website text plus our licensing facts, constrained to only
 * those inputs. Fallback: the best of the site's own meta / og / JSON-LD
 * descriptions, quality-filtered. Either way the output is validated —
 * length-bounded, no URLs/phones/emails — and rejected rather than stored
 * when it fails.
 */

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

export type DescribeInput = {
  name: string;            // title-cased display name
  city: string | null;
  capacity: number | null;
  featureLabels: string[]; // human labels from the care taxonomy extraction
  siteText: string;        // harvested page text
  metaCandidates: string[]; // meta description / og:description / JSON-LD description
};

const GENERIC =
  /^(welcome to|home ?page|coming soon|under construction|this site|website of|just another)/i;
const CONTACTY = /https?:\/\/|www\.|@|\(\d{3}\)|\d{3}[-.\s]\d{3}[-.\s]\d{4}/;

function validate(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 40 || t.length > 300) return null;
  if (CONTACTY.test(t)) return null;
  if (GENERIC.test(t)) return null;
  return t;
}

function bestMetaCandidate(input: DescribeInput): string | null {
  for (const raw of input.metaCandidates) {
    const t = validate(raw);
    if (t) return t;
  }
  return null;
}

async function synthesize(input: DescribeInput): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;
  const beds = input.capacity ? `${input.capacity}-bed` : "";
  const facts = [
    `Name: ${input.name}`,
    `Licensed residential care facility for the elderly (RCFE)${beds ? `, ${beds}` : ""}`,
    input.city ? `City: ${input.city}, California` : null,
    input.featureLabels.length ? `Detected offerings: ${input.featureLabels.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{
          role: "user",
          content:
            `Write a 1-2 sentence description of a senior care facility for a directory listing.\n\n` +
            `Style example (match this register): "A licensed six-bed residential care home in Reseda, ` +
            `California. Compassionate 24-hour care, home-cooked meals, and private pay."\n\n` +
            `Rules: use ONLY facts present in the record or website text below — no invented amenities, ` +
            `awards, or years in business. No phone numbers, URLs, emails, or prices. No superlatives ` +
            `("best", "premier") unless quoted from their site. 220 characters maximum. ` +
            `Reply with ONLY the description text.\n\n` +
            `RECORD:\n${facts}\n\nWEBSITE TEXT:\n${input.siteText.slice(0, 6000)}`,
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.log(`      describe HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { content?: { text?: string }[] };
    const text = data.content?.map((c) => c.text ?? "").join("").trim() ?? "";
    return validate(text);
  } catch (e) {
    console.log(`      describe err: ${(e as Error).message.split("\n")[0]}`);
    return null;
  }
}

export async function describeFacility(
  input: DescribeInput,
): Promise<{ text: string; source: "ai" | "scrape" } | null> {
  const ai = await synthesize(input);
  if (ai) return { text: ai, source: "ai" };
  const meta = bestMetaCandidate(input);
  if (meta) return { text: meta, source: "scrape" };
  return null;
}
