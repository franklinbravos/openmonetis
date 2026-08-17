ALTER TABLE public.import_batches
	ADD COLUMN IF NOT EXISTS linhas_arquivo_origem jsonb;
