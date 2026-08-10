export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

/** Tipos gerados manualmente a partir do schema Drizzle — refine com `supabase gen types` quando o projeto estiver linkado. */
export type Database = {
	public: {
		Tables: {
			user: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			account: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			session: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			verification: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			passkey: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			preferencias_usuario: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			contas: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			categorias: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			pagadores: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			compartilhamentos_pagador: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			convites_pagador: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			cartoes: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			faturas: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			orcamentos: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			anotacoes: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			insights_salvos: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			tokens_api: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			pre_lancamentos: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			dashboard_notification_states: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			antecipacoes_parcelas: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			lancamentos: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			anexos: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			lancamento_anexos: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			anotacao_anexos: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			import_batches: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			import_category_mappings: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			reconciliacao_sessoes: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			reconciliacao_linhas: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			reconciliacao_aliases: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
			establishment_logos: {
				Row: Record<string, unknown>;
				Insert: Record<string, unknown>;
				Update: Record<string, unknown>;
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
};
