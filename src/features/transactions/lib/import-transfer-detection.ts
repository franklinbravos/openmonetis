import type { SelectOption } from "@/features/transactions/components/types";
import { normalizeImportedText } from "@/shared/lib/import/helpers";

/** CNPJ da conta PJ Bravos Company no Banco Inter. */
export const BRAVOS_INTER_PJ_CNPJ = "46268915000183";

const BRAVOS_PIX_TRANSFER_PATTERNS = [
	/transfer[eê]ncia\s+recebida\s+pelo\s+pix[\s\-–—:]*bravos\s+company/i,
	/transfer[eê]ncia\s+recebida\s+pelo\s+pix.*46\.268\.915\s*\/?\s*0001-83/i,
	/transfer[eê]ncia\s+recebida\s+pelo\s+pix.*banco\s+inter.*bravos\s+company/i,
	/pix.*bravos\s+company.*banco\s+inter/i,
	/pix.*46\.268\.915\s*\/?\s*0001-83.*banco\s+inter/i,
];

const INVESTMENT_ACCOUNT_LABEL_PATTERNS = [
	/invest/i,
	/\bcdb\b/i,
	/renda\s*fixa/i,
	/aplic/i,
	/tesouro/i,
];

export type ImportTransferGuess = {
	kind: "transfer";
	/**
	 * Conta do outro lado, quando dá para identificar.
	 *
	 * Nula quando sabemos que é transferência entre contas próprias mas não qual
	 * é a contraparte — melhor pedir ao usuário do que deixar entrar como receita
	 * e inflar o resultado do mês dos dois lados.
	 */
	transferPeerAccountId: string | null;
};

export type ImportStatementHolder = {
	name: string | null;
	document: string | null;
};

/** Documento mascarado como o banco imprime: `•••.532.298-••`. */
const MASKED_DOCUMENT_RE = /•+\.\d{3}\.\d{3}-•+/;

function normalizeForCompare(value: string): string {
	return normalizeImportedText(value)
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

/**
 * A contraparte do Pix é o próprio titular do extrato?
 *
 * Exige documento **e** nome. Só o documento seriam seis dígitos visíveis, que
 * duas pessoas podem compartilhar; só o nome erraria em homônimo. Juntos, a
 * chance de falso positivo é desprezível — e o custo de errar é classificar
 * como transferência algo que é receita de verdade.
 */
export function isOwnAccountPixDescription(
	description: string,
	holder: ImportStatementHolder | null | undefined,
): boolean {
	if (!holder?.document || !holder.name) return false;

	const descriptionDocument = description.match(MASKED_DOCUMENT_RE)?.[0];
	if (!descriptionDocument) return false;
	if (descriptionDocument !== holder.document.trim()) return false;

	return normalizeForCompare(description).includes(
		normalizeForCompare(holder.name),
	);
}

/**
 * Acha a conta cadastrada que corresponde à instituição citada na descrição.
 *
 * "MERCADO PAGO IP LTDA. (0323)" casa com a conta "Mercado Pago" porque todos os
 * termos do nome cadastrado aparecem no texto. Duas contas casando é ambiguidade,
 * e aí é melhor devolver nada e deixar o usuário escolher.
 */
export function findPeerAccountByInstitution(
	description: string,
	accountOptions: SelectOption[],
	importAccountId: string | null,
): SelectOption | null {
	const haystack = normalizeForCompare(description);

	const matches = accountOptions.filter((option) => {
		if (option.value === importAccountId) return false;

		const terms = normalizeForCompare(option.label)
			.split(/\s+/)
			.filter((term) => term.length >= 3);

		return terms.length > 0 && terms.every((term) => haystack.includes(term));
	});

	return matches.length === 1 ? (matches[0] ?? null) : null;
}

function normalizeDigits(value: string): string {
	return value.replace(/\D/g, "");
}

export function isBravosInterPixTransferDescription(
	description: string,
): boolean {
	const normalized = normalizeImportedText(description);
	return BRAVOS_PIX_TRANSFER_PATTERNS.some((pattern) =>
		pattern.test(normalized),
	);
}

/**
 * Aplicação ou resgate entre conta corrente e investimento no mesmo banco.
 *
 * Ex.: `Aplicacao: "CDB CREDITO BANCO INTER S A"` no extrato da conta corrente
 * move patrimônio para a carteira de investimento — não é despesa do mês.
 */
export function isInvestmentMovementDescription(description: string): boolean {
	const text = normalizeImportedText(description);

	if (/^aplicacao\b/i.test(text) || /^aplicação\b/i.test(text)) {
		return true;
	}

	if (/^resgate\b/i.test(text)) {
		return true;
	}

	const normalized = normalizeForCompare(text);
	return /\b(compra|venda)\b.*\b(cdb|lci|lca)\b/i.test(normalized);
}

function inferBankHintFromDescription(description: string): string | null {
	const normalized = normalizeForCompare(description);

	if (/\bbanco\s*inter\b|\binter\b/.test(normalized)) return "inter";
	if (/\bnubank\b|\bnu\s*pagamentos\b/.test(normalized)) return "nubank";
	if (/\bmercado\s*pago\b/.test(normalized)) return "mercadopago";
	if (/\bita[uú]\b/.test(normalized)) return "itau";
	if (/\bbradesco\b/.test(normalized)) return "bradesco";

	return null;
}

function accountMatchesBankHint(
	option: SelectOption,
	bankHint: string,
): boolean {
	const text = accountSearchText(option);
	return text.includes(bankHint) || option.logo === bankHint;
}

/** Conta de investimento cadastrada que casa com a movimentação do extrato. */
export function findInvestmentPeerAccount(
	description: string,
	accountOptions: SelectOption[],
	importAccountId: string | null,
): SelectOption | null {
	const candidates = accountOptions.filter(
		(option) => option.value !== importAccountId,
	);
	if (candidates.length === 0) return null;

	const investmentCandidates = candidates.filter((option) =>
		INVESTMENT_ACCOUNT_LABEL_PATTERNS.some((pattern) =>
			pattern.test(normalizeForCompare(option.label)),
		),
	);

	let pool =
		investmentCandidates.length > 0 ? investmentCandidates : candidates;

	const bankHint = inferBankHintFromDescription(description);
	if (bankHint) {
		const bankMatches = pool.filter((option) =>
			accountMatchesBankHint(option, bankHint),
		);
		if (bankMatches.length === 1) return bankMatches[0] ?? null;
		if (bankMatches.length > 1) pool = bankMatches;
	}

	if (pool.length === 1) return pool[0] ?? null;
	if (pool.length > 1) return null;

	return findPeerAccountByInstitution(
		description,
		accountOptions,
		importAccountId,
	);
}

function accountSearchText(option: SelectOption): string {
	return [option.label, option.slug, option.logo]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

export function findBravosInterPjAccount(
	accountOptions: SelectOption[],
	importAccountId: string | null,
): SelectOption | null {
	const candidates = accountOptions.filter(
		(option) => option.value !== importAccountId,
	);
	if (candidates.length === 0) return null;

	const bravosCompanyMatch = candidates.find((option) =>
		/bravos|company/i.test(accountSearchText(option)),
	);
	if (bravosCompanyMatch) return bravosCompanyMatch;

	const cnpjMatch = candidates.find((option) =>
		normalizeDigits(accountSearchText(option)).includes(BRAVOS_INTER_PJ_CNPJ),
	);
	if (cnpjMatch) return cnpjMatch;

	const interPjMatch = candidates.find((option) => {
		const text = accountSearchText(option);
		return (
			/inter/i.test(text) && /(pj|jur[ií]dica|cnpj|empresa|company)/i.test(text)
		);
	});
	if (interPjMatch) return interPjMatch;

	const interMatches = candidates.filter((option) =>
		/inter/i.test(accountSearchText(option)),
	);
	if (interMatches.length === 1) return interMatches[0] ?? null;

	return null;
}

/**
 * Detecta transferência entre contas do próprio usuário.
 *
 * Duas regras, nesta ordem:
 *
 * 1. **Contraparte é o titular.** Vale nos dois sentidos e para qualquer banco:
 *    se o Pix foi de mim para mim, o dinheiro mudou de bolso, não entrou nem
 *    saiu do patrimônio. Sem isso, um Pix de R$ 6.000 entre contas próprias
 *    aparece como receita numa e despesa na outra, inflando o mês dos dois lados.
 * 2. **Bravos Inter PJ**, a regra antiga, restrita a entradas. Fica como reserva
 *    para o caso em que o extrato não declara titular — OFX, por exemplo.
 */
export function guessImportTransfer(
	description: string,
	transactionType: "income" | "expense",
	accountOptions: SelectOption[],
	importAccountId: string | null,
	holder?: ImportStatementHolder | null,
): ImportTransferGuess | null {
	if (isOwnAccountPixDescription(description, holder)) {
		return {
			kind: "transfer",
			transferPeerAccountId:
				findPeerAccountByInstitution(
					description,
					accountOptions,
					importAccountId,
				)?.value ?? null,
		};
	}

	if (isInvestmentMovementDescription(description)) {
		return {
			kind: "transfer",
			transferPeerAccountId:
				findInvestmentPeerAccount(
					description,
					accountOptions,
					importAccountId,
				)?.value ?? null,
		};
	}

	if (transactionType !== "income") return null;
	if (!isBravosInterPixTransferDescription(description)) return null;

	const peerAccount = findBravosInterPjAccount(accountOptions, importAccountId);
	if (!peerAccount) return null;

	return {
		kind: "transfer",
		transferPeerAccountId: peerAccount.value,
	};
}
