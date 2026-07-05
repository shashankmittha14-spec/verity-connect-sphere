import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CheckClaimInput = z.object({
  claim_text: z.string().min(3).max(5000),
  platform: z.string().max(120).nullish(),
  compact: z.boolean().optional(),
});

export const runCheckClaim = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CheckClaimInput.parse(input))
  .handler(async ({ data }) => {
    const { checkClaim, toCompact } = await import("./checks.server");
    const row = await checkClaim({
      claim_text: data.claim_text,
      platform: data.platform ?? null,
      source_channel: "web",
    });
    return data.compact ? { compact: toCompact(row) } : { row };
  });

const GetCheckInput = z.object({ id: z.string().uuid() });

export const fetchCheck = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => GetCheckInput.parse(input))
  .handler(async ({ data }) => {
    const { getCheckById } = await import("./checks.server");
    const row = await getCheckById(data.id);
    return { row };
  });
