-- Habilita Supabase Realtime para lançamentos (atualização da lista sem refresh).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'lancamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lancamentos;
  END IF;
END $$;
