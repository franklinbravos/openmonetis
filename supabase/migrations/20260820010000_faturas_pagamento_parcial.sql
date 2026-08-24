-- Pagamento parcial de fatura de cartão.
--
-- Até aqui `faturas.status_pagamento` só admitia "pendente" ou "pago", e o
-- pagamento era gravado como um débito na conta pelo valor INTEGRAL da fatura.
-- Em cartão de crédito o pagamento parcial é possível: paga-se parte, o resto
-- entra na fatura seguinte como "valor pendente do mês anterior" mais juros e
-- IOF do rotativo.
--
-- O registro ficava duplamente errado: a fatura aparecia como paga por inteiro
-- e a conta era debitada por um valor que nunca saiu dela.
--
-- `valor_pago` guarda quanto foi efetivamente pago. Fica nulo para fatura
-- pendente ou paga por inteiro — nesses casos o valor pago é o próprio total,
-- e gravá-lo abriria uma segunda fonte de verdade para o mesmo número.
ALTER TABLE public.faturas
  ADD COLUMN IF NOT EXISTS valor_pago numeric(12, 2);

COMMENT ON COLUMN public.faturas.valor_pago IS
  'Valor efetivamente pago quando status_pagamento = ''parcial''. Nulo nos demais casos.';
