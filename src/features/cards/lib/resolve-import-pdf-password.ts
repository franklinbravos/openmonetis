import { and, eq } from "drizzle-orm";
import { cards } from "@/db/schema";
import { tryDecryptSecret } from "@/shared/lib/ai/secret-encryption";
import {
	buildImportPdfPasswordAttempts,
	type CardImportPdfPasswordRule,
	deriveImportPdfPassword,
	isCardImportPdfPasswordRule,
} from "@/shared/lib/cards/import-pdf-password";
import { db } from "@/shared/lib/db";

export async function resolveCardImportPdfPassword(
	userId: string,
	cardId: string,
): Promise<string | null> {
	const card = await db.query.cards.findFirst({
		columns: {
			importPdfPasswordRule: true,
			importPdfPasswordSecret: true,
		},
		where: and(eq(cards.userId, userId), eq(cards.id, cardId)),
	});

	if (!card?.importPdfPasswordRule || !card.importPdfPasswordSecret) {
		return null;
	}

	if (!isCardImportPdfPasswordRule(card.importPdfPasswordRule)) {
		return null;
	}

	const secret = tryDecryptSecret(card.importPdfPasswordSecret);
	if (!secret) return null;

	return deriveImportPdfPassword(card.importPdfPasswordRule, secret);
}

export async function resolveCardImportPdfPasswordAttempts(
	userId: string,
	cardId: string,
): Promise<string[]> {
	const card = await db.query.cards.findFirst({
		columns: {
			importPdfPasswordRule: true,
			importPdfPasswordSecret: true,
		},
		where: and(eq(cards.userId, userId), eq(cards.id, cardId)),
	});

	if (!card?.importPdfPasswordRule || !card.importPdfPasswordSecret) {
		return [];
	}

	if (!isCardImportPdfPasswordRule(card.importPdfPasswordRule)) {
		return [];
	}

	const secret = tryDecryptSecret(card.importPdfPasswordSecret);
	if (!secret) return [];

	return buildImportPdfPasswordAttempts(card.importPdfPasswordRule, secret);
}

export type CardImportPdfPasswordSettings = {
	rule: CardImportPdfPasswordRule;
	hasStoredSecret: boolean;
};

export async function fetchCardImportPdfPasswordSettings(
	userId: string,
	cardId: string,
): Promise<CardImportPdfPasswordSettings | null> {
	const card = await db.query.cards.findFirst({
		columns: {
			importPdfPasswordRule: true,
			importPdfPasswordSecret: true,
		},
		where: and(eq(cards.userId, userId), eq(cards.id, cardId)),
	});

	if (!card) return null;

	const rule = isCardImportPdfPasswordRule(card.importPdfPasswordRule)
		? card.importPdfPasswordRule
		: ("none" as const);

	return {
		rule,
		hasStoredSecret: Boolean(card.importPdfPasswordSecret),
	};
}
