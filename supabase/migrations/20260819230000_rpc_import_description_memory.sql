-- Memória de categoria por descrição, para a conferência da importação.
--
-- O app fala com o banco via PostgREST, que não expressa `lower(regexp_replace(...))`
-- em filtro nem em projeção. A versão anterior montava essa expressão no cliente:
-- o filtro virava "unsupported" e era descartado em silêncio, e a coluna calculada
-- não voltava — a memória vinha sempre vazia e toda linha caía para a IA, mesmo
-- com a categoria já preenchida à mão em importações anteriores.
--
-- Aqui a normalização e o casamento por prefixo acontecem onde devem: no SQL.
--
-- Precedência devolvida por chave:
--   1. mapeamento salvo, casamento exato
--   2. histórico de lançamentos, casamento exato (o mais recente)
--   3. mapeamento salvo, prefixo
--   4. histórico de lançamentos, prefixo (o mais recente)
--
-- O prefixo cobre a descrição truncada pelo cartão, nos dois sentidos: o nome
-- gravado começa com a chave importada, ou a chave começa com o nome gravado.
-- Exige 10 caracteres para não casar por acaso.

CREATE OR REPLACE FUNCTION public.get_import_description_memory(
  p_user_id text,
  p_keys text[]
)
RETURNS TABLE (
  description_key text,
  categoria_id uuid,
  pagador_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH chaves AS (
    SELECT DISTINCT lower(regexp_replace(trim(k), '\s+', ' ', 'g')) AS chave
    FROM unnest(p_keys) AS k
    WHERE length(trim(k)) > 0
  ),
  salvos AS (
    SELECT
      lower(regexp_replace(trim(m.description_key), '\s+', ' ', 'g')) AS chave,
      m.category_id AS categoria_id,
      m.pagador_id,
      m.updated_at
    FROM public.import_category_mappings m
    WHERE m.user_id = p_user_id
      AND m.category_id IS NOT NULL
  ),
  historico AS (
    SELECT
      lower(regexp_replace(trim(l.nome), '\s+', ' ', 'g')) AS chave,
      l.categoria_id,
      l.pagador_id,
      l.created_at
    FROM public.lancamentos l
    WHERE l.user_id = p_user_id
      AND l.categoria_id IS NOT NULL
  ),
  candidatos AS (
    -- 1) mapeamento salvo, exato
    SELECT c.chave AS chave_importada, s.categoria_id, s.pagador_id,
           1 AS prioridade, s.updated_at AS recencia
    FROM chaves c
    JOIN salvos s ON s.chave = c.chave

    UNION ALL

    -- 2) histórico, exato
    SELECT c.chave, h.categoria_id, h.pagador_id,
           2 AS prioridade, h.created_at
    FROM chaves c
    JOIN historico h ON h.chave = c.chave

    UNION ALL

    -- 3) mapeamento salvo, prefixo
    SELECT c.chave, s.categoria_id, s.pagador_id,
           3 AS prioridade, s.updated_at
    FROM chaves c
    JOIN salvos s
      ON s.chave <> c.chave
     AND (
       (length(c.chave) >= 10 AND s.chave LIKE c.chave || '%')
       OR (length(s.chave) >= 10 AND c.chave LIKE s.chave || '%')
     )

    UNION ALL

    -- 4) histórico, prefixo
    SELECT c.chave, h.categoria_id, h.pagador_id,
           4 AS prioridade, h.created_at
    FROM chaves c
    JOIN historico h
      ON h.chave <> c.chave
     AND (
       (length(c.chave) >= 10 AND h.chave LIKE c.chave || '%')
       OR (length(h.chave) >= 10 AND c.chave LIKE h.chave || '%')
     )
  )
  SELECT DISTINCT ON (chave_importada)
    chave_importada AS description_key,
    categoria_id,
    pagador_id
  FROM candidatos
  ORDER BY chave_importada, prioridade, recencia DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_import_description_memory(text, text[]) TO authenticated, service_role;
