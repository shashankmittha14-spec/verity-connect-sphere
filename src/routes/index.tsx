import { createFileRoute, useNavigate, useServerFn } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { runCheckClaim } from "@/lib/checks.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { VerdictBadge } from "@/components/VerdictBadge";
import type { Verdict } from "@/lib/checks.server";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TruthCheck — Fact-check any claim in seconds" },
      {
        name: "description",
        content:
          "Paste a suspicious claim, headline, or forwarded message. TruthCheck returns an AI-verified verdict, confidence score, and credible sources.",
      },
      { property: "og:title", content: "TruthCheck — Fact-check any claim in seconds" },
      {
        property: "og:description",
        content:
          "AI-powered fact-checking for headlines, social posts, and forwarded messages. Verdict, confidence, sources — in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type CompactResult = {
  id: string;
  verdict: Verdict;
  correctness: number;
  short_reasoning: string;
};

function Index() {
  const runCheck = useServerFn(runCheckClaim);
  const navigate = useNavigate();
  const [claim, setClaim] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompactResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (claim.trim().length < 3) {
      setError("Please enter a claim of at least 3 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await runCheck({ data: { claim_text: claim, compact: true } });
      if (res.compact) setResult(res.compact);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-14 sm:pt-20">
        <section className="text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" /> AI-verified fact-checks
          </div>
          <h1 className="text-balance text-4xl leading-tight sm:text-5xl md:text-6xl">
            Is that headline<br />
            <span className="italic text-accent">actually</span> true?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
            Paste any claim, viral post, or forwarded message. TruthCheck returns a verdict,
            a confidence score, and credible sources — in seconds.
          </p>
        </section>

        <form onSubmit={onSubmit} className="mt-10 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <label htmlFor="claim" className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            The claim
          </label>
          <textarea
            id="claim"
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="e.g. 'Drinking hot water cures COVID-19'"
            rows={4}
            maxLength={5000}
            disabled={loading}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-base outline-none transition placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">{claim.length}/5000</span>
            <button
              type="submit"
              disabled={loading || claim.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {loading ? "Checking…" : "Check claim"}
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}
        </form>

        {result && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <VerdictBadge verdict={result.verdict} size="lg" />
              <span className="text-sm text-muted-foreground">
                Confidence <span className="font-semibold text-foreground">{result.correctness}%</span>
              </span>
            </div>
            <p className="mt-4 text-pretty text-base leading-relaxed">{result.short_reasoning}</p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${result.correctness}%` }}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={() => navigate({ to: "/check/$id", params: { id: result.id } })}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                View full analysis
              </button>
              <button
                onClick={() => {
                  setResult(null);
                  setClaim("");
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3.5 py-2 text-sm hover:bg-muted"
              >
                Check another
              </button>
            </div>
          </div>
        )}

        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Cited sources", body: "Every verdict comes with credible references." },
            { icon: Sparkles, title: "Under 10 seconds", body: "AI reasoning without the wait." },
            { icon: Search, title: "Any language, any claim", body: "News, social posts, WhatsApp forwards." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border/70 bg-card/60 p-4">
              <Icon className="size-5 text-accent" />
              <h3 className="mt-3 text-lg">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
