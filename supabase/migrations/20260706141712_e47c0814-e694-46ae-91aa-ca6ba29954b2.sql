DROP POLICY IF EXISTS "Anyone can insert checks" ON public.checks;

CREATE POLICY "Anyone can insert valid checks"
ON public.checks
FOR INSERT
TO anon, authenticated
WITH CHECK (
  verdict IN ('likely_true', 'likely_fake', 'unverified')
  AND correctness BETWEEN 0 AND 100
  AND char_length(claim_text) BETWEEN 3 AND 5000
  AND char_length(short_reasoning) <= 500
  AND char_length(full_reasoning) <= 20000
  AND source_channel IN ('web', 'extension', 'whatsapp')
  AND jsonb_typeof(sources) = 'array'
);
