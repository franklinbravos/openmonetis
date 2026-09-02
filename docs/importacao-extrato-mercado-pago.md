# Importação do Extrato do Mercado Pago em PDF

> Plano de implementação. O extrato do Mercado Pago é o único dos três bancos
> cadastrados sem parser, e é o arquivo mais rico dos três: sinal explícito por
> linha, ID da operação por lançamento e saldo corrido que fecha linha a linha.

## Contexto

O usuário tentou importar o extrato e recebeu **"Ocorreu um erro inesperado.
Tente novamente."** — duas vezes na mesma tela, sem dizer o que estava errado.
Duas causas somadas:

1. Não existe parser de Mercado Pago. `parsePdfText` percorre a cadeia de
   detecção, nenhuma reconhece, e cai no `throw` final.
2. A mensagem desse `throw` — que diz exatamente quais formatos existem — **nunca
   chega ao usuário**: `handleActionError` só repassa mensagem de `ActionError`.

O Mercado Pago já aparece de lado no sistema: o Nubank recebe Pix dele, e as
únicas duas linhas que a conta tem em agosto/2026 são o **mesmo** `-R$ 100,00` de
19/08 duplicado, sintetizado a partir de outros extratos. O arquivo tem 32
lançamentos.

## O documento

`extractPdfText` cola os itens de texto de uma página com espaço e separa páginas
com `\n`. O cabeçalho da página 1 sai assim, em uma linha:

```
1/3  EXTRATO DE CONTA  Franklin Diogo Aparecido Bravos Querino Dos Santos
CPF/CNPJ: 32253229890   1   70313800492 Agência:   Conta:
De 01-08-2026 al 31-08-2026 Periodo:
Saldo inicial: R$ 10,63   Entradas: R$ 942,20   Saidas: R$ -947,32
DETALHE DOS MOVIMENTOS   Data   Descrição   ID da operação   Valor   Saldo
```

Linha de movimento: `DD-MM-YYYY  <descrição>  <ID (9+ dígitos)>  R$ <valor com
sinal>  R$ <saldo corrido>`.

Peculiaridades reais: `al` é espanhol (o Mercado Pago é argentino), `Periodo` e
`Saidas` vêm **sem acento**, o CPF vem **sem máscara** (diferente do Nubank), e
`Saldo final: R$ 5,51` é impresso **no meio do documento**, no fim da página 1.

### As cinco conferências que o arquivo permite

Todas verificadas rodando pdfjs sobre `mp_agosto_pdf_260902085126.pdf`:

| # | conferência | resultado |
|---|---|---|
| 1 | `inicial 10,63 + entradas 942,20 − saídas 947,32 = 5,51` | = `Saldo final` declarado |
| 2 | soma das linhas por direção | +942,20 / −947,32, idênticas às declaradas |
| 3 | `saldo anterior + valor = saldo da linha`, nas 32 | **zero quebras** |
| 4 | abertura derivada (`10,64 − 0,01`) | = `Saldo inicial` declarado |
| 5 | fechamento derivado (última linha) | = `Saldo final` declarado |

## A armadilha central: o ruído corrompe em silêncio

Esta é a descoberta que molda o plano. Rodando o parse nas quatro combinações
(com/sem recorte em `DETALHE DOS MOVIMENTOS`, com/sem limpeza de rodapé):

| variante | linhas | entradas | saídas | cadeia |
|---|---|---|---|---|
| sem recorte, sem limpeza | **32** | 942,20 | −947,32 | **fecha** |
| só recorte | **32** | 942,20 | −947,32 | **fecha** |
| recorte + limpeza | 32 | 942,20 | −947,32 | fecha |

**A contagem não muda.** O ruído não cria linha falsa nem apaga linha: ele
**corrompe uma linha existente**, preservando valor e saldo. Duas ocorrências:

**Rodapé.** `Data de geração: 02-09-2026` vira a data de um movimento, e a
descrição engole o rodapé inteiro mais a data e a descrição reais da primeira
linha da página 3:

```
data: 02-09-2026
desc: "Você tem alguma dúvida? … mercadopago.com.br 3/3 Data Descrição ID da
       operação Valor Saldo 19-08-2026 Pagamento com QR Pix SAVEGNAGO- …"
valor: -14,94   saldo: 196,28      → 211,22 − 14,94 = 196,28, a cadeia fecha
```

**Cabeçalho.** `De 01-08-2026` vira movimento e engole o bloco de saldos mais a
primeira linha real. `10,63 + 0,01 = 10,64`: cadeia fecha, totais fecham, 32
linhas — e a data `01-08-2026` está **dentro** do período, então nem ela denuncia.

Consequência: **nenhuma das cinco conferências pega esses bugs.** O recorte e a
limpeza não são higiene, são estruturais. E os testes precisam afirmar **data e
descrição de duas linhas específicas**, com igualdade exata — não só contagens e
somas.

O único guarda aritmético que pega o caso do rodapé é **descartar linha com data
fora do período declarado**: o descarte quebra a conferência 2, que é o alarme
visível. Falhar alto é melhor do que gravar um lançamento datado em setembro num
extrato de agosto.

## Plano

### 1. Novo módulo `src/shared/lib/import/pdf/mercado-pago-statement.ts`

Espelha `nubank-statement.ts` na forma (`AMOUNT`, `PAGE_NOISE_PATTERNS` +
`stripPageNoise`, funções exportadas por responsabilidade) e
`inter-bank-statement.ts` no modelo de dados (sinal por linha, saldo corrido, tipo
interno com campos extra removidos por destructuring no retorno).

```ts
export function isMercadoPagoBankStatementPdf(text: string): boolean;

export type MercadoPagoStatementMovement = ImportedTransaction & {
  runningBalance: number;
  signedAmount: number;
  operationId: string;
};

/** Uma entrada por linha: aponta qual linha quebrou, não só que quebrou. */
export type MercadoPagoStatementChainCheck = {
  index: number;
  date: string;
  description: string;
  previousBalance: number;
  signedAmount: number;
  expectedBalance: number;
  declaredBalance: number;
  balances: boolean;
};

export type MercadoPagoStatementParseResult = {
  transactions: MercadoPagoStatementMovement[];
  chain: MercadoPagoStatementChainCheck[];
  /** Descartadas: data fora do período declarado. */
  outOfPeriodCount: number;
  /** Descartadas: valor zero. */
  zeroAmountCount: number;
};

export type MercadoPagoStatementHeader = {
  holder: { name: string | null; document: string | null } | null;
  agency: string | null;
  accountNumber: string | null;
  period: { from: string; to: string } | null;
  declaredOpeningBalance: number | null;
  declaredTotalIn: number | null;
  declaredTotalOut: number | null;   // em módulo
  declaredClosingBalance: number | null;
};

export function parseMercadoPagoStatementHeader(text): MercadoPagoStatementHeader;
export function parseMercadoPagoStatementMovements(
  text: string,
  period?: { from: string; to: string } | null,
): MercadoPagoStatementParseResult;
export function parseMercadoPagoStatementBalances(
  header, result, period,
): AccountStatementBalances | null;
export function parseMercadoPagoBankStatementPdf(text): ImportStatement;
```

**Regexes**, todos validados no arquivo real:

```
AMOUNT   = -?\d{1,3}(?:\.\d{3})*,\d{2}     ← sem R$ embutido: no MP o sinal vem DEPOIS do R$
linha    = (\d{2}-\d{2}-\d{4})\s+(.+?)\s+(\d{9,})\s+R\$\s*(AMOUNT)\s+R\$\s*(AMOUNT)
cabeçalho= EXTRATO DE CONTA\s+(.+?)\s+CPF\/CNPJ:\s*(\d{11,14})\s+(\d+)\s+(\d+)\s+Ag[êe]ncia:\s*Conta:
período  = De\s+(\d{2}-\d{2}-\d{4})\s+(?:al?|at[eé])\s+(\d{2}-\d{2}-\d{4})\s*Per[íi]odo:
saldos   = Saldo inicial:\s*R\$\s*(A)\s+Entradas:\s*R\$\s*(A)\s+Sa[íi]das:\s*R\$\s*(A)
final    = Saldo final:\s*R\$\s*(A)
```

Aceitar `al|a|até` e `Per[íi]odo`/`Sa[íi]das` já agora: é a alternativa mais
barata a um bug quando o Mercado Pago corrigir a acentuação.

**`PAGE_NOISE_PATTERNS`** — `Data de geração: DD-MM-YYYY`; `Você tem alguma
dúvida?[\s\S]*?mercadopago\.com\.br` **consumindo o `N/M` seguinte**; marcador de
página **ancorado** em `(^|\n)\s*\d{1,2}/\d{1,2}`; cabeçalho de coluna repetido;
`Saldo final: R$ x`.

Três regras que o comentário do módulo precisa registrar:

- **O marcador de página nunca pode ser um `\d/\d` solto** — casaria dentro de uma
  descrição futura (`Parcela 1/3`) e a cortaria no meio. Ancorar custa zero.
- **`stripPageNoise` substitui por `" "` e nunca consome `\n`.** O `.` do `(.+?)`
  não casa `\n`, e é esse newline entre páginas a única coisa que impede uma linha
  de engolir a página seguinte inteira.
- **O bloco de saldos é lido do texto completo**, antes da limpeza; só a seção de
  movimentos é limpa.

**`yield` obrigatoriamente `0`.** O cabeçalho do Mercado Pago não declara
"Rendimento líquido" — os R$ 0,86 já estão dentro de `Entradas: 942,20`. Se
preenchermos `yield: 0.86`, `computeStatementYieldGap`
(`account-statement-balances.ts:83-97`) procura **uma** linha com `/rendimento/i`
de valor ≈ 0,86, não encontra (são 18 linhas de centavos), devolve gap 0,86 — e
`statement-balance-reconciliation.ts:387-411` **grava no banco** um "Rendimento"
de R$ 0,86. Rendimento contado duas vezes.

**Linha de valor zero é descartada no parser.** `importTransactionsAction` valida
`amount: z.number().positive()` em quatro schemas (`import-action.ts:124,175,231,937`):
uma linha de R$ 0,00 chegando à confirmação derruba o **lote inteiro** com um
`ZodError`. Descartar é seguro — valor zero não move o saldo, então a cadeia e os
totais continuam fechando.

### 2. `externalId` = ID da operação, cru

Único dos três extratos com id de banco por linha. Usar o id cru, não
`makeSyntheticExternalId`.

O caso que decide: as **7 linhas CONECTCAR de 06/08** têm valores repetidos aos
pares (14,30 ×2, 14,50 ×2, 3,65 ×2), mesma data e mesma descrição. Com id
sintético elas colidem, `uniquifyImportedExternalIds` sufixa `#2`, e a identidade
da linha passa a depender da **ordem no arquivo** — se o Mercado Pago reordenar
numa reexportação, o `#2` muda de dono e a reimportação duplica ou pula a linha
errada. Os 32 ids reais são distintos.

Segundo argumento: `dedupeImportedTransactionsByFingerprint` (`helpers.ts:437`)
nunca descarta linha **com** id, então as 18 linhas de `Rendimentos` de R$ 0,01
sobrevivem — inclusive duas do mesmo dia com o mesmo valor.

Nada no código assume formato de id além de duas coisas, e um id numérico puro é
neutro nas duas: o `#\d+$` de `stripImportExternalIdSuffix` e o `|` de
`isSyntheticImportExternalId`.

**Risco documentado:** a busca de duplicata é escopada por **usuário, não por
conta** (`checkDuplicateFitIds`, `import-action.ts:311-335`), e na gravação
`plan === "skip"` faz a linha **desaparecer sem aviso** (`import-action.ts:2161`).
Os FITIDs do OFX Inter são numéricos de 12 dígitos (`202608110771`) e os ids do
Mercado Pago de 12–13 (`171243324951`) — o espaço se sobrepõe. Aceitamos o risco
(prefixos divergem na prática, e a colisão apareceria como duplicata na revisão
antes de confirmar) e apontamos `import-action.ts:2161` no comentário do módulo.
Se algum dia incomodar, prefixar `mp:` resolve sem quebrar nada.

### 3. `parseDashDateDMY` em `helpers.ts`

Não existe parser de `DD-MM-YYYY` (só `parseSlashDateDMY` para `DD/MM/YYYY`).
Adicionar logo depois dele (`helpers.ts:117`), mesma assinatura
`string → string | null`, passando pelo mesmo guarda de calendário
`asValidDateOnly`.

Vai em `helpers.ts` e não no módulo porque **`asValidDateOnly` é privado do
arquivo**: resolver localmente obrigaria a reimplementar o guarda, que é
exatamente a duplicação que já deixou data inválida chegar a uma coluna `not
null`. E `DD-MM-YYYY` é formato, não peculiaridade do Mercado Pago.

### 4. Dispatch: antes do Inter

```
Itaú cartão → Nubank cartão → Inter cartão → Nubank extrato
  → [NOVO] Mercado Pago extrato → Inter extrato → throw
```

**Detector**: `/DETALHE DOS MOVIMENTOS/i` **e** `/ID da opera[çc][ãa]o/i` — dois
marcadores estruturais, ambos na área de movimentos, ambos exclusivos do Mercado
Pago entre os formatos suportados. Não exigir `/Mercado Pago/i`: a string aparece
**uma única vez** no arquivo, no rodapé da página 3, e um extrato de página única
provavelmente não a traz — o detector morreria justo no caso pequeno.

**Hoje o Inter não captura o Mercado Pago** — confirmado empiricamente:
`isInterBankStatementPdf(textoMP)` é `false`, porque o texto não tem `Período:`
(acentuado) nem `Saldo por transação`. O risco é **futuro**: no dia em que o
Mercado Pago acentuar "Período", o arquivo cai no parser do Inter, que não acha
nenhum `Saldo do dia:`, devolve zero transações e mostra "Nenhuma transação
encontrada no PDF." — falha alta, mensagem errada, horas de investigação. Custa
uma linha ficar imune.

**Endurecer `isInterBankStatementPdf`** (`inter-bank-statement.ts:36-41`) no mesmo
commit, trocando `Período:` pelos tokens que o **próprio parser já exige**:

```ts
!/Resumo da fatura|DESPESAS DO M[ÊE]S/i.test(text) &&
(/Saldo por transação/i.test(text) || /Saldo do dia:/i.test(text))
```

O argumento que fecha a questão: `parseInterBankStatementMovements`
(`inter-bank-statement.ts:78-81`) exige literalmente `Saldo do dia:` para emitir
**qualquer** linha. Um texto sem esses tokens já produzia zero transações e caía
no `throw`. Endurecer para o que o parser já exige **não pode** quebrar o que
funcionava — só troca "erro genérico do Inter" por "PDF não reconhecido", que é a
mensagem correta. Verificado: a fixture de `inter-bank-statement.test.ts` tem os
dois tokens, e o teste de dispatch (`pdf-parser-inter.test.ts:68-85`) lê o PDF
real, que imprime `Instituição: Banco Inter` **e** `Saldo por transação`.

### 5. A mensagem de erro precisa chegar à tela

Em `pdf-parser.ts:691`, trocar `new Error(...)` por **`ActionError`** (de
`@/shared/lib/actions/action-error`) e citar o Mercado Pago no texto.
`handleActionError` já repassa mensagem de `ActionError`
(`shared/lib/actions/helpers.ts:28-30`), então a action não muda.
`action-error.ts` é módulo folha, sem imports — não contamina o bundle do cliente,
e `pdf-parser.ts` está no grafo do cliente via `parse-import-file.ts:5`.

No mesmo toque, **guarda de PDF sem texto** no topo de `parsePdfText`: se
`text.replace(/\s+/g,"").length` for menor que ~50, lançar mensagem própria
("Não foi possível extrair texto deste PDF. Ele pode ser um arquivo digitalizado")
— hoje um PDF escaneado dá a mesma mensagem de "não reconhecido" e manda o usuário
para o diagnóstico errado.

### 6. Rendimento com categoria, sem estragar o Inter

O usuário foi explícito: no Mercado Pago e no Nubank o rendimento **cai direto na
conta corrente** — é receita de verdade ali. No Inter ele **sai para uma conta de
investimento** e só volta no resgate manual, então `Aplicacao:`/`Resgate:` do
extrato Inter **não são rendimento**.

Função **interna** ao módulo do Mercado Pago — é o que garante o isolamento:

```
resolveCategoryRaw(desc) → /^rendimentos?$/i.test(normalized) ? "Rendimentos" : null
```

O `^…$` ancorado importa: no Mercado Pago o rendimento é a descrição inteira, e
ancorar impede que `Pagamento com QR Pix RENDIMENTOS LTDA` seja capturado.

O resto do caminho já existe: `import-page.tsx:1446-1453` casa `categoryRaw` por
nome contra as categorias do usuário, e `Rendimentos` (tipo receita) está em
`shared/lib/categories/defaults.ts:37` e existe no banco para os dois usuários. O
parser do Inter não passa a preencher `categoryRaw`, então `Aplicacao`/`Resgate`
seguem como estão — e já estão protegidos por outro caminho
(`isInvestmentMovementDescription` os marca como transferência, o que **zera** a
categoria).

Efeito observável a registrar: `categoryRaw` **sobrescreve** a memória de
descrição (`import-page.tsx:1442-1453`). Se o usuário já tinha mapeado
"Rendimentos" para outra categoria, o arquivo passa a ganhar. Correto — o arquivo
é a fonte —, mas é mudança de comportamento.

### 7. Transferência entre contas próprias (commit separado)

`19-08-2026 Pix enviado Franklin Diogo Aparecido Bravos Querino dos Santos
−100,00` é dinheiro dele para a conta dele, e o Nubank tem a entrada
correspondente de +R$ 100,00. Mas `isOwnAccountPixDescription`
(`import-transfer-detection.ts:58-70`) exige documento **mascarado** na descrição,
e o Mercado Pago não imprime documento nenhum na linha — só o nome.

Sem reconhecer, a linha entra como despesa comum. O saldo das duas contas fecha,
mas o mês conta R$ 100,00 de despesa e R$ 100,00 de receita que são a mesma
transferência, inflando os dois lados do relatório.

Extensão proposta: aceitar o casamento pelo **nome completo do titular** quando a
descrição não traz documento. Verificado que casaria — `normalizeForCompare` faz
lowercase e remove acentos, então `"…Querino Dos Santos"` do cabeçalho casa
`"…Querino dos Santos"` da descrição. Fica em **commit separado** porque a regra
passa a valer para Nubank e Inter também, e precisa de teste com caso negativo
(nome parcial não casa).

## Arquivos

| arquivo | mudança |
|---|---|
| `src/shared/lib/import/pdf/mercado-pago-statement.ts` | **novo** — detector, cabeçalho, movimentos + cadeia, saldos, statement |
| `src/shared/lib/import/pdf/mercado-pago-statement.test.ts` | **novo** |
| `src/shared/lib/import/pdf-parser-mercado-pago.test.ts` | **novo** — nível de dispatch |
| `src/shared/lib/import/pdf-parser.ts` | detecção antes do Inter; mensagem; `ActionError`; guarda de texto vazio |
| `src/shared/lib/import/pdf/inter-bank-statement.ts` | detector pelos tokens que o parser já exige |
| `src/shared/lib/import/helpers.ts` | `parseDashDateDMY` |
| `src/features/transactions/lib/import-transfer-detection.ts` | (commit 2) nome do titular sem documento |
| `docs/FEATURE-MAP.md`, `CHANGELOG.md`, `README.md`, `package.json` | formatos suportados e versão |

## Testes

Fixture no formato que `extractPdfText` produz (itens colados por espaço, uma
página por linha), **com o ruído de propósito** — marcadores `1/3`…`3/3`, os três
cabeçalhos de coluna, o `Saldo final` no fim da página 1, o `Data de geração:` e o
parágrafo do rodapé na posição real (início da página 3, sem `\n` separando).

Os dois testes que travam a armadilha central:

- **a linha `19-08` SAVEGNAGO tem `date: "2026-08-19"` e
  `description === "Pagamento com QR Pix SAVEGNAGO- SUPERMERCADOS LTDA"`**, por
  igualdade exata;
- **a primeira linha é `2026-08-03` / `"Rendimentos"` / 0,01**, por igualdade
  exata.

São os únicos que pegam a corrupção — contagem, somas e cadeia passam com o
arquivo corrompido.

Os demais:

| tema | o que prova |
|---|---|
| detecção | positiva; negativa contra extrato Nubank, extrato Inter e fatura |
| detecção cruzada | `isInterBankStatementPdf(MP)` false **e** false na variante com `Período:` acentuado |
| leitura | 32 linhas; primeira e última completas; o `\n` entre páginas não corta linha |
| cadeia | `chain.every(c => c.balances)`; fixture adulterada acusa **no índice certo** e derruba `accountBalances.balances` |
| saldos | `{ opening: 10.63, closing: 5.51, totalIn: 942.20, totalOut: 947.32, balances: true }` |
| `yield` | `yield === 0` e `computeStatementYieldGap(...) === 0` com as 18 linhas de rendimento — regressão do lançamento fantasma |
| id | `externalId === "1747687190102"`; sem `\|`; estável entre dois parses |
| id (colisão) | as 7 CONECTCAR têm 7 ids distintos, `uniquify` não gera `#2`, dedupe mantém as 32 |
| categoria | `categoryRaw === "Rendimentos"` nas 18, `null` nas outras 14 |
| fora do período | linha `05-09-2026` descartada, `outOfPeriodCount === 1`, `balances: false` |
| valor zero | descartada, `zeroAmountCount === 1`, cadeia e totais seguem fechando |
| borda | extrato de um dia; `R$ -1.234,56` com saldo negativo; descrição com 12 dígitos antes do ID real; PDF vazio lança |
| dispatch | `parsePdfText(FIXTURE)` → `source: "Mercado Pago"`; erro é `instanceof ActionError` e cita Mercado Pago |
| Inter | detecção existente segue passando; `"Período: …"` sozinho agora é **false**; nenhuma transação do Inter tem `categoryRaw` |
| `parseDashDateDMY` | `"31-08-2026"` → `"2026-08-31"`; `"31-02-2026"` → `null`; `"2026-08-31"` → `null` |

Amostra local guardada por `existsSync`, como nos outros dois, apontando para
`~/Documents/Extratos e Faturas/mp_agosto_pdf_260902085126.pdf`: 32 lançamentos,
cadeia fechando, saldos 10,63 → 5,51, **e a asserção da descrição do SAVEGNAGO** —
é no PDF real que o rodapé está na posição certa; uma fixture pode mentir sobre
isso.

## Verificação

1. `pnpm exec tsc --noEmit`, `pnpm exec vitest run`, `pnpm run lint`,
   `pnpm run build`. A CI **não roda os testes** (só typegen, `tsc`, biome e
   build), então a suíte é responsabilidade local. `pdf-parser-inter.test.ts`
   trava a suíte local por causa do teste de amostra — rodar com `--exclude`.
2. Importar o PDF no dev (`:3050`) na conta Mercado Pago. Esperado na revisão: 32
   lançamentos, **1 conferido** (o `-R$ 100,00` de 19/08, que casa com a perna já
   cadastrada) e 31 novos; as 18 linhas de `Rendimentos` já categorizadas.
3. Bloco **Saldo da conta**: inicial R$ 10,63, entradas +R$ 942,20, saídas
   −R$ 947,32, final R$ 5,51, líquido do extrato **−R$ 5,12**.
4. **Previsão concreta de divergência.** A conta tem hoje **duas** linhas de
   `-R$ 100,00` em 19/08, ambas perna sintetizada, e o extrato tem uma. O líquido
   do cadastro vai dar **−R$ 105,12** contra os −R$ 5,12 do arquivo, e o bloco
   deve apontar `1 lançamento do mês que não está no extrato · −R$ 100,00`.
   Confirmado isso, apagar a perna excedente com script em `scripts/repair/`, com
   dry-run, no mesmo critério do reparo do Inter (fica a linha de identidade mais
   forte).
5. Reimportar o mesmo arquivo: nada novo entra (o ID da operação é id de banco) e
   o bloco diz "Fecha com o extrato".

## Ordem

**Commit 1 — `feat: extrato de conta do Mercado Pago em PDF`**

1. `parseDashDateDMY` + teste (independente, primeiro).
2. O módulo completo: detector → cabeçalho → movimentos + cadeia → saldos →
   statement.
3. Os testes, **começando pelos dois de igualdade exata de descrição**.
4. Dispatch: `if` antes do Inter, mensagem, `ActionError`, guarda de texto vazio.
5. Endurecer o detector do Inter + os dois testes novos.
6. Teste de dispatch + amostra local.
7. `FEATURE-MAP.md`, `CHANGELOG.md`, `README.md`, `package.json`.

**Commit 2** — transferência própria por nome do titular (muda comportamento de
todos os bancos).

**Commit 3** — reparo da perna duplicada da conta Mercado Pago, **depois** de a
importação provar o número.

**Commit 4 (opcional)** — converter os outros `throw new Error` dos parsers de
extrato para `ActionError`: mesma classe de problema, mensagens já escritas para o
usuário.
