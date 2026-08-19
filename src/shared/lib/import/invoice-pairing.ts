import { normalizeImportedText } from "@/shared/lib/import/helpers";
import type { InvoiceFileRowFingerprint } from "@/shared/lib/import/invoice-file-match";
import {
	type InvoiceReconciliationExistingRow,
	shouldIncludeExistingInInvoiceTotal,
	signedAmountFromReviewValues,
	signedAmountFromStoredValue,
} from "@/shared/lib/import/invoice-total";
import { toDateOnlyString } from "@/shared/utils/date";

/**
 * Conciliação da fatura: casa o que está cadastrado com o que veio no arquivo.
 *
 * O cadastro manual costuma ter descrição humanizada ("Farmácia da esquina")
 * enquanto a fatura traz o nome da maquininha ("DROGASIL2832"), então casar por
 * nome não basta — e insistir nisso faz o fechamento apagar o lançamento bom
 * para recriá-lo com o nome do cartão, perdendo categoria, pessoa e anexos.
 *
 * As regras vão da mais forte para a mais fraca e consomem os dois lados, então
 * cada linha entra em no máximo um par. O que sobra de cada lado é, aí sim,
 * excesso no cadastro ou lançamento faltando.
 */

export type InvoicePairConfidence = "exact" | "strong" | "weak";

export type InvoicePair = {
	registered: InvoiceReconciliationExistingRow;
	fileRow: InvoiceFileRowFingerprint;
	/** Posição da linha na lista de arquivo recebida, para aplicar o par na revisão. */
	fileIndex: number;
	/** Assinado: cadastrado − arquivo. Zero quando os valores já batem. */
	signedDelta: number;
	confidence: InvoicePairConfidence;
	rule: string;
};

export type InvoicePairing = {
	pairs: InvoicePair[];
	/** Cadastrado que o arquivo não tem: sobra na fatura. */
	extras: InvoiceReconciliationExistingRow[];
	/** Linha do arquivo sem cadastro correspondente: falta lançar. */
	missing: InvoiceFileRowFingerprint[];
};

const AMOUNT_TOLERANCE = 0.005;

function normalizeName(value: string): string {
	return normalizeImportedText(value).toLowerCase();
}

/** "Mercadolivre*Fios - Parcela 2/3" → "mercadolivre*fios" */
function baseName(value: string): string {
	return normalizeName(value)
		.replace(/\s*[-–]?\s*parcela\s+\d+\s*(?:\/|de)\s*\d+\s*$/i, "")
		.replace(/\s+\d+\s*\/\s*\d+\s*$/i, "")
		.trim();
}

function nameTokens(value: string): string[] {
	return baseName(value)
		.split(/[^\p{L}\p{N}]+/u)
		.filter((token) => token.length >= 3);
}

/** Nome parecido o bastante para sustentar um ajuste de valor. */
export function namesLookAlike(a: string, b: string): boolean {
	const left = baseName(a);
	const right = baseName(b);
	if (!left || !right) return false;
	if (left === right) return true;
	if (left.includes(right) || right.includes(left)) return true;

	const leftTokens = new Set(nameTokens(a));
	const rightTokens = new Set(nameTokens(b));
	if (leftTokens.size === 0 || rightTokens.size === 0) return false;

	let shared = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) shared += 1;
	}
	// Uma palavra em comum não diz nada ("Compra que sumiu" × "Compra nova").
	// Nome de uma palavra só já foi resolvido pela checagem de conteúdo acima.
	if (shared < 2) return false;

	return shared / Math.min(leftTokens.size, rightTokens.size) >= 0.5;
}

type Side<T> = { value: T; taken: boolean };

function amountsMatch(a: number, b: number): boolean {
	return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

export function pairInvoiceAgainstFile(
	registeredRows: InvoiceReconciliationExistingRow[],
	fileRows: InvoiceFileRowFingerprint[],
): InvoicePairing {
	const registered: Array<
		Side<InvoiceReconciliationExistingRow> & {
			signed: number;
			date: string | null;
		}
	> = registeredRows.filter(shouldIncludeExistingInInvoiceTotal).map((row) => ({
		value: row,
		taken: false,
		signed: signedAmountFromStoredValue(row.amount, row.transactionType),
		date: toDateOnlyString(row.purchaseDate ?? null),
	}));

	const file: Array<
		Side<InvoiceFileRowFingerprint> & {
			signed: number;
			date: string;
			index: number;
		}
	> = fileRows.map((row, index) => ({
		value: row,
		taken: false,
		signed: signedAmountFromReviewValues(row.amount, row.transactionType),
		date: row.date,
		index,
	}));

	const pairs: InvoicePair[] = [];

	function consume(
		rule: string,
		confidence: InvoicePairConfidence,
		accept: (
			left: (typeof registered)[number],
			right: (typeof file)[number],
		) => boolean,
	) {
		for (const left of registered) {
			if (left.taken) continue;

			for (const right of file) {
				if (right.taken) continue;
				if (!accept(left, right)) continue;

				left.taken = true;
				right.taken = true;
				pairs.push({
					registered: left.value,
					fileRow: right.value,
					fileIndex: right.index,
					signedDelta: Math.round((left.signed - right.signed) * 100) / 100,
					confidence,
					rule,
				});
				break;
			}
		}
	}

	// 1. Mesmo id de origem: é literalmente a mesma linha já importada.
	consume(
		"external_id",
		"exact",
		(left, right) =>
			Boolean(left.value.ofxFitId) &&
			left.value.ofxFitId === right.value.externalId,
	);

	// 2. Mesmo valor e mesma data: descrição pode estar humanizada à vontade.
	consume(
		"amount_and_date",
		"exact",
		(left, right) =>
			amountsMatch(left.signed, right.signed) && left.date === right.date,
	);

	// 3. Mesmo valor e nome reconhecível: a data da compra diverge com frequência
	//    entre o cadastro e a fatura.
	consume(
		"amount_and_name",
		"exact",
		(left, right) =>
			amountsMatch(left.signed, right.signed) &&
			namesLookAlike(left.value.name, right.value.description),
	);

	// 4. Mesmo valor, dentro da mesma fatura. Se houver mais de um candidato o
	//    par escolhido é indiferente: todos fecham pelo mesmo valor.
	consume("amount_only", "strong", (left, right) =>
		amountsMatch(left.signed, right.signed),
	);

	// 5. Nome reconhecível com valor diferente: mesma compra, valor a ajustar.
	consume("name_with_amount_delta", "strong", (left, right) =>
		namesLookAlike(left.value.name, right.value.description),
	);

	// 6. Sobrou exatamente um de cada lado no mesmo dia: ajusta o valor em vez de
	//    apagar e recriar. Fica marcado como fraco para aparecer na revisão.
	const remainingByDate = new Map<
		string,
		{ registered: number; file: number }
	>();
	for (const left of registered) {
		if (left.taken || !left.date) continue;
		const entry = remainingByDate.get(left.date) ?? { registered: 0, file: 0 };
		entry.registered += 1;
		remainingByDate.set(left.date, entry);
	}
	for (const right of file) {
		if (right.taken) continue;
		const entry = remainingByDate.get(right.date) ?? { registered: 0, file: 0 };
		entry.file += 1;
		remainingByDate.set(right.date, entry);
	}

	consume("single_leftover_on_date", "weak", (left, right) => {
		if (!left.date || left.date !== right.date) return false;
		const entry = remainingByDate.get(left.date);
		return entry?.registered === 1 && entry?.file === 1;
	});

	return {
		pairs,
		extras: registered.filter((row) => !row.taken).map((row) => row.value),
		missing: file.filter((row) => !row.taken).map((row) => row.value),
	};
}
