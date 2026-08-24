import {
	addMonthsToDate,
	parseLocalDateString,
	toLocalDateString,
} from "@/shared/utils/date";
import {
	detectInstallmentFromName,
	type InstallmentDetection,
} from "@/shared/utils/installment-detection";
import {
	addMonthsToPeriod,
	comparePeriods,
	displayPeriod,
} from "@/shared/utils/period";

export type ReviewInstallmentImport = {
	enabled: boolean;
	name: string;
	currentInstallment: number;
	installmentCount: number;
};

export type ReviewRecurrenceImport = {
	enabled: boolean;
	recurrenceCount: number;
};

export const DEFAULT_IMPORT_INSTALLMENT_COUNT = 12;
export const DEFAULT_IMPORT_RECURRENCE_COUNT = 12;

export function buildReviewInstallmentImport(
	description: string,
): ReviewInstallmentImport | null {
	const detected = detectInstallmentFromName(description);
	if (!detected) return null;

	return {
		enabled: true,
		name: detected.name,
		currentInstallment: detected.currentInstallment,
		installmentCount: detected.installmentCount,
	};
}

export function createManualInstallmentImport(
	description: string,
): ReviewInstallmentImport {
	return {
		enabled: true,
		name: description.trim(),
		currentInstallment: 1,
		installmentCount: DEFAULT_IMPORT_INSTALLMENT_COUNT,
	};
}

export function createManualRecurrenceImport(): ReviewRecurrenceImport {
	return {
		enabled: true,
		recurrenceCount: DEFAULT_IMPORT_RECURRENCE_COUNT,
	};
}

export function getInstallmentBasePeriod(
	invoicePeriod: string,
	currentInstallment: number,
) {
	return addMonthsToPeriod(invoicePeriod, -(currentInstallment - 1));
}

/**
 * Data de compra real de uma série, a partir da linha do arquivo.
 *
 * Os bancos usam duas convenções para a data das parcelas:
 *
 * - **Data original da compra** em todas as parcelas (maioria dos cartões).
 *   Nesse caso a data já cai no mês da primeira parcela e nada muda.
 * - **Data do ciclo da fatura** em cada parcela (Nubank). Importar a fatura de
 *   junho com "Parcela 5/12" traz 05/06 — que a série inteira herdava, inclusive
 *   as parcelas de fevereiro a maio. O resultado era uma compra datada no
 *   futuro em relação à própria fatura onde aparece.
 *
 * A distinção é o mês: se a data é posterior ao mês da primeira parcela, ela é
 * do ciclo, não da compra, e volta `currentInstallment - 1` meses. O dia exato
 * da compra não é recuperável a partir de uma data de ciclo — o que se garante
 * é o mês certo e nenhuma data no futuro.
 */
export function resolveInstallmentPurchaseDate(input: {
	/** Data da linha no arquivo, em `YYYY-MM-DD`. */
	chargeDate: string;
	/** Fatura em que a linha aparece, em `YYYY-MM`. */
	invoicePeriod: string;
	currentInstallment: number;
}): string {
	const { chargeDate, invoicePeriod, currentInstallment } = input;

	if (currentInstallment <= 1) return chargeDate;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(chargeDate)) return chargeDate;

	const firstPeriod = getInstallmentBasePeriod(
		invoicePeriod,
		currentInstallment,
	);
	const chargePeriod = chargeDate.slice(0, 7);

	// Data já compatível com a primeira parcela: é a data da compra.
	if (comparePeriods(chargePeriod, firstPeriod) <= 0) return chargeDate;

	const shifted = addMonthsToDate(
		parseLocalDateString(chargeDate),
		-(currentInstallment - 1),
	);

	return toLocalDateString(shifted) ?? chargeDate;
}

export function buildInstallmentImportPreview(
	invoicePeriod: string,
	currentInstallment: number,
	installmentCount: number,
) {
	const firstPeriod = getInstallmentBasePeriod(
		invoicePeriod,
		currentInstallment,
	);
	const lastPeriod = addMonthsToPeriod(firstPeriod, installmentCount - 1);

	return {
		firstPeriod,
		lastPeriod,
		firstLabel: displayPeriod(firstPeriod),
		lastLabel: displayPeriod(lastPeriod),
	};
}

export function isValidInstallmentImport(
	installment: ReviewInstallmentImport | null | undefined,
): installment is ReviewInstallmentImport {
	if (!installment?.enabled) return false;

	return (
		installment.installmentCount >= 2 &&
		installment.installmentCount <= 60 &&
		installment.currentInstallment >= 1 &&
		installment.currentInstallment <= installment.installmentCount &&
		installment.name.trim().length > 0
	);
}

export function isValidRecurrenceImport(
	recurrence: ReviewRecurrenceImport | null | undefined,
): recurrence is ReviewRecurrenceImport {
	if (!recurrence?.enabled) return false;

	return recurrence.recurrenceCount >= 2 && recurrence.recurrenceCount <= 60;
}

export function countImportRecords(
	rows: Array<{
		kind?: "transaction" | "invoice_payment" | "transfer" | "invoice_extra";
		installmentImport?: ReviewInstallmentImport | null;
		recurrenceImport?: ReviewRecurrenceImport | null;
	}>,
) {
	return rows.reduce((total, row) => {
		if (row.kind === "invoice_extra") {
			return total;
		}
		if (row.kind === "transfer") {
			return total + 2;
		}
		if (isValidInstallmentImport(row.installmentImport)) {
			return total + row.installmentImport.installmentCount;
		}
		if (isValidRecurrenceImport(row.recurrenceImport)) {
			return total + row.recurrenceImport.recurrenceCount;
		}
		return total + 1;
	}, 0);
}

/**
 * Identidade de uma ocorrência de série parcelada dentro de um cartão.
 *
 * Importar uma parcela N/M expande a série inteira e grava as ocorrências
 * anteriores nas faturas passadas. Sem comparar identidade, reprocessar a fatura
 * de março recriava a parcela 1/2 em fevereiro a cada rodada — duplicando
 * lançamento numa fatura já fechada, de forma silenciosa e cumulativa.
 *
 * O valor fica fora da chave de propósito: a mesma parcela pode ter sido
 * cadastrada com um centavo de diferença (arredondamento do banco entre
 * faturas), e ainda assim é a mesma ocorrência.
 */
function normalizeInstallmentBaseName(name: string): string {
	const detected = detectInstallmentFromName(name);
	return (detected?.name ?? name).trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildInstallmentOccurrenceKey(input: {
	name: string;
	period: string;
	currentInstallment: number | null;
	installmentCount: number | null;
}): string {
	return [
		normalizeInstallmentBaseName(input.name),
		input.period,
		input.currentInstallment ?? "",
		input.installmentCount ?? "",
	].join("|");
}

/**
 * Identidade de uma série parcelada, estável entre importações.
 *
 * Duas ocorrências pertencem à mesma compra quando têm o mesmo estabelecimento,
 * o mesmo total de parcelas e a mesma primeira parcela. O mês da primeira
 * parcela entra na chave para separar duas compras de 12x no mesmo lugar em
 * meses diferentes.
 *
 * Serve para reaproveitar o `seriesId` já gravado: sem isso, importar a fatura
 * que traz a parcela que faltava criava uma série nova de uma linha só, solta
 * das irmãs — cada parcela virava uma compra separada na tela.
 */
export function buildInstallmentSeriesKey(input: {
	name: string;
	installmentCount: number | null;
	/** Mês da parcela 1, em `YYYY-MM`. */
	firstPeriod: string;
}): string {
	return [
		normalizeInstallmentBaseName(input.name),
		input.installmentCount ?? "",
		input.firstPeriod,
	].join("|");
}

export type { InstallmentDetection };
