
CREATE TABLE public.checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('likely_true','likely_fake','unverified')),
  correctness integer NOT NULL CHECK (correctness BETWEEN 0 AND 100),
  short_reasoning text NOT NULL,
  full_reasoning text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  platform text,
  source_channel text NOT NULL DEFAULT 'web' CHECK (source_channel IN ('web','extension','whatsapp')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checks_created_at_idx ON public.checks (created_at DESC);
CREATE INDEX checks_source_channel_idx ON public.checks (source_channel);
CREATE INDEX checks_claim_text_lower_idx ON public.checks (lower(claim_text));

GRANT SELECT, INSERT ON public.checks TO anon;
GRANT SELECT, INSERT ON public.checks TO authenticated;
GRANT ALL ON public.checks TO service_role;

ALTER TABLE public.checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read checks"
  ON public.checks FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert checks"
  ON public.checks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
