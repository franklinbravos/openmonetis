import { getPdfPasswordCandidates } from "@/shared/lib/import/pdf-password";

export const CARD_IMPORT_PDF_PASSWORD_RULES = {
	none: "none",
	fixed: "fixed",
	cpf_first_6: "cpf_first_6",
	cnpj_first_6: "cnpj_first_6",
	cpf_digits: "cpf_digits",
} as const;

export type CardImportPdfPasswordRule =
	(typeof CARD_IMPORT_PDF_PASSWORD_RULES)[keyof typeof CARD_IMPORT_PDF_PASSWORD_RULES];

export const CARD_IMPORT_PDF_PASSWORD_RULE_OPTIONS: Array<{
	value: CardImportPdfPasswordRule;
	label: string;
	description: string;
}> = [
	{
		value: CARD_IMPORT_PDF_PASSWORD_RULES.none,
		label: "Não usar senha automática",
		description: "Solicitar a senha manualmente ao importar PDFs protegidos.",
	},
	{
		value: CARD_IMPORT_PDF_PASSWORD_RULES.fixed,
		label: "Senha fixa",
		description: "Usar sempre a mesma senha informada abaixo.",
	},
	{
		value: CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6,
		label: "6 primeiros dígitos do CPF",
		description:
			"Regra da fatura Inter (PF): informe o CPF completo e usamos os 6 primeiros dígitos.",
	},
	{
		value: CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6,
		label: "6 primeiros dígitos do CNPJ",
		description:
			"Conta PJ: informe o CNPJ completo e usamos os 6 primeiros dígitos.",
	},
	{
		value: CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits,
		label: "6 primeiros dígitos do CPF (legado)",
		description: "Mesma regra do CPF acima. Prefira a opção sem '(legado)'.",
	},
];

const RULE_VALUES = new Set<string>(
	Object.values(CARD_IMPORT_PDF_PASSWORD_RULES),
);

export function isCardImportPdfPasswordRule(
	value: string | null | undefined,
): value is CardImportPdfPasswordRule {
	return Boolean(value && RULE_VALUES.has(value));
}

export function deriveImportPdfPassword(
	rule: CardImportPdfPasswordRule,
	secret: string,
): string | null {
	const trimmedSecret = secret.trim();
	if (rule === CARD_IMPORT_PDF_PASSWORD_RULES.none) return null;
	if (!trimmedSecret) return null;

	switch (rule) {
		case CARD_IMPORT_PDF_PASSWORD_RULES.fixed:
			return trimmedSecret;
		case CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6:
		case CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits: {
			const digits = trimmedSecret.replace(/\D/g, "");
			return digits.length >= 6 ? digits.slice(0, 6) : null;
		}
		case CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6: {
			const digits = trimmedSecret.replace(/\D/g, "");
			return digits.length >= 6 ? digits.slice(0, 6) : null;
		}
		default:
			return null;
	}
}

export function buildImportPdfPasswordAttempts(
	rule: CardImportPdfPasswordRule,
	secret: string,
): string[] {
	const derived = deriveImportPdfPassword(rule, secret);
	if (!derived) return [];

	const attempts = getPdfPasswordCandidates(derived);
	const digits = secret.replace(/\D/g, "");

	if (
		rule === CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6 ||
		rule === CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6 ||
		rule === CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits
	) {
		if (digits.length >= 6) {
			attempts.unshift(digits.slice(0, 6));
		}
		if (digits.length > 0) {
			attempts.push(digits);
		}
		const trimmedSecret = secret.trim();
		if (trimmedSecret.length > 0) {
			attempts.push(trimmedSecret);
		}
	}

	return [...new Set(attempts)];
}

export function validateCardImportPdfPasswordInput(
	rule: CardImportPdfPasswordRule,
	secret: string,
	hasStoredSecret: boolean,
): { success: true } | { success: false; error: string } {
	if (rule === CARD_IMPORT_PDF_PASSWORD_RULES.none) {
		return { success: true };
	}

	const trimmedSecret = secret.trim();
	if (!trimmedSecret && !hasStoredSecret) {
		return {
			success: false,
			error: "Informe o valor usado para gerar a senha do PDF.",
		};
	}

	if (!trimmedSecret) {
		return { success: true };
	}

	if (!deriveImportPdfPassword(rule, trimmedSecret)) {
		if (rule === CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6) {
			return {
				success: false,
				error: "Informe um CNPJ válido com pelo menos 6 dígitos.",
			};
		}

		if (
			rule === CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6 ||
			rule === CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits
		) {
			return {
				success: false,
				error: "Informe um CPF válido com pelo menos 6 dígitos.",
			};
		}

		return {
			success: false,
			error: "Informe a senha do PDF.",
		};
	}

	return { success: true };
}

export function getCardImportPdfPasswordSecretLabel(
	rule: CardImportPdfPasswordRule,
): string {
	switch (rule) {
		case CARD_IMPORT_PDF_PASSWORD_RULES.fixed:
			return "Senha do PDF";
		case CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6:
		case CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits:
			return "CPF";
		case CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6:
			return "CNPJ";
		default:
			return "Valor";
	}
}

export function getCardImportPdfPasswordSecretPlaceholder(
	rule: CardImportPdfPasswordRule,
	hasStoredSecret: boolean,
): string {
	if (hasStoredSecret) {
		return "Valor salvo (deixe em branco para manter)";
	}

	switch (rule) {
		case CARD_IMPORT_PDF_PASSWORD_RULES.fixed:
			return "Digite a senha do PDF";
		case CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6:
		case CARD_IMPORT_PDF_PASSWORD_RULES.cpf_digits:
			return "Ex.: 123.456.789-00";
		case CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6:
			return "Ex.: 46.268.915/0001-83";
		default:
			return "";
	}
}
