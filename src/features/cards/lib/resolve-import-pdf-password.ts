import { and, eq } from "drizzle-orm";
import { cards } from "@/db/schema";
import { decryptSecret } from "@/shared/lib/ai/secret-encryption";
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

	try {
		const secret = decryptSecret(card.importPdfPasswordSecret);
		return deriveImportPdfPassword(card.importPdfPasswordRule, secret);
	} catch {
		return null;
	}
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

	try {
		const secret = decryptSecret(card.importPdfPasswordSecret);
		return buildImportPdfPasswordAttempts(card.importPdfPasswordRule, secret);
	} catch {
		return [];
	}
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
