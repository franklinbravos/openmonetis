# Design System — OpenMonetis

> Versão 3.0 · Direção visual **Índigo Cofre**
> Este documento é a fonte de verdade visual do produto. Nenhuma cor, tamanho de
> fonte, raio ou sombra deve existir no código fora dos tokens definidos aqui.

---

## 1. Princípios

O OpenMonetis não é um banco. É um livro-caixa que roda na sua infraestrutura,
alimentado à mão, por alguém que quer saber exatamente para onde o dinheiro vai.
A interface deve parecer **um instrumento de precisão, não uma vitrine**.

Cinco decisões governam tudo:

**1. O número é o herói.** Valores monetários têm o maior peso visual de qualquer
tela. Cromo, ícones, bordas e ilustrações existem para deixar o número legível —
nunca para competir com ele.

**2. A cor da marca não pode disputar com a cor do dinheiro.** Este é o erro que
o laranja cometia: ele ocupava a mesma faixa cromática do alerta (âmbar) e ficava
perto demais da despesa (vermelho), então a tela inteira soava como aviso. O
índigo resolve isso ocupando um eixo que nenhum estado financeiro usa.

**3. Cor nunca é o único canal.** Todo valor carrega sinal (`+`/`−`) e direção
(seta) além da cor. Isso não é enfeite de acessibilidade — foi medido, e está
documentado na seção 9.

**4. Densidade com ar.** Uma tabela de lançamentos precisa caber muita linha, mas
cada linha precisa respirar o suficiente para o olho encontrar o valor. A escala
de espaçamento é apertada; a altura de linha, não.

**5. Peso onde importa.** Uma coisa por tela pode ser marcante. O resto fica
quieto. Se dois elementos disputam atenção, um dos dois está errado.

---

## 2. Marca

### Símbolo

O símbolo é o **Sinal**: os glifos `+` e `−` fundidos em uma forma única e
fechada. É literalmente o que o produto faz — registrar entradas e saídas — e
sobrevive a 16 px porque é uma silhueta sólida, não um traçado fino.

**Construção:** grid de 24×24, traço de 4 unidades, cantos com raio de 1 unidade.
O braço horizontal atravessa; o vertical para no centro. A assimetria resultante
é o que dá caráter — não corrija para simétrico.

### Arquivos obrigatórios

| Arquivo | Uso | Observação |
| --- | --- | --- |
| `logo-mark.svg` | Símbolo isolado | `currentColor`, sem cor fixa |
| `logo-wordmark.svg` | Horizontal, símbolo + nome | Texto convertido em curvas |
| `logo-stacked.svg` | Vertical, para espaços estreitos | |
| `logo-mono.svg` | Uma cor, para README e impressão | |
| `icon.svg` + `favicon.ico` | Aba do navegador | ico com 16 e 32 |
| `icon-192.png`, `icon-512.png` | PWA | |
| `icon-maskable-512.png` | PWA Android | símbolo dentro de 80% do canvas |
| `apple-touch-icon.png` | iOS, 180×180 | fundo sólido, sem transparência |
| `og-image.png` | Compartilhamento, 1200×630 | |

### Regras de uso

- Área de proteção: metade da altura do símbolo em todos os lados.
- Tamanho mínimo do símbolo: 16 px. Do wordmark: 96 px de largura.
- Sobre fundo claro, use `--foreground`. Sobre escuro, `--foreground` do tema
  escuro. O símbolo em `--primary` só na tela de login e no ícone do app.
- Nunca: gradiente, sombra, contorno, rotação, esticar, recolorir por categoria.

### Teste de aprovação

Um logo só entra no repositório depois de passar em três checagens: legível a
16 px, legível em escala de cinza, e reconhecível recortado em círculo (ícone
maskable do Android).

---

## 3. Cor

### Filosofia

Neutros frios com um leve viés azul (hue 255–262) em vez de cinza puro. Cinza
neutro em tela grande fica sujo; um traço de croma no neutro faz as superfícies
parecerem intencionais. A marca é um índigo profundo — escuro o bastante para ser
botão sólido sem virar bloco de tinta, e distante o suficiente de âmbar e
vermelho para nunca ser confundido com estado.

Todos os valores abaixo foram convertidos para sRGB e verificados: nenhum está
fora de gamut, e o contraste listado é contra a superfície `card` do respectivo
tema.

### Tema claro

```css
:root {
  --radius: 0.625rem;

  /* Superfícies */
  --background:             oklch(0.990 0.004 255);  /* #FAFCFE */
  --foreground:             oklch(0.205 0.022 262);  /* #121721 — 17.9:1 */
  --card:                   oklch(1.000 0.000 255);  /* #FFFFFF */
  --card-foreground:        oklch(0.205 0.022 262);
  --popover:                oklch(1.000 0.000 255);
  --popover-foreground:     oklch(0.205 0.022 262);
  --muted:                  oklch(0.965 0.008 255);  /* #F0F4F9 */
  --muted-foreground:       oklch(0.545 0.018 262);  /* #6A707B — 4.96:1 */
  --accent:                 oklch(0.955 0.014 262);  /* #EBF0FA */
  --accent-foreground:      oklch(0.265 0.022 262);
  --border:                 oklch(0.916 0.010 255);  /* #DFE4EA */
  --input:                  oklch(0.916 0.010 255);
  --ring:                   oklch(0.480 0.150 266);

  /* Marca */
  --primary:                oklch(0.480 0.150 266);  /* #3556B1 — 6.74:1 */
  --primary-foreground:     oklch(0.985 0.005 266);  /* botão: 6.45:1 */
  --primary-hover:          oklch(0.440 0.155 266);  /* #2A49A7 */
  --primary-subtle:         oklch(0.955 0.018 266);  /* #EAF0FD */
  --secondary:              oklch(0.965 0.008 255);
  --secondary-foreground:   oklch(0.265 0.022 262);

  /* Estados financeiros */
  --positive:               oklch(0.545 0.085 186);  /* #238077 — 4.74:1 */
  --positive-surface:       oklch(0.962 0.018 186);  /* #E6F7F4 */
  --negative:               oklch(0.475 0.185 22);   /* #AC0D27 — 7.38:1 */
  --negative-surface:       oklch(0.958 0.016 22);   /* #FCEDEC */
  --warning:                oklch(0.560 0.120 72);   /* #9F6700 — 4.77:1 */
  --warning-surface:        oklch(0.960 0.024 80);   /* #FAF0E0 */
  --info:                   oklch(0.540 0.115 245);  /* #2874AD — 5.01:1 */
  --info-surface:           oklch(0.960 0.017 245);  /* #E9F3FD */
  --destructive:            oklch(0.475 0.185 22);
  --destructive-foreground: oklch(0.985 0.004 22);

  /* Séries de gráfico — máximo 5, ver seção 9 */
  --chart-1:                oklch(0.480 0.150 266);  /* #3556B1 — 6.74:1 */
  --chart-2:                oklch(0.580 0.095 196);  /* #148B8D — 4.10:1 */
  --chart-3:                oklch(0.550 0.110 68);   /* #9B641A — 4.98:1 */
  --chart-4:                oklch(0.420 0.155 352);  /* #861756 — 9.23:1 */
  --chart-5:                oklch(0.620 0.140 152);  /* #329D5A — 3.42:1 */
}
```

### Tema escuro

O fundo não é preto. Preto puro em OLED cria halo em torno de texto claro e faz
a sombra desaparecer. `oklch(0.17 0.014 262)` é escuro o suficiente para
descansar o olho e ainda permitir três níveis de superfície acima dele.

```css
.dark {
  --background:             oklch(0.170 0.014 262);  /* #0C0F16 */
  --foreground:             oklch(0.965 0.005 262);  /* #F2F3F7 — 15.9:1 */
  --card:                   oklch(0.212 0.016 262);  /* #151920 */
  --card-foreground:        oklch(0.965 0.005 262);
  --popover:                oklch(0.232 0.016 262);  /* #191E25 */
  --popover-foreground:     oklch(0.965 0.005 262);
  --muted:                  oklch(0.262 0.016 262);  /* #20252C */
  --muted-foreground:       oklch(0.705 0.016 262);  /* #9BA0AA — 6.73:1 */
  --accent:                 oklch(0.290 0.020 262);  /* #262C36 */
  --accent-foreground:      oklch(0.965 0.005 262);
  --border:                 oklch(0.310 0.016 262);  /* #2C3039 */
  --input:                  oklch(0.310 0.016 262);
  --ring:                   oklch(0.680 0.150 266);

  --primary:                oklch(0.680 0.150 266);  /* #6C93F4 — 6.01:1 */
  --primary-foreground:     oklch(0.190 0.040 266);  /* botão: 6.31:1 */
  --primary-hover:          oklch(0.730 0.125 266);  /* #83A5F7 */
  --primary-subtle:         oklch(0.285 0.055 266);  /* #1D2945 */
  --secondary:              oklch(0.262 0.016 262);
  --secondary-foreground:   oklch(0.930 0.008 262);

  --positive:               oklch(0.820 0.105 186);  /* #69DACE — 10.6:1 */
  --positive-surface:       oklch(0.285 0.038 186);  /* #10302D */
  --negative:               oklch(0.680 0.165 22);   /* #ED6869 — 5.67:1 */
  --negative-surface:       oklch(0.285 0.052 22);   /* #401F1E */
  --warning:                oklch(0.815 0.135 82);   /* #EEB950 — 9.83:1 */
  --warning-surface:        oklch(0.295 0.048 82);
  --info:                   oklch(0.720 0.115 245);  /* #62ACE8 — 7.19:1 */
  --info-surface:           oklch(0.285 0.043 245);
  --destructive:            oklch(0.680 0.165 22);
  --destructive-foreground: oklch(0.180 0.030 22);

  --chart-1:                oklch(0.680 0.150 266);
  --chart-2:                oklch(0.780 0.090 196);
  --chart-3:                oklch(0.800 0.125 68);
  --chart-4:                oklch(0.680 0.150 352);
  --chart-5:                oklch(0.820 0.130 152);
}
```

### Exposição para o Tailwind

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-hover: var(--primary-hover);
  --color-primary-subtle: var(--primary-subtle);
  --color-positive: var(--positive);
  --color-positive-surface: var(--positive-surface);
  --color-negative: var(--negative);
  --color-negative-surface: var(--negative-surface);
  --color-warning: var(--warning);
  --color-warning-surface: var(--warning-surface);
  --color-info: var(--info);
  --color-info-surface: var(--info-surface);
  /* ...demais tokens seguem o mesmo padrão */
}
```

### Regras de uso

- `--primary` é reservado para **uma ação por tela**. Se há dois botões índigo
  visíveis ao mesmo tempo, um deles é secundário disfarçado.
- `--positive` e `--negative` são exclusivos de valor monetário e de gráficos que
  representam saldo. Nunca use verde-água para "sucesso" genérico — sucesso de
  formulário usa `--info` ou apenas texto neutro com ícone.
- As superfícies `-surface` são para badges e destaques de linha, nunca para
  texto. Texto sobre `-surface` usa o token de cor cheia correspondente.
- Transferências entre contas são **neutras** (`--muted-foreground`). Não são
  receita nem despesa e colori-las é o erro mais comum em app financeiro.

---

## 4. Tipografia

Duas famílias, papéis nítidos.

| Papel | Família | Por quê |
| --- | --- | --- |
| Interface e texto | **Instrument Sans** | Grotesca levemente estreita; boa em 13–14 px, que é onde a maior parte deste produto vive |
| Valores e identificadores | **IBM Plex Mono** | Colunas de dinheiro alinham por construção; o zero cortado elimina ambiguidade em extrato |

A Bricolage Grotesque sai. Ela é expressiva e funcionava como assinatura, mas
seus algarismos não são desenhados para tabela e a personalidade dela briga com
o número em vez de servi-lo.

```ts
// src/app/fonts.ts
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";

export const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});
```

### Escala

| Token | Tamanho / entrelinha | Peso | Tracking | Uso |
| --- | --- | --- | --- | --- |
| `display` | 32 / 38 | 600 | −0.02em | Saldo principal do dashboard |
| `h1` | 24 / 32 | 600 | −0.015em | Título de página |
| `h2` | 20 / 28 | 600 | −0.01em | Seção |
| `h3` | 17 / 24 | 600 | 0 | Título de card |
| `body` | 14 / 20 | 400 | 0 | Padrão da interface |
| `body-lg` | 16 / 24 | 400 | 0 | Texto corrido, landing |
| `label` | 13 / 16 | 500 | 0 | Rótulo de campo, cabeçalho de tabela |
| `caption` | 12 / 16 | 400 | 0.01em | Metadados, timestamps |

Rótulos em caixa alta com tracking largo estão banidos. Um rótulo é um rótulo —
peso 500 e `--muted-foreground` bastam para diferenciá-lo do valor.

Linha de texto corrido: máximo 72 caracteres.

---

## 5. Dinheiro

Esta seção é a razão de existir do resto do documento.

### Regras

1. Todo valor usa `--font-mono` com `font-variant-numeric: tabular-nums slashed-zero`.
2. Todo valor carrega **sinal explícito**: `+R$ 1.240,00` / `−R$ 380,50`.
   Zero é `R$ 0,00`, sem sinal.
3. Todo valor colorido carrega **também** uma seta ou ícone direcional. Cor é o
   terceiro canal, nunca o primeiro.
4. Alinhamento à direita em qualquer contexto tabular. Alinhamento à esquerda só
   quando o valor está isolado em um card.
5. Centavos sempre visíveis em lançamentos individuais. Em gráficos e agregados
   grandes, abrevie (`R$ 12,4 mil`) e mostre o valor cheio no tooltip.
6. Modo privacidade substitui os dígitos por `••••` mantendo a largura da caixa,
   para o layout não pular ao alternar.

### Escala numérica

| Token | Tamanho | Peso | Contexto |
| --- | --- | --- | --- |
| `money-hero` | 32 | 600 | Saldo consolidado |
| `money-lg` | 20 | 600 | Total de card, fatura |
| `money-md` | 15 | 500 | Linha de tabela |
| `money-sm` | 13 | 500 | Parcela, valor secundário |

### Exemplo

```tsx
<span
  className="font-mono tabular-nums text-negative inline-flex items-center gap-1"
  aria-label="Despesa de 380 reais e 50 centavos"
>
  <ArrowDownRight className="size-3.5" aria-hidden />
  −R$ 380,50
</span>
```

---

## 6. Espaço, raio e elevação

### Espaçamento

Base de 4 px. Passos permitidos: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
Nada fora dessa lista.

- Padding interno de card: 16 (compacto) ou 24 (padrão).
- Espaço entre cards de um grid: 16.
- Espaço entre seções de página: 32 no mobile, 48 no desktop.
- Altura de linha de tabela: 44 (confortável) ou 36 (compacta, opção do usuário).

### Raio

```css
--radius: 0.625rem;         /* 10px, base */
--radius-sm: 0.375rem;      /* 6px  — badge, checkbox */
--radius-md: 0.5rem;        /* 8px  — input, botão pequeno */
--radius-lg: 0.625rem;      /* 10px — botão, card interno */
--radius-xl: 0.875rem;      /* 14px — card, modal */
--radius-full: 9999px;      /* chip de filtro, avatar */
```

Raios diferentes por hierarquia — usar o mesmo valor em tudo é o que faz uma tela
parecer template.

### Elevação

Três níveis. Sombra tingida com o hue neutro, nunca preto puro.

```css
--shadow-1: 0 1px 2px oklch(0.205 0.022 262 / 0.06);
--shadow-2: 0 2px 4px -1px oklch(0.205 0.022 262 / 0.08),
            0 1px 2px oklch(0.205 0.022 262 / 0.05);
--shadow-3: 0 8px 24px -6px oklch(0.205 0.022 262 / 0.14);
```

No tema escuro, sombra quase não funciona. Lá, elevação se comunica por
**superfície mais clara**: `background` → `card` → `popover`. As sombras caem
para 40% da opacidade e servem só para descolar modais.

| Nível | Uso |
| --- | --- |
| `shadow-1` | Card em repouso, botão secundário |
| `shadow-2` | Card em hover, dropdown, popover |
| `shadow-3` | Modal, sheet, command palette |

---

## 7. Componentes

### Botão

Leve, com resposta física ao toque. Sem gradiente, sem sombra pesada.

| Variante | Fundo | Borda | Texto |
| --- | --- | --- | --- |
| `primary` | `--primary` | nenhuma | `--primary-foreground` |
| `secondary` | `--card` | 1px `--border` | `--foreground` |
| `ghost` | transparente | nenhuma | `--foreground` |
| `subtle` | `--primary-subtle` | nenhuma | `--primary` |
| `destructive` | `--destructive` | nenhuma | `--destructive-foreground` |

| Tamanho | Altura | Padding X | Fonte | Ícone |
| --- | --- | --- | --- | --- |
| `sm` | 32 | 12 | 13 | 14 |
| `default` | 36 | 16 | 14 | 16 |
| `lg` | 44 | 20 | 15 | 18 |

**Estados**

```css
.btn {
  border-radius: var(--radius-lg);
  transition: background-color 120ms cubic-bezier(0.2, 0, 0, 1),
              transform 120ms cubic-bezier(0.2, 0, 0, 1),
              box-shadow 120ms cubic-bezier(0.2, 0, 0, 1);
}
.btn:hover   { background: var(--primary-hover); }
.btn:active  { transform: scale(0.985); box-shadow: none; }
.btn:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
.btn:disabled { opacity: 0.5; pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
  .btn:active { transform: none; }
}
```

**Não negociável**

- Alvo de toque mínimo de 44×44 no mobile. Botões `sm` e `default` recebem uma
  área invisível por pseudo-elemento quando `pointer: coarse`.
- Estado de carregamento troca o rótulo por spinner **mantendo a largura**. O
  botão nunca encolhe no meio de um clique.
- `transition` nomeando propriedades. Nunca `transition: all`.
- Botão que abre destrutivo pede confirmação; botão que confirma destrutivo usa
  a variante `destructive` e nomeia a ação ("Excluir lançamento", não "Confirmar").

### Input

Altura 36, raio `md`, borda 1px `--border`. No foco: borda `--ring` mais anel
de 2px em `--ring/25`, sem deslocar layout. Erro: borda `--negative` mais texto
de ajuda abaixo, nunca só a borda vermelha. Placeholder em `--muted-foreground`
e nunca substituindo o rótulo.

Campo de valor monetário usa `inputMode="decimal"`, `--font-mono`, alinhamento à
direita e prefixo `R$` fixo fora da área editável.

### Card

Fundo `--card`, borda 1px `--border`, raio `xl`, `shadow-1`. Sem borda **e**
sombra fortes ao mesmo tempo — a borda basta no tema claro; no escuro, a
diferença de superfície basta.

Card clicável ganha `shadow-2` e `--accent` no hover, e precisa de um alvo focável
real dentro dele (link ou botão), não `onClick` na div.

### Badge

Altura 20, raio `sm`, fonte 12/500, padding 8. Sempre par
`-surface` + cor cheia. Badge de categoria usa a cor da categoria definida pelo
usuário, com o texto calculado para contraste ≥4.5:1 — nunca texto branco fixo.

### Tabela de lançamentos

O componente mais importante do produto.

- Cabeçalho: `label`, `--muted-foreground`, fundo `--muted`, fixo no scroll.
- Linhas zebradas estão proibidas; separação por borda inferior 1px `--border`.
- Hover de linha: `--accent`.
- Linha selecionada: `--primary-subtle` com barra de 2px em `--primary` à esquerda.
- Coluna de valor: sempre a última, sempre à direita, sempre mono.
- Agrupamento por data usa cabeçalho de grupo sticky com o subtotal do dia à direita.
- Em telas abaixo de 768 px a tabela vira lista de cards: estabelecimento e
  categoria à esquerda, valor à direita, data e conta na segunda linha.

### Widget de dashboard

Estrutura fixa: rótulo (`label`), valor (`money-lg` ou `money-hero`), variação
comparativa com seta e sinal, e um gráfico opcional. Nunca mais de um número
grande por widget. O comparativo diz o período explicitamente ("vs. mês
anterior"), não só uma porcentagem solta.

---

## 8. Movimento

| Duração | Uso |
| --- | --- |
| 120ms | Hover, active, mudança de cor |
| 180ms | Dropdown, tooltip, expansão |
| 240ms | Modal, sheet, troca de rota |

Easing padrão: `cubic-bezier(0.2, 0, 0, 1)`. Saída pode ser mais rápida que a
entrada.

Movimento responde a ação do usuário e mostra o que mudou. Entradas em cascata
por seção no scroll, animação de número contando e transições decorativas em
card não entram. `prefers-reduced-motion: reduce` desliga transform e mantém só
opacidade.

Skeleton de carregamento tem a forma exata do conteúdo que vai substituir, para
não haver salto de layout.

---

## 9. Gráficos

### O que foi medido

Simulamos a paleta sob protanopia, deuteranopia e tritanopia (matrizes de
Machado et al., severidade 1.0) e calculamos a razão de contraste entre pares.
Os resultados:

| Par | Visão típica | Deuteranopia | Protanopia |
| --- | --- | --- | --- |
| positivo × negativo (claro) | 1.56 | **1.24** | 2.34 |
| positivo × negativo (escuro) | 1.86 | **1.55** | 2.54 |
| pior par entre 5 séries | — | **1.06** | — |

Nenhuma escolha de matiz resolve isso. Testamos 20 mil combinações de 6 cores
com luminâncias e matizes variados: a melhor separação mínima possível sob
daltonismo foi 1.20 para 6 séries, 1.26 para 5 e 1.48 para 4. Aumentar a
distância de luminância entre receita e despesa ajuda, e por isso a despesa no
tema claro é bem mais escura que a receita — mas não é suficiente sozinha.

### Regras que vêm daí

1. **Máximo de 5 séries categóricas** por gráfico. Acima disso, agrupe o
   excedente em "Outros" e ofereça detalhamento ao clicar.
2. **Rótulo direto** em cada série. Legenda separada é complemento, não
   substituto — o olho não deveria precisar viajar até a legenda para saber o que
   é cada fatia.
3. Em gráfico de barras empilhadas ou área, adicione **padrão** (hachura,
   pontilhado) à série de despesa.
4. Tooltip sempre traz nome da série e valor formatado, nunca só o número.
5. Gráfico de pizza é permitido apenas para 3 fatias ou menos. Acima disso, barra
   horizontal ordenada.
6. Eixos e grade em `--border`; rótulos de eixo em `--muted-foreground` a 12 px.
   Sem grade vertical em gráfico de linha temporal.

### Semântica

| Conceito | Token |
| --- | --- |
| Receita, saldo positivo | `--positive` |
| Despesa, saldo negativo | `--negative` |
| Projeção, orçamento previsto | `--muted-foreground` tracejado |
| Meta, limite | `--warning` linha pontilhada |
| Séries de categoria | `--chart-1` a `--chart-5` |

---

## 10. Responsividade

| Breakpoint | Largura | Layout |
| --- | --- | --- |
| base | ≥320 | Uma coluna, navegação inferior, tabelas viram cards |
| `sm` | ≥640 | Duas colunas em grids de widget |
| `md` | ≥768 | Tabelas reais, filtros em linha |
| `lg` | ≥1024 | Sidebar fixa, três colunas |
| `xl` | ≥1280 | Largura máxima de conteúdo 1280, centralizada |

320 px é piso real, não aspiração. Toda tela precisa funcionar em um iPhone SE
sem scroll horizontal.

No modo standalone do PWA, respeite `env(safe-area-inset-*)` no topo e na
navegação inferior.

---

## 11. Acessibilidade

Critérios de aceite para qualquer PR que toque visual:

- [ ] Texto normal ≥4.5:1; texto ≥18.66px ou ≥14px bold ≥3:1.
- [ ] Bordas de componente interativo e elementos gráficos ≥3:1.
- [ ] Foco visível em todo elemento focável, com `outline-offset` (nunca
      `outline: none` sem substituto).
- [ ] Nenhuma informação transmitida só por cor.
- [ ] Alvo de toque ≥44×44 em `pointer: coarse`.
- [ ] `prefers-reduced-motion` respeitado.
- [ ] Modal com foco preso, `Esc` fecha, foco retorna ao gatilho.
- [ ] Valores monetários com `aria-label` legível por extenso.
- [ ] Ícone puramente decorativo com `aria-hidden`.
- [ ] Funciona em 320 px de largura e com zoom de 200%.

---

## 12. Governança

**Os tokens são a única fonte de cor.** Fora de `globals.css`, o código não deve
conter valor hexadecimal, `rgb()`, `oklch()` literal ou classe utilitária de cor
nomeada do Tailwind (`bg-blue-500`, `text-orange-600`).

Verificação sugerida em CI:

```bash
# Falha se encontrar cor literal fora do arquivo de tokens
rg -n --glob '!src/app/globals.css' --glob '!*.svg' \
   -e '#[0-9a-fA-F]{3,8}\b' \
   -e '\b(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b' \
   src/ && exit 1 || exit 0
```

Exceções legítimas: cores escolhidas pelo usuário para categorias, e as logos em
SVG. Ambas precisam de comentário explicando.

**Ao adicionar um token novo:** defina em `:root` e `.dark`, exponha em
`@theme inline`, registre nesta página com o contraste medido, e explique quando
usar. Token sem regra de uso vira token mal usado.
