import {
	fetchActionResult,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

export async function updatePreferencesClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return fetchActionResult(
		"/api/settings/preferences",
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Erro ao atualizar preferências. Tente novamente.",
	);
}

export async function deleteSettingsAccountClient(input: {
	confirmation: string;
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/settings/danger/delete-account",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Erro ao deletar conta. Tente novamente.",
	);
}

export async function resetSettingsAccountClient(input: {
	confirmation: string;
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/settings/danger/reset-account",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Erro ao zerar conta. Tente novamente.",
	);
}

export async function completeRequiredPasswordChangeClient(input: {
	newPassword: string;
	confirmPassword: string;
}): Promise<ActionResult> {
	return fetchActionResult(
		"/api/settings/change-password-required",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível alterar a senha.",
	);
}

export async function updateAiProviderSettingsClient(
	input: Record<string, unknown>,
): Promise<ActionResult> {
	return fetchActionResult(
		"/api/settings/ai-providers",
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível salvar as configurações de IA.",
	);
}

export async function createApiTokenClient(input: {
	name: string;
}): Promise<ActionResult<{ token: string; tokenId: string }>> {
	return fetchActionResult(
		"/api/auth/device/tokens",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Erro ao criar token. Tente novamente.",
	);
}

export async function revokeApiTokenClient(input: {
	tokenId: string;
}): Promise<ActionResult> {
	return fetchActionResult(
		`/api/auth/device/tokens/${input.tokenId}`,
		{
			method: "DELETE",
		},
		"Erro ao revogar token. Tente novamente.",
	);
}
