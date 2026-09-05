# Plano de redesign — OpenMonetis

Reposicionamento visual completo: nova paleta, nova marca, nova tipografia e um
`DESIGN.md` reconstruído do zero como sistema de tokens governado.

**Stack afetada:** Next.js (App Router) · Tailwind CSS 4 · shadcn/ui · Radix ·
`next/font` · PWA · landing pública em `openmonetis.com`

---

## 1. Diagnóstico

O laranja não é só "batido" — ele tem um problema funcional neste produto
específico.

Num app financeiro a cor tem trabalho semântico: verde é receita, vermelho é
despesa, âmbar é alerta. O laranja da marca cai **exatamente entre** âmbar e
vermelho. O resultado é que o olho não consegue separar "isto é a marca" de
"isto é um aviso" ou "isto é uma despesa". Toda a interface adquire uma
temperatura de urgência que o conteúdo não pede. Somado a isso, as superfícies
quentes atuais reduzem a distância percebida entre fundo e estado de erro.

Além disso:

- A **Bricolage Grotesque** é expressiva e tem personalidade, mas os algarismos
  dela não foram desenhados para coluna de tabela. Num produto onde a tela mais
  usada é uma lista de valores alinhados, isso é um custo diário.
- Não há distinção entre **cor de marca** e **cor de estado** no sistema atual —
  os dois usam a mesma faixa cromática.
- A paleta de gráficos precisa ser reconstruída com verificação de daltonismo, que
  não é opcional em produto financeiro (afeta ~1 em 12 homens).

## 2. A tese

> **A cor da marca ocupa um eixo que nenhum estado financeiro usa.**

Índigo profundo para a marca. O eixo verde-água ↔ vermelho fica inteiramente
livre para significar dinheiro. Âmbar fica livre para significar alerta. Nada
compete.

Isso vem acompanhado de uma segunda decisão, esta baseada em medição e não em
gosto: **cor nunca é o único canal**. Simulamos a paleta sob os três tipos de
daltonismo e a conclusão é dura — nenhuma combinação de matiz separa receita de
despesa de forma confiável. A separação real vem do sinal (`+`/`−`) e da seta.
Os números estão na seção 9 do `DESIGN.md`.

## 3. Direções de cor

Três propostas. A A está recomendada e é a que está totalmente especificada no
`DESIGN.md`; as outras duas ficam registradas caso a decisão mude.

### A — Índigo Cofre · recomendada

Neutros frios com viés azul, marca em índigo profundo `#3556B1`, receita em
verde-água `#238077`, despesa em vermelho escuro `#AC0D27`.

Sóbrio sem ser corporativo. Sai do laranja sem cair no azul-de-banco genérico
(o índigo é notavelmente mais escuro e mais roxo que o azul institucional). Passa
em todos os critérios de contraste em ambos os temas, e o botão primário sólido
tem 6.45:1 entre texto e fundo.

**Risco:** índigo é uma escolha popular em ferramentas de produtividade. Mitigado
pela profundidade do tom — `L 0.48` é bem mais escuro que o índigo saturado
típico de SaaS — e pelo neutro frio, que empurra a leitura para "instrumento" e
não para "startup".

### B — Grafite e Lima

Quase monocromático em grafite, com um único acento lima-elétrico de alta croma.
Muito distintivo, ótimo em dark mode.

**Risco real:** fundo quase-preto com um acento verde-ácido é hoje um dos visuais
mais reproduzidos em interface gerada por IA e em landing de infraestrutura. Pode
soar datado em doze meses. Também é mais difícil de acertar no tema claro.

### C — Azul-Noite

Superfícies navy com acento ciano, dark-first, tema claro como derivado.

Seguro e credível, é o vocabulário clássico de confiança financeira. O custo é
que fica muito perto do que todo banco já faz, e o ciano briga com o verde-água
da receita.

---

## 4. Marca

### Conceitos

**1. Sinal — recomendado.** Os glifos `+` e `−` fundidos numa forma sólida única.
É literalmente o que o produto faz: registrar entradas e saídas. Silhueta cheia,
então sobrevive a 16 px e ao recorte circular do ícone maskable do Android.

**2. Coluna.** Três barras de larguras diferentes alinhadas à direita, como uma
coluna de valores num livro-caixa. Bonito e muito específico ao domínio, mas o
traço fino sofre em tamanho pequeno.

**3. Cofre aberto.** Um anel com uma fenda, referenciando ao mesmo tempo
"open source" e um disco de cofre. Mais conceitual, menos imediato.

### Entregáveis

Lista completa de arquivos, grid de construção, área de proteção e o teste de
aprovação de três etapas estão na seção 2 do `DESIGN.md`.

Fácil de esquecer, mas obrigatório: **regenerar as capturas de tela**. Hoje
existem `dashboard-preview-light.png`, `pwa-preview-light.webp`,
`companion-preview-light.webp` e a imagem OG — todas mostram a interface laranja
e aparecem no README, na landing e em todo link compartilhado.

---

## 5. Fases de execução

Cada fase tem critério de aceite. Não avance sem cumprir.

### Fase 0 — Auditoria · S

Mapear tudo que está fora do sistema de tokens antes de mexer em qualquer cor.

```bash
# Cores literais e utilitários nomeados do Tailwind fora do arquivo de tokens
rg -n --glob '!src/app/globals.css' \
   -e '#[0-9a-fA-F]{3,8}\b' -e 'oklch\(' -e 'rgba?\(' src/

# Uso direto de laranja/âmbar
rg -n -e '\b(bg|text|border|ring|fill|stroke)-(orange|amber|yellow)-[0-9]{2,3}\b' src/

# Onde a marca aparece
rg -rn -e 'Bricolage' -e 'logo' -e 'theme-color' -e 'manifest' src/ public/
```

**Aceite:** planilha ou issue listando cada ocorrência com o token que vai
substituí-la. Nenhuma decisão de cor tomada ainda.

### Fase 1 — Fundação de tokens · M

Reescrever `src/app/globals.css` com o bloco `:root` / `.dark` da direção
escolhida e expor tudo em `@theme inline`.

Estratégia de compatibilidade: **manter todos os nomes de token existentes**
(`--primary`, `--muted`, etc.) e apenas trocar os valores. Assim a maior parte da
interface muda de cor sem que nenhum componente seja tocado. Só os tokens novos
(`--positive`, `--negative`, `--primary-subtle`, `--warning-surface`...) exigem
código novo.

**Aceite:** aplicação sobe, nenhum componente quebra, nenhum laranja visível,
`pnpm build` limpo. Ainda vai haver inconsistência — é esperado.

### Fase 2 — Semântica financeira · M

Introduzir `--positive` / `--negative` / `--warning` / `--info` e suas superfícies,
e criar um componente único `<Money />` que centraliza formatação, sinal, seta,
cor, `tabular-nums` e modo privacidade.

Esse componente é o ponto de maior alavancagem do projeto inteiro: hoje a lógica
de "verde se positivo, vermelho se negativo" provavelmente está repetida em
dezenas de lugares. Centralizar resolve consistência, acessibilidade e o modo
privacidade de uma vez.

**Aceite:** `rg 'text-green|text-red|text-emerald'` em `src/` não retorna nada.
Todo valor na interface passa por `<Money />`.

### Fase 3 — Tipografia · S

Trocar as fontes em `src/app/fonts.ts` e no layout raiz, aplicar `--font-mono` em
todo contexto numérico, ajustar a escala de tipo.

**Aceite:** uma coluna de valores com magnitudes diferentes fica perfeitamente
alinhada; zero e letra O são distinguíveis num extrato.

### Fase 4 — Componentes base · M

`button`, `input`, `card`, `badge`, `table`, `dialog`, `select` em
`src/shared/components/ui/`. Aplicar a especificação de botão do `DESIGN.md`:
altura 36, raio 10, `active:scale-[0.985]`, `focus-visible` com anel e offset,
`transition` nomeando propriedades, alvo de 44 px no mobile, estado de carregamento
com largura travada.

**Aceite:** navegação inteira por teclado com foco sempre visível; nenhum salto de
layout ao clicar em botão que carrega; alvos de toque medidos no DevTools mobile.

### Fase 5 — Marca · M

Desenhar o símbolo, gerar todos os arquivos, atualizar
`src/shared/components/brand/`, `public/`, o manifest do PWA e o `theme-color`
(dois valores, um por esquema de cor). Regenerar as capturas.

**Aceite:** ícone testado instalado em Android e iOS; favicon legível a 16 px;
prévia do link renderizando corretamente no WhatsApp e no X.

### Fase 6 — Telas · L

Na ordem: lançamentos → dashboard → cartões e faturas → orçamentos → relatórios →
configurações → landing → autenticação.

Lançamentos vem primeiro porque é a tela mais usada e é onde as decisões
tipográficas e de densidade se provam. Se funcionar lá, funciona no resto.

A landing (`src/features/landing/`) vem depois do app, não antes — ela deve
espelhar o produto real, não uma versão idealizada dele.

**Aceite:** cada tela revisada em claro e escuro, em 320 px e em desktop.

### Fase 7 — Gráficos · M

Aplicar `--chart-1` a `--chart-5`, impor o limite de 5 séries com agrupamento em
"Outros", adicionar rótulo direto, padrão nas séries de despesa e tooltip
completo.

**Aceite:** cada gráfico passa por um simulador de daltonismo e continua
interpretável.

### Fase 8 — Sistema e governança · S

Publicar o novo `DESIGN.md`, adicionar a verificação de cor literal ao CI,
atualizar a seção Design System do `README.md` e as instruções visuais do
`AGENTS.md` / `CLAUDE.md` para que futuras contribuições assistidas por IA já
nasçam dentro do sistema.

**Aceite:** um PR que introduza `#FF6600` falha no CI.

### Fase 9 — QA e lançamento · M

Varredura de contraste automatizada, teste de teclado, teste em leitor de tela nas
telas principais, verificação em 320 px, `CHANGELOG.md`, bump de versão e nota de
release com comparativo antes/depois.

**Aceite:** checklist da seção 11 do `DESIGN.md` completa.

---

## 6. Caminho crítico

```
Fase 0 ─→ Fase 1 ─┬─→ Fase 2 ─→ Fase 4 ─→ Fase 6 ─→ Fase 9
                  ├─→ Fase 3 ─────────────↗
                  └─→ Fase 7 ─────────────↗

Fase 5 (marca) roda em paralelo, entra antes da Fase 9
Fase 8 documenta conforme as decisões são tomadas
```

A Fase 1 destrava tudo. As fases 3, 5 e 7 são independentes entre si e podem ser
paralelizadas. A Fase 6 é a mais longa e concentra o risco de cronograma.

---

## 7. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Cores literais espalhadas pelo código | Inconsistência que só aparece semanas depois | Fase 0 mapeia tudo; Fase 8 impede reincidência |
| Cores de categoria escolhidas pelo usuário colidem com a nova paleta | Badges ilegíveis | Calcular a cor do texto por contraste em vez de fixar branco |
| Regressão no tema escuro | Metade da base de usuários afetada | Todo PR revisado nos dois temas, sem exceção |
| Prints e OG desatualizados | Marca inconsistente em todo link compartilhado | Item explícito da Fase 5 |
| Escopo escorregando para refatoração funcional | Projeto nunca termina | Este redesign não muda comportamento. Bug encontrado vira issue separada |
| Índigo soar genérico | Perde o objetivo de "algo novo" | Validar a Fase 1 com uma captura lado a lado antes de investir na Fase 6 |

---

## 8. Como medir se deu certo

Não por "ficou bonito". Por:

1. Zero cores literais fora de `globals.css`.
2. 100% dos tokens de texto passando em 4.5:1 nos dois temas — já verificado na
   paleta proposta.
3. Todo valor monetário renderizado por um único componente.
4. Todo gráfico interpretável sob deuteranopia.
5. Toda tela funcional em 320 px.
6. Navegação completa por teclado com foco visível.

---

## 9. Ponto de partida para o Claude Code

```
Contexto: OpenMonetis, Next.js + Tailwind 4 + shadcn/ui. Estamos executando o
redesign descrito em PLANO-REDESIGN.md, direção "Índigo Cofre". O novo
DESIGN.md já está no repositório e é a fonte de verdade.

Tarefa: Fase 0 — auditoria.

1. Rode as buscas da seção "Fase 0" do plano.
2. Produza uma tabela: arquivo, linha, valor encontrado, token do DESIGN.md que
   deve substituí-lo, e um nível de confiança.
3. Sinalize separadamente qualquer caso em que nenhum token existente sirva —
   esses viram tokens novos e precisam de decisão antes de eu prosseguir.

Não altere nenhum arquivo nesta etapa.
```

Depois da Fase 0, alimente uma fase por sessão. Cada fase tem critério de aceite
próprio justamente para caber numa sessão sem perder contexto.
