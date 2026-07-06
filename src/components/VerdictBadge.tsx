import { Check, AlertTriangle, HelpCircle } from "lucide-react";
import type { Verdict } from "@/lib/checks.server";

const CONFIG: Record<Verdict, { suffix: string; icon: typeof Check; classes: string }> = {
  likely_true: {
    suffix: "True",
    icon: Check,
    classes: "bg-[var(--color-verdict-true)]/12 text-[var(--color-verdict-true)] ring-1 ring-inset ring-[var(--color-verdict-true)]/30",
  },
  likely_fake: {
    suffix: "Fake",
    icon: AlertTriangle,
    classes: "bg-[var(--color-verdict-fake)]/10 text-[var(--color-verdict-fake)] ring-1 ring-inset ring-[var(--color-verdict-fake)]/25",
  },
  unverified: {
    suffix: "Unverified",
    icon: HelpCircle,
    classes: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  },
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
  const cfg = CONFIG[verdict];
  const Icon = cfg.icon;
  const sizing =
    size === "lg"
      ? "text-sm px-3.5 py-1.5"
      : size === "sm"
        ? "text-[10px] px-2 py-0.5"
        : "text-xs px-3 py-1";

  const label =
    verdict === "unverified"
      ? "Unverified"
      : typeof correctness === "number"
        ? `${Math.round(correctness)}% ${cfg.suffix}`
        : cfg.suffix;

  return (
    <span className={`verdict-badge ${cfg.classes} ${sizing}`} data-verdict={verdict}>
      <Icon className={size === "lg" ? "size-4" : "size-3"} strokeWidth={2.5} />
      {label}
    </span>
  );
}
