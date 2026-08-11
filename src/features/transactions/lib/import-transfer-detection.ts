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

export type ImportTransferGuess = {
	kind: "transfer";
	transferPeerAccountId: string;
};

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
 * Detecta transferências recebidas via Pix da conta PJ Bravos no Banco Inter.
 * Aplica-se a entradas no extrato (conta destino = conta importada).
 */
export function guessImportTransfer(
	description: string,
	transactionType: "income" | "expense",
	accountOptions: SelectOption[],
	importAccountId: string | null,
): ImportTransferGuess | null {
	if (transactionType !== "income") return null;
	if (!isBravosInterPixTransferDescription(description)) return null;

	const peerAccount = findBravosInterPjAccount(accountOptions, importAccountId);
	if (!peerAccount) return null;

	return {
		kind: "transfer",
		transferPeerAccountId: peerAccount.value,
	};
}
