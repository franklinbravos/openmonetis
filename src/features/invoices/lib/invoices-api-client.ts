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
