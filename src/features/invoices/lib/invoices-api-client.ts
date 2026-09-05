import {
	fetchActionResult,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

export async function updateInvoicePaymentStatusClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return fetchActionResult(
		"/api/invoices/payment-status",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar o pagamento da fatura.",
	);
}

export async function updatePaymentDateClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return fetchActionResult(
		"/api/invoices/payment-date",
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar a data de pagamento.",
	);
}

export async function adjustInvoiceClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return fetchActionResult(
		"/api/invoices/adjust",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível ajustar a fatura.",
	);
}

export async function fetchInvoiceTotalClient(input: {
	cardId: string;
	period: string;
}): Promise<ActionResult<{ totalAmount: number }>> {
	const params = new URLSearchParams({
		cardId: input.cardId,
		period: input.period,
	});

	return fetchActionResult(
		`/api/invoices/total?${params.toString()}`,
		{ method: "GET" },
		"Não foi possível carregar o total da fatura.",
	);
}
