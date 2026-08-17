ALTER TABLE public.import_batches
	ADD COLUMN IF NOT EXISTS total_fatura_origem numeric(12, 2),
	ADD COLUMN IF NOT EXISTS tipo_total_fatura_origem text,
	ADD COLUMN IF NOT EXISTS override_total_fatura_origem boolean NOT NULL DEFAULT false;
