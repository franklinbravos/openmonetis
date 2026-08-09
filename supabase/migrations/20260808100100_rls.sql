-- RLS base: isolamento por auth.uid() = user_id (texto)

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compartilhamentos_pagador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convites_pagador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights_salvos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokens_api ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_notification_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.antecipacoes_parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamento_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anotacao_anexos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_category_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preferencias_usuario ENABLE ROW LEVEL SECURITY;

-- Política padrão owner
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contas', 'categorias', 'pagadores', 'cartoes', 'faturas', 'orcamentos',
    'anotacoes', 'insights_salvos', 'tokens_api', 'pre_lancamentos',
    'dashboard_notification_states', 'antecipacoes_parcelas', 'lancamentos',
    'anexos', 'import_batches', 'import_category_mappings',
    'reconciliation_sessions', 'reconciliation_lines', 'reconciliation_aliases',
    'establishment_logos', 'preferencias_usuario'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text)',
      t || '_owner',
      t
    );
  END LOOP;
END $$;

-- Compartilhamentos: dono ou convidado
DROP POLICY IF EXISTS compartilhamentos_pagador_access ON public.compartilhamentos_pagador;
CREATE POLICY compartilhamentos_pagador_access ON public.compartilhamentos_pagador
  FOR ALL
  USING (
    created_by_user_id = auth.uid()::text
    OR shared_with_user_id = auth.uid()::text
  )
  WITH CHECK (created_by_user_id = auth.uid()::text);

-- Junction tables herdam acesso via FK (service_role no servidor para writes complexos)
DROP POLICY IF EXISTS lancamento_anexos_access ON public.lancamento_anexos;
CREATE POLICY lancamento_anexos_access ON public.lancamento_anexos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lancamentos l
      WHERE l.id = lancamento_id AND l.user_id = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS anotacao_anexos_access ON public.anotacao_anexos;
CREATE POLICY anotacao_anexos_access ON public.anotacao_anexos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.anotacoes n
      WHERE n.id = anotacao_id AND n.user_id = auth.uid()::text
    )
  );

-- Convites: criador
DROP POLICY IF EXISTS convites_pagador_owner ON public.convites_pagador;
CREATE POLICY convites_pagador_owner ON public.convites_pagador
  FOR ALL
  USING (created_by_user_id = auth.uid()::text)
  WITH CHECK (created_by_user_id = auth.uid()::text);
