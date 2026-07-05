import { Check, X, HelpCircle } from "lucide-react";
import type { Verdict } from "@/lib/checks.server";

const CONFIG: Record<Verdict, { label: string; icon: typeof Check; bg: string; fg: string }> = {
  likely_true: {
    label: "Likely True",
    icon: Check,
    bg: "bg-[var(--color-verdict-true)]",
    fg: "text-[var(--color-verdict-true-foreground)]",
  },
  likely_fake: {
    label: "Likely Fake",
    icon: X,
    bg: "bg-[var(--color-verdict-fake)]",
    fg: "text-[var(--color-verdict-fake-foreground)]",
  },
  unverified: {
    label: "Unverified",
    icon: HelpCircle,
    bg: "bg-[var(--color-verdict-unverified)]",
    fg: "text-[var(--color-verdict-unverified-foreground)]",
  },
};

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" | "lg" }) {
  const cfg = CONFIG[verdict];
  const Icon = cfg.icon;
  const sizing =
    size === "lg"
      ? "text-sm px-3.5 py-1.5"
      : size === "sm"
        ? "text-[10px] px-2 py-0.5"
        : "text-xs px-3 py-1";
  return (
    <span
      className={`verdict-badge ${cfg.bg} ${cfg.fg} ${sizing}`}
      data-verdict={verdict}
    >
      <Icon className={size === "lg" ? "size-4" : "size-3"} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}
