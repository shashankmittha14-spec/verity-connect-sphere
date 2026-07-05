
# TruthCheck — Phased Build Plan

All three phases share one backend (Lovable Cloud / Supabase) and one core "check a claim" server function, so Phase 3 surfaces (extension, WhatsApp, analytics) plug into the same tables the web app writes to.

---

## Phase 1 — MVP Check Flow

**Goal:** paste a claim → get a verdict, correctness %, reasoning, sources. Persist every check.

### Backend
- Enable Lovable Cloud.
- Migration: create `checks` table.
  - `id uuid pk`, `claim_text text`, `verdict text` (`likely_true` | `likely_fake` | `unverified`), `correctness int` (0-100), `short_reasoning text`, `full_reasoning text`, `sources jsonb` (array of `{title, url}`), `platform text null`, `source_channel text` (default `'web'`, values `web|extension|whatsapp` — added now so Phase 3 doesn't require a schema change), `created_at timestamptz default now()`.
  - RLS on. Public `SELECT` policy (results are shareable). `INSERT` allowed to `anon` + `authenticated` (no auth in MVP). Grants for `anon`, `authenticated`, `service_role`.
- Core server function `checkClaim` in `src/lib/checks.functions.ts`:
  - Input: `{ claim_text, platform?, source_channel?, compact? }`.
  - Calls Lovable AI Gateway (`google/gemini-2.5-flash`) with a structured-JSON system prompt returning `{verdict, correctness, short_reasoning, full_reasoning, sources[]}`.
  - Inserts row via server publishable client (RLS allows anon insert), returns full row (or compact subset `{id, verdict, correctness, short_reasoning}` when `compact: true`).
  - This is the single "core claim-checking logic" reused by extension + WhatsApp.

### Frontend
- `/` — landing + check form (textarea, Check button, loading state, verdict card).
- `/check/$id` — public result page (full reasoning + sources), fetched via public server fn `getCheck`. Used as the "View full analysis" target for the extension.
- Design system pass in `src/styles.css` (trust/verification palette — deep navy + accent green/red, one distinctive font pair, no default purple).

---

## Phase 2 — Trending Feed + Community Feedback

### Backend
- Migration:
  - `feedback` table: `id`, `check_id fk`, `vote text` (`agree|disagree`), `voter_fingerprint text` (client-hashed anon id), `created_at`. Unique `(check_id, voter_fingerprint)`. RLS: public SELECT counts, INSERT open to anon.
  - `trending_claims` view (or materialized view refreshed via cron): groups recent `checks` by normalized claim text, counts occurrences in last 7 days, orders by count.
- Server fns:
  - `listTrending({ limit })` — public, reads the view.
  - `submitFeedback({ check_id, vote, fingerprint })` — public.
  - `getFeedbackCounts(check_id)` — public.

### Frontend
- `/trending` — list of top claims this week with verdict badges.
- On `/check/$id`: Agree / Disagree buttons + live counts. Fingerprint via `crypto.subtle` over a stable localStorage UUID.
- Nav links in root layout.

---

## Phase 3 — Extension + WhatsApp + Impact

### 3a. Public HTTP endpoint for external clients
- Server route `src/routes/api/public/check.ts` (POST) wrapping `checkClaim` with CORS headers permissive enough for `chrome-extension://*` and Twilio. Zod-validated body. This is what the extension and webhook call — server fns aren't suitable for external HTTP.
- `src/routes/api/public/check.$id.ts` (GET) for extension "compact result → fetch full later".

### 3b. Chrome Extension (`/extension` folder)
- Manifest V3. Permissions: `contextMenus`, `activeTab`, `storage`. Host permissions for the deployed API origin.
- `popup.html` + `popup.js` (vanilla — keeps bundle tiny and load <2s; no React build step needed for a popup this small). Textarea, Check button, compact result, "View full analysis" link → `${WEB_ORIGIN}/check/{id}`.
- `background.js` service worker: registers "Check with TruthCheck" context menu; on click POSTs selection to `/api/public/check` with detected `platform` + `source_channel: 'extension'`; forwards result to content script.
- `content-script.js`: renders shadow-DOM overlay/toast, auto-dismiss 10s or on outside click.
- Build script + `bun run zip:extension` producing `public/truthcheck-extension.zip` (nix `zip`), plus a download button in the web app footer using the fetch+blob pattern.
- `API_ORIGIN` configured via a single constant at top of `background.js` — points to `project--<id>.lovable.app` (stable URL).

### 3c. WhatsApp Webhook
- Twilio connector: recommend linking it, but ship working code that no-ops the outbound send when `TWILIO_*` env is missing (logs the intended message + a clear TODO).
- Migration: `whatsapp_sessions` (`phone_number text pk`, `last_check_id uuid fk`, `updated_at timestamptz`). RLS on, no public policies — service role only.
- Migration: `whatsapp_rate_limits` (`phone_number text`, `window_start timestamptz`, `count int`) — simple per-hour counter. (No standard rate-limit primitive exists; this is the ad-hoc approach the user asked for.)
- Server route `src/routes/api/public/whatsapp-webhook.ts` (POST, Twilio-form-encoded):
  - Verify Twilio signature (`X-Twilio-Signature`, HMAC-SHA1 over URL+sorted params) when `TWILIO_AUTH_TOKEN` is set; skip with warning when mocked.
  - Enforce 10/hour per `From`.
  - If body is `MORE` (case-insensitive) → look up `last_check_id`, reply with full reasoning + source URLs.
  - Otherwise → call `checkClaim` with `source_channel: 'whatsapp'`, upsert session, reply with the compact TruthCheck template.
  - Reply via Twilio REST (TwiML response is simplest — return `<Response><Message>...</Message></Response>` and Twilio sends it; no outbound API call needed, works without credentials for inbound testing).

### 3d. Impact Analytics
- Server fn `getImpactStats` — returns `{ total, by_channel: {web, extension, whatsapp}, top_claims: [...]}`. Cached in-memory in the server module with a 5-minute TTL keyed by hour (workers are stateless per-request but many requests hit the same instance; TTL is a soft cache, worst case DB is queried every few minutes per worker).
- `/impact` route (or footer section on `/`) — total count, simple CSS bar chart of channel breakdown (no chart lib needed for 3 bars), top-3 claims list.

---

## Sequencing / Deliverables per turn

To keep each turn reviewable I'll ship in this order, each as its own turn:

1. Enable Cloud + Phase 1 migration + `checkClaim` fn + landing/check UI + `/check/$id` + design system.
2. Phase 2 migrations + trending + feedback UI.
3. Phase 3a public HTTP endpoints + Impact analytics on the web app.
4. Phase 3b extension (folder + zip + download link).
5. Phase 3c WhatsApp webhook + sessions + rate limit + Twilio connector prompt.
6. End-to-end verification (Playwright pass on web flow, curl the public endpoint, simulate a Twilio POST).

## Technical notes

- **Reused core:** `checkClaim` in `src/lib/checks.functions.ts` is the single implementation. The public HTTP route and WhatsApp webhook both call it server-side (import the underlying helper, not the RPC stub).
- **AI:** Lovable AI Gateway, `google/gemini-2.5-flash`, structured JSON output. No user-supplied keys.
- **Auth:** none required for MVP — all writes are anon with RLS scoped to insert-only + public read. No PII stored beyond the WhatsApp `From` number (kept in `whatsapp_sessions` only, never returned by public endpoints).
- **CORS:** public API routes return `Access-Control-Allow-Origin: *` (safe — no cookies, no user data). OPTIONS handler included.
- **Rate limiting:** only added on the WhatsApp path because you explicitly asked for it; documented as ad-hoc per Lovable guidance.
- **Extension distribution:** unpacked-load instructions in the footer; `.zip` served from `/public`.

## Open question

The plan assumes you're OK with a vanilla-JS extension popup (no React build) for speed and simplicity. If you'd rather have React in the popup (Vite + CRX build), say so and I'll swap step 4 to a Vite-based extension build — adds ~30-60s of setup but matches the spec's "popup.tsx" wording literally.

Ready to start with turn 1 (Phase 1) once you approve.
