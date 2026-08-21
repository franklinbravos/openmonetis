-- Limite garantido do cartão, lido da fatura.
--
-- A fatura do Nubank traz, no bloco "Limites disponíveis", o limite total e a
-- sua composição — parte concedida pelo banco e parte lastreada por
-- investimento ("Nu Limite Garantido e limite extra"). O cartão só tinha um
-- campo de limite, então a distinção se perdia.
--
-- `limite` segue sendo o limite total (utilizado + disponível). `limite_garantido`
-- guarda a parcela lastreada, que é a que o usuário controla aportando ou
-- resgatando. Fica nulo em cartão sem essa composição.
ALTER TABLE public.cartoes
  ADD COLUMN IF NOT EXISTS limite_garantido numeric(12, 2);

COMMENT ON COLUMN public.cartoes.limite_garantido IS
  'Parcela do limite lastreada por investimento, lida da fatura. Nulo quando não se aplica.';
