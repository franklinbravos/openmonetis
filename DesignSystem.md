# Design System — OpenMonetis

Este documento complementa o [DESIGN.md](./DESIGN.md), que concentra tokens, tipografia, layout e diretrizes gerais. Aqui ficam **padrões de componentes** com implementação concreta no código.

## Referência rápida

| Tema | Onde consultar |
|---|---|
| Cores, tipografia, espaçamento | [DESIGN.md](./DESIGN.md) |
| Componentes base (`Button`, `Card`, etc.) | `src/shared/components/ui/` |
| Ações rápidas de lançamento | Seção abaixo |

## Ações rápidas de lançamento

Botões para criar receita, despesa e transferência. Usados na listagem de lançamentos, extrato de conta, fatura de cartão, detalhe de pessoa e dashboard.

### Ícones (Remix Icon)

| Ação | Ícone | Cor do ícone | Variante do botão |
|---|---|---|---|
| Nova Receita | `RiAddCircleFill` (+ em círculo) | `text-success` (verde) | `outline` |
| Nova Despesa | `RiSubtractLine` (sinal de menos) | `text-destructive` (vermelho) | `outline` |
| Nova transferência | `RiExchangeLine` (setas vai e vem) | `text-info` | `outline` |
| Exportar | `RiDownloadLine` | padrão do tema | `outline` (borda tracejada) |

Os botões de ação rápida usam **fundo claro** (`bg-card`, `variant="outline"`). A distinção semântica fica só na cor do ícone.

### Comportamento responsivo

- **Mobile (`< sm`)**: botões em **linha**, cada um com `flex-1` (divide o espaço disponível). Layout vertical compacto: ícone colorido + rótulo curto (`Receita`, `Despesa`, `Transferir`). **Exportar** fica no card do mês, à direita do seletor de período (ícone compacto).
- **Desktop (`≥ sm`)**: botão com ícone + texto completo (`Nova Receita`, etc.) e largura automática. Exportar permanece na barra de filtros.

Classe compartilhada:

```ts
// src/features/transactions/components/quick-actions/constants.ts
transactionQuickActionButtonClassName =
  "size-9 shrink-0 gap-0 px-0 sm:h-9 sm:w-auto sm:gap-2 sm:px-4";
```

### Implementação

| Arquivo | Papel |
|---|---|
| `src/features/transactions/components/quick-actions/constants.ts` | Ícones, rótulos e variantes |
| `src/features/transactions/components/quick-actions/transaction-quick-action-button.tsx` | Botão individual (`kind`: `income` \| `expense` \| `transfer`) |
| `src/features/transactions/components/quick-actions/transactions-quick-actions.tsx` | Grupo com os três diálogos |

### Uso

```tsx
import { TransactionQuickActionButton } from "@/features/transactions/components/quick-actions/transaction-quick-action-button";
import { TransactionsQuickActions } from "@/features/transactions/components/quick-actions/transactions-quick-actions";

// Botão isolado (ex.: trigger de dialog)
<TransactionQuickActionButton kind="income" />

// Grupo completo na toolbar de lançamentos
<TransactionsQuickActions
  payerOptions={...}
  selectedPeriod={period}
  transferAccounts={accounts}
  {...dialogProps}
/>
```

### Layout na toolbar

No mobile, os três botões ficam em **linha horizontal** com `gap-2`, ao lado do botão Exportar quando presente. Não empilhar em coluna nem esticar para largura total.

### Acessibilidade

- Ícones com `aria-hidden`; rótulo sempre disponível via texto visível (desktop) ou `sr-only` (mobile).
- Manter área de toque mínima de `36px` no mobile.

### Ao criar novas ações similares

1. Adicionar entrada em `TRANSACTION_QUICK_ACTIONS` em `constants.ts`.
2. Reutilizar `TransactionQuickActionButton` ou estender o tipo `TransactionQuickActionKind`.
3. Atualizar este documento e, se necessário, [DESIGN.md](./DESIGN.md).
