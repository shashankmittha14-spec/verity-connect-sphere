import { Check, AlertTriangle, HelpCircle } from "lucide-react";
import type { Verdict } from "@/lib/checks.server";

const ICON: Record<Verdict, typeof Check> = {
  likely_true: Check,
  likely_fake: AlertTriangle,
  unverified: HelpCircle,
};

export function VerdictBadge({
  verdict,
  correctness,
  size = "md",
}: {
  verdict: Verdict;
  correctness?: number;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = ICON[verdict];
  const sizing =
    size === "lg"
      ? "text-sm px-3.5 py-1.5"
      : size === "sm"
        ? "text-[10px] px-2 py-0.5"
        : "text-xs px-3 py-1";

  if (verdict === "unverified" || typeof correctness !== "number") {
    return (
      <span
        className={`verdict-badge bg-muted text-muted-foreground ring-1 ring-inset ring-border ${sizing}`}
        data-verdict={verdict}
      >
        <Icon className={size === "lg" ? "size-4" : "size-3"} strokeWidth={2.5} />
        Unverified
      </span>
    );
  }

  const truthPct = verdict === "likely_true" ? Math.round(correctness) : 100 - Math.round(correctness);
  const fakePct = 100 - truthPct;

  const iconSize = size === "lg" ? "size-4" : "size-3";

  return (
    <span
      className={`verdict-badge overflow-hidden !p-0 ring-1 ring-inset ring-border ${sizing.replace(/px-\S+\s?/, "").replace(/py-\S+\s?/, "")}`}
      data-verdict={verdict}
    >
      <span
        className={`flex items-center gap-1.5 ${size === "lg" ? "px-3 py-1.5" : "px-2.5 py-1"} bg-[var(--color-verdict-true)]/12 text-[var(--color-verdict-true)]`}
      >
        <Check className={iconSize} strokeWidth={2.5} />
        <span className="font-semibold tabular-nums">{truthPct}%</span>
        <span className="opacity-80">True</span>
      </span>
      <span
        className={`flex items-center gap-1.5 border-l border-border ${size === "lg" ? "px-3 py-1.5" : "px-2.5 py-1"} bg-[var(--color-verdict-fake)]/10 text-[var(--color-verdict-fake)]`}
      >
        <AlertTriangle className={iconSize} strokeWidth={2.5} />
        <span className="font-semibold tabular-nums">{fakePct}%</span>
        <span className="opacity-80">Fake</span>
      </span>
    </span>
  );
}
