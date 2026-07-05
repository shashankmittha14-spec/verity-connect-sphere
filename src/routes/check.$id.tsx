import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { fetchCheck } from "@/lib/checks.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { VerdictBadge } from "@/components/VerdictBadge";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import type { Verdict } from "@/lib/checks.server";

const checkQuery = (id: string) =>
  queryOptions({
    queryKey: ["check", id],
    queryFn: async () => {
      const { row } = await fetchCheck({ data: { id } });
      if (!row) throw notFound();
      return row;
    },
  });

export const Route = createFileRoute("/check/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(checkQuery(params.id)),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Check not found — TruthCheck" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const short = loaderData.claim_text.slice(0, 120);
    return {
      meta: [
        { title: `Fact-check: ${short} — TruthCheck` },
        { name: "description", content: loaderData.short_reasoning },
        { property: "og:title", content: `Fact-check: ${short}` },
        { property: "og:description", content: loaderData.short_reasoning },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CheckDetail,
  errorComponent: CheckError,
  notFoundComponent: CheckNotFound,
});

function CheckDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(checkQuery(id));

  const created = new Date(data.created_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const sources = Array.isArray(data.sources) ? (data.sources as Array<{ title: string; url: string }>) : [];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> New check
        </Link>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <VerdictBadge verdict={data.verdict as Verdict} size="lg" />
            <span className="text-sm text-muted-foreground">
              Confidence <span className="font-semibold text-foreground">{data.correctness}%</span>
            </span>
            <span className="ml-auto text-xs text-muted-foreground">via {data.source_channel}</span>
          </div>

          <blockquote className="mb-6 border-l-4 border-accent pl-4 font-display text-2xl leading-snug text-foreground">
            “{data.claim_text}”
          </blockquote>

          <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${data.correctness}%` }} />
          </div>

          <section>
            <h2 className="text-lg">Analysis</h2>
            <div className="mt-2 space-y-3 whitespace-pre-wrap text-pretty leading-relaxed text-foreground/90">
              {data.full_reasoning}
            </div>
          </section>

          {sources.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg">Sources</h2>
              <ul className="mt-3 space-y-2">
                {sources.map((s, i) => (
                  <li key={`${s.url}-${i}`}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-start gap-2 text-sm text-foreground underline-offset-4 hover:underline"
                    >
                      <ExternalLink className="mt-0.5 size-3.5 text-muted-foreground transition-colors group-hover:text-accent" />
                      <span>
                        <span className="font-medium">{s.title}</span>
                        <span className="ml-2 text-muted-foreground">{new URL(s.url).hostname.replace(/^www\./, "")}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="mt-8 border-t border-border/60 pt-4 text-xs text-muted-foreground">
            Checked {created}
          </footer>
        </article>
      </main>
    </div>
  );
}

function CheckNotFound() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-3xl">Check not found</h1>
        <p className="mt-2 text-muted-foreground">This fact-check doesn't exist or was removed.</p>
        <Link to="/" className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90">
          Run a new check
        </Link>
      </div>
    </div>
  );
}

function CheckError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "check_detail" });
  }, [error]);
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl">Couldn't load this check</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          <RefreshCw className="size-3.5" /> Try again
        </button>
      </div>
    </div>
  );
}
