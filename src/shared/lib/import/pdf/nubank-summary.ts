import { parseBrazilianAmountOrNull } from "@/shared/lib/import/helpers";
import {
	roundMoney,
	SOURCE_ROUNDING_TOLERANCE,
} from "@/shared/lib/import/invoice-total";

/**
 * O bloco "RESUMO DA FATURA ATUAL" da fatura Nubank, lido como um livro.
 *
 * O banco entrega, em toda fatura, uma conciliação que fecha ao centavo:
 *
 *     Fatura anterior − Pagamento recebido − Créditos
 *       + Encargos de financiamento + Compras + Outros = Total a pagar
 *
 * Ler isso e exigir que feche é a diferença entre conferir e adivinhar. Toda vez
 * que o app inferiu essa aritmética a partir de fonte mais fraca — linha de
 * carrego do OFX, total cadastrado, "deve ter pagado tudo" — ele errou, e o erro
 * só apareceu quando alguém foi conferir à mão.
 *
 * `Saldo financiado` é deliberadamente **informativo**: ele é derivado
 * (`anterior − pagamento`), e somá-lo erraria junho/2026 em R$ 3.025,23.
 */

const SUMMARY_START = /RESUMO\s+DA\s+FATURA\s+ATUAL/i;

/**
 * Onde o bloco termina. O primeiro que aparecer manda.
 *
 * Delimitar importa: hoje as regexes do resumo varrem o documento inteiro, e o
 * Nubank imprime "Total a pagar" também na área do boleto e dentro do detalhe do
 * parcelamento — então a primeira ocorrência do documento não é a do resumo.
 */
const SUMMARY_END_PATTERNS = [
	/Pagamento\s+m[íi]nimo/i,
	/O\s+Nubank\s+declara/i,
	/PR[ÓO]XIMAS\s+FATURAS/i,
	/TRANSA[ÇC][ÕO]ES/i,
	/LIMITES\s+DISPON[ÍI]VEIS/i,
];

/** Distância máxima entre o rótulo e o valor, em caracteres. */
const MAX_LABEL_GAP = 90;

export type InvoiceSummaryCredit = {
	label: string;
	amount: number;
};

export type InvoiceSummaryLedger = {
	/** Total da fatura passada, como o banco declara. */
	previousInvoice: number | null;
	/** Soma de todos os "Pagamento recebido" do bloco, em módulo. */
	paymentsReceived: number;
	/** Créditos que abatem a fatura: parcelamento, estorno, encerramento. */
	credits: InvoiceSummaryCredit[];
	/**
	 * "Saldo financiado" — informativo, não entra na soma.
	 *
	 * É `previousInvoice − paymentsReceived` calculado pelo próprio banco.
	 */
	financedBalance: number | null;
	/** Juros + IOF de financiamento. */
	financingCharges: number;
	purchases: number | null;
	otherEntries: number | null;
	/** "Total a pagar" — o número que o banco cobra. */
	totalDue: number | null;
	/** Soma dos componentes menos o total declarado. */
	residual: number;
	/** A conciliação fecha dentro da tolerância de centavos do banco. */
	balances: boolean;
};

type LabelHit = {
	/** Valor em módulo. */
	amount: number;
	/** O documento imprimiu sinal negativo antes do `R$`. */
	printedNegative: boolean;
	/** Rótulo como apareceu, para o usuário reconhecer o crédito. */
	matchedLabel: string;
};

/**
 * Recorta o bloco do resumo.
 *
 * `extractPdfText` junta todos os itens de uma página com um espaço, então não
 * existem linhas: o recorte é a única forma de dar contexto às buscas por rótulo.
 */
export function sliceNubankSummaryBlock(text: string): string | null {
	const start = text.search(SUMMARY_START);
	if (start === -1) return null;

	const afterStart = text.slice(start);
	let end = afterStart.length;

	for (const pattern of SUMMARY_END_PATTERNS) {
		// A partir de 1 para não casar o próprio cabeçalho de início.
		const index = afterStart.slice(1).search(pattern);
		if (index !== -1 && index + 1 < end) end = index + 1;
	}

	return afterStart.slice(0, end);
}

function buildLabelPattern(label: string): RegExp {
	return new RegExp(
		`(${label})[\\s\\S]{0,${MAX_LABEL_GAP}}?([-−–])?\\s*R\\$\\s*([\\d.]+,\\d{2})`,
		"gi",
	);
}

function readLabelHits(slice: string, label: string): LabelHit[] {
	const hits: LabelHit[] = [];

	for (const match of slice.matchAll(buildLabelPattern(label))) {
		const amount = parseBrazilianAmountOrNull(match[3] ?? "");
		if (amount == null) continue;

		hits.push({
			amount: Math.abs(amount),
			printedNegative: Boolean(match[2]),
			matchedLabel: (match[1] ?? "").trim(),
		});
	}

	return hits;
}

function readSingle(slice: string, label: string): LabelHit | null {
	return readLabelHits(slice, label)[0] ?? null;
}

/** Rótulos de crédito: abatem a fatura. */
const CREDIT_LABELS = [
	"Cr[ée]dito de parcelamento",
	"Estorno de juros(?: de rotativo)?",
	"Estorno de IOF",
	"Encerramento de d[íi]vida",
	"Cr[ée]dito de atraso",
	"Reembolso",
];

/** Encargos de financiamento: somam à fatura. */
const FINANCING_CHARGE_LABELS = [
	"Juros de financiamento",
	"IOF de financiamento",
];

export function parseNubankInvoiceSummary(
	text: string,
): InvoiceSummaryLedger | null {
	const slice = sliceNubankSummaryBlock(text);
	if (!slice) return null;

	const previousInvoiceHit = readSingle(slice, "Fatura anterior");
	const totalDueHit = readSingle(slice, "Total a pagar");

	// Sem os dois extremos não há conciliação para conferir.
	if (!previousInvoiceHit && !totalDueHit) return null;

	const paymentHits = readLabelHits(slice, "Pagamento recebido");
	const paymentsReceived = roundMoney(
		paymentHits.reduce((total, hit) => total + hit.amount, 0),
	);

	const credits: InvoiceSummaryCredit[] = [];
	for (const label of CREDIT_LABELS) {
		for (const hit of readLabelHits(slice, label)) {
			credits.push({ label: hit.matchedLabel, amount: hit.amount });
		}
	}

	const financingCharges = roundMoney(
		FINANCING_CHARGE_LABELS.reduce((total, label) => {
			const hit = readSingle(slice, label);
			return hit ? total + hit.amount : total;
		}, 0),
	);

	const financedBalanceHit = readSingle(slice, "Saldo financiado");
	const purchasesHit = readSingle(slice, "Total de compras");
	const otherEntriesHit = readSingle(slice, "Outros lan[çc]amentos");

	const previousInvoice = previousInvoiceHit
		? signedFromPrinted(previousInvoiceHit)
		: null;
	const purchases = purchasesHit ? signedFromPrinted(purchasesHit) : null;
	const otherEntries = otherEntriesHit
		? signedFromPrinted(otherEntriesHit)
		: null;
	const totalDue = totalDueHit ? signedFromPrinted(totalDueHit) : null;

	const creditsTotal = roundMoney(
		credits.reduce((total, credit) => total + credit.amount, 0),
	);

	const componentsTotal = roundMoney(
		(previousInvoice ?? 0) -
			paymentsReceived -
			creditsTotal +
			financingCharges +
			(purchases ?? 0) +
			(otherEntries ?? 0),
	);

	const residual =
		totalDue == null ? 0 : roundMoney(componentsTotal - totalDue);

	return {
		previousInvoice,
		paymentsReceived,
		credits,
		financedBalance: financedBalanceHit
			? signedFromPrinted(financedBalanceHit)
			: null,
		financingCharges,
		purchases,
		otherEntries,
		totalDue,
		residual,
		balances:
			totalDue != null && Math.abs(residual) <= SOURCE_ROUNDING_TOLERANCE,
	};
}

function signedFromPrinted(hit: LabelHit): number {
	return hit.printedNegative ? -hit.amount : hit.amount;
}
