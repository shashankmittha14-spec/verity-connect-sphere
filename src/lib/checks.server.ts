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
Given a claim, evaluate whether it is factually accurate.

Return JSON with:
- verdict: "likely_true" | "likely_fake" | "unverified"
- correctness: integer 0-100 (your confidence in the verdict)
- short_reasoning: 1-2 sentences, under 200 characters, plain language
- full_reasoning: 2-4 paragraphs explaining the evidence and reasoning
- sources: array of {title, url} — 1-4 credible references (news outlets, official bodies, primary sources). Use real, well-known URLs (bbc.com, reuters.com, apnews.com, who.int, snopes.com, factcheck.org, etc.). If you cannot recall a specific URL, use the outlet's homepage rather than fabricating a path.

Guidelines:
- "likely_true" only if the claim is well-supported by mainstream evidence
- "likely_fake" for claims contradicted by credible sources
- "unverified" for opinions, unfalsifiable statements, or when evidence is genuinely mixed
- Be concise. Do NOT hedge unnecessarily.`;

export async function checkClaim(input: CheckClaimInput): Promise<CheckRow> {
  const claim = input.claim_text.trim();
  if (claim.length < 3) throw new Error("Claim too short");
  if (claim.length > 5000) throw new Error("Claim too long (max 5000 chars)");

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-2.5-flash");

  let parsed: z.infer<typeof AiResultSchema>;
  try {
    const { output } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: `Claim to evaluate:\n\n"""${claim}"""`,
      output: Output.object({ schema: AiResultSchema }),
    });
    parsed = output;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      // Fallback: emit an unverified verdict rather than blow up the request.
      parsed = {
        verdict: "unverified",
        correctness: 0,
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
