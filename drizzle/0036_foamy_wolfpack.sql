ALTER TABLE "import_batches" ADD COLUMN "tamanho_arquivo_origem" integer;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "status" text DEFAULT 'uploaded' NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "dados_rascunho" jsonb;