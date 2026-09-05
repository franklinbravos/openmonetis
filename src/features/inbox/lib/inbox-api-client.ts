import {
	fetchActionResult,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

export async function markInboxAsProcessedClient(
	itemId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/inbox/items/${itemId}/processed`,
		{
			method: "POST",
		},
		"Não foi possível processar o item.",
	);
}

export async function discardInboxItemClient(
	itemId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/inbox/items/${itemId}/discard`,
		{
			method: "POST",
		},
		"Não foi possível descartar o item.",
	);
}

export async function restoreDiscardedInboxItemClient(
	itemId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/inbox/items/${itemId}/restore`,
		{
			method: "POST",
		},
		"Não foi possível restaurar o item.",
	);
}

export async function deleteInboxItemClient(
	itemId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/inbox/items/${itemId}`,
		{
			method: "DELETE",
		},
		"Não foi possível excluir o item.",
	);
}

export async function bulkDiscardInboxItemsClient(input: {
	inboxItemIds: string[];
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/inbox/items/bulk/discard",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível descartar os itens.",
	);
}

export async function bulkDeleteInboxItemsClient(input: {
	status: "processed" | "discarded";
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/inbox/items/bulk/delete",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível excluir os itens.",
	);
}

export async function bulkDeleteSelectedInboxItemsClient(input: {
	inboxItemIds: string[];
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/inbox/items/bulk/delete-selected",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível excluir os itens selecionados.",
	);
}
