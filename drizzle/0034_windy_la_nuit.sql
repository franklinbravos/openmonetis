CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"anexo_id" uuid,
	"nome_arquivo_origem" text NOT NULL,
	"cartao_id" uuid,
	"periodo_fatura" text,
	"conta_id" uuid,
	"importados" integer DEFAULT 0 NOT NULL,
	"ignorados" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convites_pagador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pagador_id" uuid NOT NULL,
	"email" text NOT NULL,
	"permission" text DEFAULT 'read' NOT NULL,
	"tipo_convite" text NOT NULL,
	"token_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliacao_aliases" (
	"user_id" text NOT NULL,
	"chave_extrato" text NOT NULL,
	"nome_alvo" text NOT NULL,
	"categoria_id" uuid,
	"qtd_acertos" integer DEFAULT 0 NOT NULL,
	"origem" text DEFAULT 'manual' NOT NULL,
	"ultimo_uso" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliacao_aliases_user_id_chave_extrato_pk" PRIMARY KEY("user_id","chave_extrato")
);
--> statement-breakpoint
CREATE TABLE "reconciliacao_linhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessao_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"indice_linha" integer NOT NULL,
	"id_externo" text,
	"data_compra" text NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"tipo_transacao" text NOT NULL,
	"status_match" text DEFAULT 'pending' NOT NULL,
	"lancamento_id" uuid,
	"acao_sugerida" text,
	"valor_sugerido" numeric(12, 2),
	"confianca_match" numeric(5, 2),
	"motivo_match" text,
	"aplicado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliacao_sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"modo" text NOT NULL,
	"tipo_alvo" text NOT NULL,
	"alvo_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"nome_arquivo" text NOT NULL,
	"tipo_arquivo" text NOT NULL,
	"origem_extrato" text,
	"numero_conta_extrato" text,
	"periodo_extrato_de" text,
	"periodo_extrato_ate" text,
	"total_extrato" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_sistema" numeric(12, 2),
	"diferenca" numeric(12, 2),
	"status" text DEFAULT 'draft' NOT NULL,
	"qtd_linhas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "categoria_pai_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "insights_default_model_id" text;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "ai_provider_settings" jsonb;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_anexo_id_anexos_id_fk" FOREIGN KEY ("anexo_id") REFERENCES "public"."anexos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_cartao_id_cartoes_id_fk" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_pagador" ADD CONSTRAINT "convites_pagador_pagador_id_pagadores_id_fk" FOREIGN KEY ("pagador_id") REFERENCES "public"."pagadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_pagador" ADD CONSTRAINT "convites_pagador_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliacao_aliases" ADD CONSTRAINT "reconciliacao_aliases_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliacao_aliases" ADD CONSTRAINT "reconciliacao_aliases_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliacao_linhas" ADD CONSTRAINT "reconciliacao_linhas_sessao_id_reconciliacao_sessoes_id_fk" FOREIGN KEY ("sessao_id") REFERENCES "public"."reconciliacao_sessoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliacao_linhas" ADD CONSTRAINT "reconciliacao_linhas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliacao_linhas" ADD CONSTRAINT "reconciliacao_linhas_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliacao_sessoes" ADD CONSTRAINT "reconciliacao_sessoes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_user_id_created_at_idx" ON "import_batches" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "import_batches_cartao_periodo_idx" ON "import_batches" USING btree ("user_id","cartao_id","periodo_fatura");--> statement-breakpoint
CREATE UNIQUE INDEX "convites_pagador_token_hash_key" ON "convites_pagador" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "convites_pagador_pagador_email_idx" ON "convites_pagador" USING btree ("pagador_id","email");--> statement-breakpoint
CREATE INDEX "reconciliacao_aliases_user_id_idx" ON "reconciliacao_aliases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reconciliacao_linhas_sessao_id_idx" ON "reconciliacao_linhas" USING btree ("sessao_id");--> statement-breakpoint
CREATE INDEX "reconciliacao_linhas_user_id_idx" ON "reconciliacao_linhas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reconciliacao_linhas_id_externo_idx" ON "reconciliacao_linhas" USING btree ("id_externo");--> statement-breakpoint
CREATE INDEX "reconciliacao_sessoes_user_id_idx" ON "reconciliacao_sessoes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reconciliacao_sessoes_alvo_periodo_idx" ON "reconciliacao_sessoes" USING btree ("user_id","tipo_alvo","alvo_id","periodo");--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_categoria_pai_id_categorias_id_fk" FOREIGN KEY ("categoria_pai_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorias_categoria_pai_id_idx" ON "categorias" USING btree ("categoria_pai_id");