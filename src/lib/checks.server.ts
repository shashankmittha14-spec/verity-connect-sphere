// Core, reusable claim-checking logic.
// Called by:
//   - createServerFn wrappers in src/lib/checks.functions.ts (web app)
//   - public HTTP route /api/public/check (extension)
//   - public HTTP route /api/public/whatsapp-webhook (WhatsApp)
// All three write to the same `checks` table, differentiated by source_channel.

import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const VerdictEnum = z.enum(["likely_true", "likely_fake", "unverified"]);

const AiResultSchema = z.object({
  verdict: VerdictEnum,
  correctness: z.number().int().min(0).max(100),
  short_reasoning: z.string(),
  full_reasoning: z.string(),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
    }),
  ),
});

export type CheckRow = Database["public"]["Tables"]["checks"]["Row"];
export type Verdict = z.infer<typeof VerdictEnum>;
export type SourceChannel = "web" | "extension" | "whatsapp";

export interface CheckClaimInput {
  claim_text: string;
  platform?: string | null;
  source_channel?: SourceChannel;
}

export interface CompactCheckResult {
  id: string;
  verdict: Verdict;
  correctness: number;
  short_reasoning: string;
}

function serverSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const SYSTEM_PROMPT = `You are TruthCheck, a rigorous fact-checking assistant.
You will receive a user claim, and — when the claim contains a URL — the actual fetched content of that page (title, description, body excerpt, HTTP status).

Your job is to genuinely analyze whether the claim (or the linked article's central assertion) is factually accurate, and report BOTH a truth percentage and a fake percentage that reflect your honest assessment.

Return JSON with:
- verdict: "likely_true" | "likely_fake" | "unverified"
- correctness: integer 0-100. This is the percentage that the claim IS TRUE. Fake percentage = 100 - correctness. Pick the number honestly — do not default to extremes.
    * likely_true => correctness >= 60
    * likely_fake => correctness <= 40
    * unverified => 40 < correctness < 60
- short_reasoning: 1-2 sentences, under 200 characters, plain language
- full_reasoning: 2-4 paragraphs explaining the evidence, referencing the fetched page content when provided
- sources: array of {title, url} — 1-4 credible references (real news outlets, official bodies, primary sources). Use real, well-known URLs. If a specific URL is uncertain, use the outlet's homepage rather than fabricating a path.

Rules when the claim is a URL:
- DO NOT judge the article by the URL string alone. If page content is provided, evaluate the article's actual claims.
- If the page returned 200 OK from a reputable outlet (cnn.com, bbc.com, reuters.com, apnews.com, nytimes.com, theguardian.com, aljazeera.com, npr.org, etc.) and the content matches the URL's implied topic, that is strong evidence the article is REAL — lean toward likely_true unless the article's contents are themselves fabricated.
- If fetch failed (404, blocked, or missing), say so in full_reasoning and mark unverified rather than guessing fake.
- Do NOT penalize an article just because its date is close to today; news is published daily.

Rules for plain text claims:
- likely_true only if well-supported by mainstream evidence
- likely_fake only if contradicted by credible sources
- unverified for opinions, unfalsifiable statements, or genuinely mixed evidence

Be honest with the percentage. A confidently true CNN article about a real event should score ~90+. A well-known hoax should score ~5-15. Only sit in the 40-60 band when the evidence is truly mixed.`;

interface FetchedPage {
  url: string;
  status: number;
  ok: boolean;
  title?: string;
  description?: string;
  excerpt?: string;
  error?: string;
}

function extractFirstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0] : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageContext(url: string): Promise<FetchedPage> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; TruthCheckBot/1.0; +https://verity-connect-sphere.lovable.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);
    const html = await res.text();
    const title = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1]?.trim();
    const desc =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,500})["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,500})["']/i)?.[1];
    const bodyMatch = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
    const excerpt = stripHtml(bodyMatch).slice(0, 3500);
    return { url: res.url, status: res.status, ok: res.ok, title, description: desc, excerpt };
  } catch (err) {
    return { url, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkClaim(input: CheckClaimInput): Promise<CheckRow> {
  const claim = input.claim_text.trim();
  if (claim.length < 3) throw new Error("Claim too short");
  if (claim.length > 5000) throw new Error("Claim too long (max 5000 chars)");

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-2.5-flash");

  const linkedUrl = extractFirstUrl(claim);
  const page = linkedUrl ? await fetchPageContext(linkedUrl) : null;

  let contextBlock = "";
  if (page) {
    if (page.ok) {
      contextBlock = `\n\nFetched page content for the URL in the claim:\n- Final URL: ${page.url}\n- HTTP status: ${page.status}\n- Title: ${page.title ?? "(none)"}\n- Description: ${page.description ?? "(none)"}\n- Body excerpt:\n"""${page.excerpt ?? ""}"""`;
    } else {
      contextBlock = `\n\nAttempted to fetch the URL in the claim but it failed:\n- URL: ${page.url}\n- HTTP status: ${page.status}\n- Error: ${page.error ?? "non-2xx response"}\nTreat this as inability to verify the article content — do not assume fake solely because fetch failed.`;
    }
  }

  let parsed: z.infer<typeof AiResultSchema>;
  try {
    const { output } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `Claim to evaluate:\n\n"""${claim}"""${contextBlock}`,
      output: Output.object({ schema: AiResultSchema }),
    });
    parsed = output;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      // Fallback: emit an unverified verdict rather than blow up the request.
      parsed = {
        verdict: "unverified",
        correctness: 50,
        short_reasoning: "The fact-checker could not produce a structured verdict.",
        full_reasoning:
          "The AI model returned a response that could not be parsed. Please rephrase the claim and try again.",
        sources: [],
      };
    } else {
      throw err;
    }
  }


  // Clamp/normalize
  const correctness = Math.max(0, Math.min(100, Math.round(parsed.correctness)));
  const sources = parsed.sources.slice(0, 4);

  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("checks")
    .insert({
      claim_text: claim,
      verdict: parsed.verdict,
      correctness,
      short_reasoning: parsed.short_reasoning.slice(0, 500),
      full_reasoning: parsed.full_reasoning,
      sources,
      platform: input.platform ?? null,
      source_channel: input.source_channel ?? "web",
    })
    .select("*")
    .single();

  if (error) throw new Error(`DB insert failed: ${error.message}`);
  return data;
}

export function toCompact(row: CheckRow): CompactCheckResult {
  return {
    id: row.id,
    verdict: row.verdict as Verdict,
    correctness: row.correctness,
    short_reasoning: row.short_reasoning,
  };
}

export async function getCheckById(id: string): Promise<CheckRow | null> {
  const supabase = serverSupabase();
  const { data, error } = await supabase.from("checks").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
