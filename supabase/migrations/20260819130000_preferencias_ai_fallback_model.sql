ALTER TABLE public.preferencias_usuario
	ADD COLUMN IF NOT EXISTS ai_fallback_model_id text;
