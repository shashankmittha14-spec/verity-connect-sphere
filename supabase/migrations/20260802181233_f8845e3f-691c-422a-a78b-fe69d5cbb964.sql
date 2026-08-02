ALTER TABLE public.checks
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS simple_explanation text;

ALTER TABLE public.checks
  ADD CONSTRAINT checks_source_type_check CHECK (source_type IN ('text','screenshot','url'));