-- Tabelas de reconciliação (nomes em português no schema Drizzle).
-- Idempotente: seguro se o baseline Drizzle já tiver sido aplicado.

CREATE TABLE IF NOT EXISTS public.reconciliacao_sessoes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	user_id text NOT NULL,
	modo text NOT NULL,
	tipo_alvo text NOT NULL,
	alvo_id uuid NOT NULL,
	periodo text NOT NULL,
	nome_arquivo text NOT NULL,
	tipo_arquivo text NOT NULL,
	origem_extrato text,
	numero_conta_extrato text,
	periodo_extrato_de text,
	periodo_extrato_ate text,
	total_extrato numeric(12, 2) DEFAULT '0' NOT NULL,
	total_sistema numeric(12, 2),
	diferenca numeric(12, 2),
	status text DEFAULT 'draft' NOT NULL,
	qtd_linhas integer DEFAULT 0 NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reconciliacao_linhas (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	sessao_id uuid NOT NULL,
	user_id text NOT NULL,
	indice_linha integer NOT NULL,
	id_externo text,
	data_compra text NOT NULL,
	descricao text NOT NULL,
	valor numeric(12, 2) NOT NULL,
	tipo_transacao text NOT NULL,
	status_match text DEFAULT 'pending' NOT NULL,
	lancamento_id uuid,
	acao_sugerida text,
	valor_sugerido numeric(12, 2),
	confianca_match numeric(5, 2),
	motivo_match text,
	aplicado_em timestamptz,
	created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.reconciliacao_aliases (
	user_id text NOT NULL,
	chave_extrato text NOT NULL,
	nome_alvo text NOT NULL,
	categoria_id uuid,
	qtd_acertos integer DEFAULT 0 NOT NULL,
	origem text DEFAULT 'manual' NOT NULL,
	ultimo_uso timestamptz,
	created_at timestamptz DEFAULT now() NOT NULL,
	updated_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT reconciliacao_aliases_user_id_chave_extrato_pk PRIMARY KEY (user_id, chave_extrato)
);

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'reconciliacao_sessoes_user_id_user_id_fk'
	) THEN
		ALTER TABLE public.reconciliacao_sessoes
			ADD CONSTRAINT reconciliacao_sessoes_user_id_user_id_fk
			FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'reconciliacao_linhas_sessao_id_reconciliacao_sessoes_id_fk'
	) THEN
		ALTER TABLE public.reconciliacao_linhas
			ADD CONSTRAINT reconciliacao_linhas_sessao_id_reconciliacao_sessoes_id_fk
			FOREIGN KEY (sessao_id) REFERENCES public.reconciliacao_sessoes(id) ON DELETE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'reconciliacao_linhas_user_id_user_id_fk'
	) THEN
		ALTER TABLE public.reconciliacao_linhas
			ADD CONSTRAINT reconciliacao_linhas_user_id_user_id_fk
			FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'reconciliacao_linhas_lancamento_id_lancamentos_id_fk'
	) THEN
		ALTER TABLE public.reconciliacao_linhas
			ADD CONSTRAINT reconciliacao_linhas_lancamento_id_lancamentos_id_fk
			FOREIGN KEY (lancamento_id) REFERENCES public.lancamentos(id) ON DELETE SET NULL;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'reconciliacao_aliases_user_id_user_id_fk'
	) THEN
		ALTER TABLE public.reconciliacao_aliases
			ADD CONSTRAINT reconciliacao_aliases_user_id_user_id_fk
			FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'reconciliacao_aliases_categoria_id_categorias_id_fk'
	) THEN
		ALTER TABLE public.reconciliacao_aliases
			ADD CONSTRAINT reconciliacao_aliases_categoria_id_categorias_id_fk
			FOREIGN KEY (categoria_id) REFERENCES public.categorias(id) ON DELETE SET NULL;
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS reconciliacao_sessoes_user_id_idx
	ON public.reconciliacao_sessoes USING btree (user_id);

CREATE INDEX IF NOT EXISTS reconciliacao_sessoes_alvo_periodo_idx
	ON public.reconciliacao_sessoes USING btree (user_id, tipo_alvo, alvo_id, periodo);

CREATE INDEX IF NOT EXISTS reconciliacao_linhas_sessao_id_idx
	ON public.reconciliacao_linhas USING btree (sessao_id);

CREATE INDEX IF NOT EXISTS reconciliacao_linhas_user_id_idx
	ON public.reconciliacao_linhas USING btree (user_id);

CREATE INDEX IF NOT EXISTS reconciliacao_linhas_id_externo_idx
	ON public.reconciliacao_linhas USING btree (id_externo);

CREATE INDEX IF NOT EXISTS reconciliacao_aliases_user_id_idx
	ON public.reconciliacao_aliases USING btree (user_id);
