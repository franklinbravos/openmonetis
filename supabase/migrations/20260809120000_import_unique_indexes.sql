-- Índices únicos usados pela importação e faturas (idempotente).

CREATE UNIQUE INDEX IF NOT EXISTS lancamentos_ofx_fit_id_user_id_idx
	ON public.lancamentos USING btree (user_id, ofx_fit_id)
	WHERE ofx_fit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS faturas_user_id_cartao_id_periodo_key
	ON public.faturas USING btree (user_id, cartao_id, periodo);
