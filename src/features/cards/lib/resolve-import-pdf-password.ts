import { and, eq } from "drizzle-orm";
import { cards } from "@/db/schema";
import {
	logSecretReadFailure,
	tryDecryptSecret,
} from "@/shared/lib/ai/secret-encryption";
import {
	buildImportPdfPasswordAttempts,
	type CardImportPdfPasswordRule,
	deriveImportPdfPassword,
	isCardImportPdfPasswordRule,
} from "@/shared/lib/cards/import-pdf-password";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";

export async function resolveCardImportPdfPassword(
	userId: string,
	cardId: string,
): Promise<string | null> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const card = await db.query.cards.findFirst({
		columns: {
			importPdfPasswordRule: true,
			importPdfPasswordSecret: true,
		},
		where: and(eq(cards.userId, dataOwnerUserId), eq(cards.id, cardId)),
	});

	if (!card?.importPdfPasswordRule || !card.importPdfPasswordSecret) {
		return null;
	}

	if (!isCardImportPdfPasswordRule(card.importPdfPasswordRule)) {
		return null;
	}

	const secret = tryDecryptSecret(card.importPdfPasswordSecret);
	if (!secret) {
		logSecretReadFailure(
			"resolveCardImportPdfPassword",
			card.importPdfPasswordSecret,
		);
		return null;
	}

	return deriveImportPdfPassword(card.importPdfPasswordRule, secret);
}

export async function resolveCardImportPdfPasswordAttempts(
	userId: string,
	cardId: string,
): Promise<string[]> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const card = await db.query.cards.findFirst({
		columns: {
			importPdfPasswordRule: true,
			importPdfPasswordSecret: true,
		},
		where: and(eq(cards.userId, dataOwnerUserId), eq(cards.id, cardId)),
	});

	if (!card?.importPdfPasswordRule || !card.importPdfPasswordSecret) {
		return [];
	}

	if (!isCardImportPdfPasswordRule(card.importPdfPasswordRule)) {
		return [];
	}

	const secret = tryDecryptSecret(card.importPdfPasswordSecret);
	if (!secret) {
		logSecretReadFailure(
			"resolveCardImportPdfPasswordAttempts",
			card.importPdfPasswordSecret,
		);
		return [];
	}

	return buildImportPdfPasswordAttempts(card.importPdfPasswordRule, secret);
}

export type CardImportPdfPasswordSettings = {
	rule: CardImportPdfPasswordRule;
	hasStoredSecret: boolean;
	secretReadable: boolean;
};

export async function fetchCardImportPdfPasswordSettings(
	userId: string,
	cardId: string,
): Promise<CardImportPdfPasswordSettings | null> {
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);
	const card = await db.query.cards.findFirst({
		columns: {
			importPdfPasswordRule: true,
			importPdfPasswordSecret: true,
		},
		where: and(eq(cards.userId, dataOwnerUserId), eq(cards.id, cardId)),
	});

	if (!card) return null;

	const rule = isCardImportPdfPasswordRule(card.importPdfPasswordRule)
		? card.importPdfPasswordRule
		: ("none" as const);

	const hasStoredSecret = Boolean(card.importPdfPasswordSecret);

	return {
		rule,
		hasStoredSecret,
		secretReadable: hasStoredSecret
			? tryDecryptSecret(card.importPdfPasswordSecret ?? "") != null
			: false,
	};
}
