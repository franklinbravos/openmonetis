import type { CardCreateResultData } from "@/features/cards/actions";
import {
	fetchActionResult,
	fetchJsonData,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

export type CardCreatePayload = {
	name: string;
	brand: string;
	status: string;
	closingDay: string;
	dueDay: string;
	limit: number;
	note: string | null;
	logo: string;
	accountId: string;
	importPdfPasswordRule: string;
	importPdfPasswordSecret: string | null;
};

export type CardFormOptions = {
	logoOptions: string[];
	accounts: Array<{ id: string; name: string; logo: string | null }>;
};

export async function fetchCardFormOptionsClient(): Promise<CardFormOptions> {
	return fetchJsonData(
		"/api/cards/form-options",
		undefined,
		"Não foi possível carregar as opções do cartão.",
	);
}

export async function createCardClient(
	input: CardCreatePayload,
): Promise<ActionResult<CardCreateResultData>> {
	return fetchActionResult(
		"/api/cards",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível criar o cartão.",
	);
}

export async function updateCardClient(
	cardId: string,
	input: CardCreatePayload,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/cards/${cardId}`,
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar o cartão.",
	);
}

export async function deleteCardClient(cardId: string): Promise<ActionResult> {
	return fetchActionResult(
		`/api/cards/${cardId}`,
		{
			method: "DELETE",
		},
		"Não foi possível remover o cartão.",
	);
}

export async function updateCardImportPdfPasswordSettingsClient(input: {
	cardId: string;
	rule: string;
	secret?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
	const { cardId, ...body } = input;
	return fetchActionResult(`/api/cards/${cardId}/import-pdf-password-settings`, {
		method: "PATCH",
		...jsonRequestBody(body),
	});
}
