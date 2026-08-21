import { roundMoney } from "@/shared/lib/import/invoice-total";
import {
	INVOICE_PAYMENT_STATUS,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";

/**
 * Linhas do rotativo que o banco lança na fatura seguinte a um pagamento
 * parcial. O "valor pendente" é o que sobrou da fatura anterior; juros e IOF
 * são o custo de ter rolado.
 */
const ROLLOVER_CARRY_PATTERNS = [
	/valor\s+pendente\s+do\s+m[êe]s\s+anterior/i,
	/saldo\s+(remanescente|anterior)\s+.*rotativ/i,
];

const ROLLOVER_CHARGE_PATTERNS = [
	/juros\s+.*rotativ/i,
	/iof\s+.*rotativ/i,
	/juros\s+de\s+pagamento\s+parcial/i,
	/iof\s+de\s+pagamento\s+parcial/i,
	/encargos?\s+.*rotativ/i,
];

export function isInvoiceRolloverCarryDescription(
	description: string,
): boolean {
	return ROLLOVER_CARRY_PATTERNS.some((pattern) => pattern.test(description));
}

export function isInvoiceRolloverChargeDescription(
	description: string,
): boolean {
	return ROLLOVER_CHARGE_PATTERNS.some((pattern) => pattern.test(description));
}

type RolloverRow = {
	description: string;
	amount: number;
};

/** Valor que sobrou da fatura anterior, somando as linhas de carrego. */
export function sumInvoiceRolloverCarry(rows: RolloverRow[]): number {
	return roundMoney(
		rows.reduce((total, row) => {
			if (!isInvoiceRolloverCarryDescription(row.description)) return total;
			return total + Math.abs(row.amount);
		}, 0),
	);
}

/** Juros e IOF cobrados por ter rolado a fatura. */
export function sumInvoiceRolloverCharges(rows: RolloverRow[]): number {
	return roundMoney(
		rows.reduce((total, row) => {
			if (!isInvoiceRolloverChargeDescription(row.description)) return total;
			return total + Math.abs(row.amount);
		}, 0),
	);
}

/**
 * Data do pagamento declarado no arquivo — a mais recente, quando há várias.
 *
 * É o que permite conferir a data gravada no débito da fatura anterior contra o
 * que o banco registrou.
 */
export function findInvoicePaymentDateFromFile(
	rows: Array<{ description: string; date: string }>,
	isPaymentDescription: (description: string) => boolean,
): string | null {
	let latest: string | null = null;

	for (const row of rows) {
		if (!isPaymentDescription(row.description)) continue;
		if (!latest || row.date > latest) latest = row.date;
	}

	return latest;
}

export type PreviousInvoiceSettlement = {
	/** Total da fatura anterior, como está cadastrado. */
	previousTotal: number;
	/** O que sobrou dela e entrou nesta fatura. */
	carriedOver: number;
	/** Pagamentos que este arquivo declara. */
	filePaymentsTotal: number;
	/** Quanto foi de fato pago na fatura anterior. */
	paidOnPrevious: number;
	/**
	 * Status apurado, ou `null` quando o arquivo não traz evidência nenhuma —
	 * nem pagamento, nem carrego. Aí não há o que afirmar sobre a fatura
	 * anterior, e nada deve ser escrito.
	 */
	paymentStatus: InvoicePaymentStatus | null;
	/** Pagamento do arquivo que sobrou e amortiza a fatura atual. */
	amortizationOnCurrent: number;
	/**
	 * A evidência do arquivo fecha com o total cadastrado da fatura anterior?
	 *
	 * É a validação útil no caso quitado: o arquivo diz que se pagou X, e o
	 * cadastro da fatura anterior soma Y. Divergência aponta lançamento faltando
	 * ou valor errado no mês passado.
	 */
	reconcilesWithPreviousTotal: boolean;
};

/**
 * Como a fatura anterior foi paga, deduzido dos números do próprio arquivo.
 *
 * Todo arquivo de fatura carrega essa informação: as linhas de pagamento
 * recebido são a quitação da fatura passada, e a linha "valor pendente do mês
 * anterior" é o que dela sobrou.
 *
 * O arquivo não diz a qual fatura cada pagamento foi aplicado — e deduzir por
 * data de vencimento erra, porque um mês pode ter o pagamento do vencimento e
 * uma amortização posterior, tratados de formas diferentes pelo banco. Mas ele
 * diz quanto NÃO foi pago, e é daí que sai a conta:
 *
 * - **Com carrego:** pago = total anterior − carrego. O resto dos pagamentos
 *   amortiza a fatura atual.
 * - **Sem carrego, com pagamento:** a fatura anterior foi quitada. O que passar
 *   do total dela amortiza a atual.
 * - **Sem carrego e sem pagamento:** o arquivo não afirma nada. Status `null`.
 *
 * A tolerância de um centavo absorve o arredondamento do próprio banco: em
 * junho o total de maio (6.525,24) menos o pendente (5.525,23) dá 1.000,01
 * contra uma linha de pagamento de 1.000,00.
 */
export function resolvePreviousInvoiceSettlement(input: {
	previousTotal: number;
	carriedOver: number;
	filePaymentsTotal: number;
}): PreviousInvoiceSettlement {
	const previousTotal = roundMoney(Math.abs(input.previousTotal));
	const carriedOver = roundMoney(Math.abs(input.carriedOver));
	const filePaymentsTotal = roundMoney(Math.abs(input.filePaymentsTotal));

	const base = {
		previousTotal,
		carriedOver,
		filePaymentsTotal,
	};

	if (carriedOver > 0.01) {
		const paidOnPrevious = roundMoney(
			Math.min(previousTotal, Math.max(0, previousTotal - carriedOver)),
		);

		return {
			...base,
			paidOnPrevious,
			paymentStatus:
				paidOnPrevious > 0.01
					? INVOICE_PAYMENT_STATUS.PARTIAL
					: INVOICE_PAYMENT_STATUS.PENDING,
			amortizationOnCurrent: roundMoney(
				Math.max(0, filePaymentsTotal - paidOnPrevious),
			),
			// O pago vem do próprio total menos o carrego: fecha por construção.
			reconcilesWithPreviousTotal: true,
		};
	}

	if (filePaymentsTotal > 0.01) {
		return {
			...base,
			paidOnPrevious: roundMoney(Math.min(previousTotal, filePaymentsTotal)),
			paymentStatus: INVOICE_PAYMENT_STATUS.PAID,
			amortizationOnCurrent: roundMoney(
				Math.max(0, filePaymentsTotal - previousTotal),
			),
			reconcilesWithPreviousTotal:
				Math.abs(filePaymentsTotal - previousTotal) <= 0.02,
		};
	}

	return {
		...base,
		paidOnPrevious: 0,
		paymentStatus: null,
		amortizationOnCurrent: 0,
		reconcilesWithPreviousTotal: true,
	};
}

export type PreviousInvoiceCheck = {
	label: string;
	value: string;
	ok: boolean;
	/** Preenchido quando não confere: o outro lado da comparação. */
	detail?: string;
};

export type PreviousInvoiceReview = {
	checks: PreviousInvoiceCheck[];
	/**
	 * O arquivo não trouxe pagamento nem carrego.
	 *
	 * Acontece quando o parser não extrai a linha de pagamento — hoje o caso dos
	 * PDFs. O bloco continua aparecendo, porque a ausência de "valor pendente do
	 * mês anterior" já diz que nada ficou rolando, mas nada é afirmado sobre o
	 * pagamento e nada é gravado.
	 */
	noFileEvidence: boolean;
	/** Todos os pontos conferem. */
	allOk: boolean;
	/**
	 * A importação mudaria algo na fatura anterior.
	 *
	 * Quando nada muda — status, valor e data já corretos — não há o que
	 * confirmar nem o que gravar: o bloco é só conferência.
	 */
	hasChanges: boolean;
	/** O que muda ao confirmar, para o diálogo listar sem ambiguidade. */
	changes: {
		status: boolean;
		debitAmount: boolean;
		paymentDate: boolean;
	};
};

/**
 * Conferência da fatura anterior, ponto a ponto.
 *
 * O arquivo desta fatura carrega como a anterior foi paga, então dá para
 * comparar três coisas com o que está cadastrado: o valor pago, o status da
 * fatura e a data do pagamento. É conferência, não ação — na maioria dos meses
 * já está tudo certo, e afirmar que algo "passa a constar" seria mentira.
 */
export function buildPreviousInvoiceReview(input: {
	settlement: PreviousInvoiceSettlement;
	registeredStatus: string | null;
	registeredPaymentAmount: number | null;
	registeredPaymentDate: string | null;
	filePaymentDate: string | null;
	formatMoney: (value: number) => string;
	formatDate: (isoDate: string) => string;
}): PreviousInvoiceReview {
	const { settlement, formatMoney, formatDate } = input;
	const checks: PreviousInvoiceCheck[] = [];

	const registeredStatusLabel =
		input.registeredStatus === INVOICE_PAYMENT_STATUS.PARTIAL
			? "paga parcialmente"
			: input.registeredStatus === INVOICE_PAYMENT_STATUS.PAID
				? "paga"
				: "em aberto";

	// Sem pagamento e sem carrego não há o que conferir contra o arquivo. O que
	// ele diz, por omissão, é que nada ficou pendente.
	if (!settlement.paymentStatus) {
		checks.push({
			label: "Nada pendente no arquivo",
			value: "sem rotativo",
			ok: true,
		});
		checks.push({
			label: "Situação no cadastro",
			value: registeredStatusLabel,
			ok: input.registeredStatus === INVOICE_PAYMENT_STATUS.PAID,
			detail:
				input.registeredStatus === INVOICE_PAYMENT_STATUS.PAID
					? undefined
					: "confira se já foi paga",
		});

		return {
			checks,
			noFileEvidence: true,
			allOk: checks.every((check) => check.ok),
			hasChanges: false,
			changes: { status: false, debitAmount: false, paymentDate: false },
		};
	}

	const amountOk = settlement.reconcilesWithPreviousTotal;
	checks.push({
		label: "Valor",
		value: formatMoney(settlement.paidOnPrevious),
		ok: amountOk,
		detail: amountOk
			? undefined
			: `cadastro soma ${formatMoney(settlement.previousTotal)}`,
	});

	const statusOk = input.registeredStatus === settlement.paymentStatus;
	checks.push({
		label: "Situação",
		value:
			settlement.paymentStatus === INVOICE_PAYMENT_STATUS.PARTIAL
				? "paga parcialmente"
				: settlement.paymentStatus === INVOICE_PAYMENT_STATUS.PAID
					? "paga"
					: "em aberto",
		ok: statusOk,
		detail: statusOk ? undefined : "cadastro será ajustado",
	});

	if (input.filePaymentDate) {
		const dateOk =
			input.registeredPaymentDate != null &&
			input.registeredPaymentDate === input.filePaymentDate;
		checks.push({
			label: "Pago em",
			value: formatDate(input.filePaymentDate),
			ok: dateOk,
			detail: dateOk
				? undefined
				: input.registeredPaymentDate
					? `cadastro diz ${formatDate(input.registeredPaymentDate)}`
					: "sem data no cadastro",
		});
	}

	const debitDiffers =
		input.registeredPaymentAmount != null &&
		Math.abs(input.registeredPaymentAmount - settlement.paidOnPrevious) > 0.01;

	// A data também é corrigida ao confirmar: o arquivo diz quando o banco
	// recebeu, e deixar isso de fora fazia a conferência apontar um problema que
	// a confirmação não resolvia.
	const dateDiffers = Boolean(
		input.filePaymentDate &&
			input.registeredPaymentDate !== input.filePaymentDate,
	);

	const changes = {
		status: !statusOk,
		debitAmount: debitDiffers,
		paymentDate: dateDiffers,
	};

	return {
		checks,
		noFileEvidence: false,
		allOk: checks.every((check) => check.ok),
		hasChanges: changes.status || changes.debitAmount || changes.paymentDate,
		changes,
	};
}

export type InvoicePaymentEntry = {
	date: string | null;
	amount: number;
};

export type AllocatedInvoicePayment = InvoicePaymentEntry & {
	/** Quanto deste pagamento abateu a fatura anterior. */
	appliedToPrevious: number;
	/** Quanto sobrou e amortiza a fatura atual. */
	appliedToCurrent: number;
};

export type InvoicePaymentAllocation = {
	payments: AllocatedInvoicePayment[];
	/**
	 * Data do último pagamento que abateu a fatura anterior.
	 *
	 * É essa a data que deve bater com o débito registrado por ela — não a do
	 * pagamento mais recente do arquivo, que pode ser uma amortização da fatura
	 * atual e acusaria divergência onde não há.
	 */
	previousSettlementDate: string | null;
};

/**
 * Distribui os pagamentos do arquivo entre a fatura anterior e a atual.
 *
 * Quem paga em vários dias para reduzir juros vê no arquivo uma sequência de
 * pagamentos. Os primeiros liquidam o que restava da fatura passada; o que
 * sobra amortiza a atual. A ordem é cronológica, que é como o banco aplica.
 */
export function allocateInvoicePayments(input: {
	payments: InvoicePaymentEntry[];
	paidOnPrevious: number;
}): InvoicePaymentAllocation {
	const ordered = [...input.payments].sort((left, right) =>
		(left.date ?? "").localeCompare(right.date ?? ""),
	);

	let remaining = roundMoney(Math.max(0, input.paidOnPrevious));
	let previousSettlementDate: string | null = null;

	const payments = ordered.map((payment) => {
		const amount = roundMoney(Math.abs(payment.amount));
		const appliedToPrevious = roundMoney(Math.min(remaining, amount));
		remaining = roundMoney(remaining - appliedToPrevious);

		if (appliedToPrevious > 0.01) {
			previousSettlementDate = payment.date;
		}

		return {
			...payment,
			amount,
			appliedToPrevious,
			appliedToCurrent: roundMoney(amount - appliedToPrevious),
		};
	});

	return { payments, previousSettlementDate };
}
