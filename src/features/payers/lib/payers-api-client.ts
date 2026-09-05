import {
	fetchActionResult,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";
import type { PayerSharePermission } from "@/shared/lib/payers/constants";

export type PayerCreatePayload = {
	name: string;
	email: string;
	status: string;
	note: string | null;
	avatarUrl?: string;
	isAutoSend?: boolean;
};

export async function createPayerClient(
	input: PayerCreatePayload,
): Promise<ActionResult> {
	return fetchActionResult(
		"/api/payers",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível criar a pessoa.",
	);
}

export async function updatePayerClient(
	payerId: string,
	input: PayerCreatePayload,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/payers/${payerId}`,
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar a pessoa.",
	);
}

export async function deletePayerClient(payerId: string): Promise<ActionResult> {
	return fetchActionResult(
		`/api/payers/${payerId}`,
		{
			method: "DELETE",
		},
		"Não foi possível remover a pessoa.",
	);
}

export async function deletePayerShareClient(
	shareId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/payers/shares/${shareId}`,
		{
			method: "DELETE",
		},
		"Não foi possível remover o compartilhamento.",
	);
}

export async function updatePayerSharePermissionClient(
	shareId: string,
	input: { permission: PayerSharePermission },
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/payers/shares/${shareId}`,
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar a permissão.",
	);
}

export async function grantPayerAccessToExistingUserClient(input: {
	payerId: string;
	email: string;
	permission: PayerSharePermission;
}): Promise<ActionResult> {
	return fetchActionResult(
		`/api/payers/${input.payerId}/grant-access`,
		{
			method: "POST",
			...jsonRequestBody({
				email: input.email,
				permission: input.permission,
			}),
		},
		"Não foi possível conceder acesso.",
	);
}

export async function sendPayerSummaryClient(input: {
	payerId: string;
	period: string;
}): Promise<ActionResult> {
	return fetchActionResult(
		`/api/payers/${input.payerId}/send-summary`,
		{
			method: "POST",
			...jsonRequestBody({ period: input.period }),
		},
		"Não foi possível enviar o resumo.",
	);
}

export async function getPayerInvitePreviewClient(input: { token: string }) {
	const response = await fetch(
		`/api/payers/invite?token=${encodeURIComponent(input.token)}`,
		{ credentials: "include" },
	);
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		return { success: false as const, error: "Convite inválido." };
	}
	return (await response.json()) as
		| { success: false; error: string }
		| {
				success: true;
				payerName: string;
				email: string;
				permission: PayerSharePermission;
				expired: boolean;
		  };
}

export async function acceptPayerInviteClient(input: {
	token: string;
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/payers/invite",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível aceitar o convite.",
	);
}
