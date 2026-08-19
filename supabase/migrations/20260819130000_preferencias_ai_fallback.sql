-- Modelo de reserva da análise com IA: habilitação, modelo e credencial própria
-- (pode ser outra chave do mesmo provedor, quando a cota da principal esgota).
ALTER TABLE public.preferencias_usuario
	ADD COLUMN IF NOT EXISTS ai_fallback_settings jsonb;
