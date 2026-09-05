import type { AccountCreateResultData } from "@/features/accounts/actions";
import {
	fetchActionResult,
	fetchJsonData,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";
import type { ActionResult } from "@/shared/lib/types/actions";

export type AccountCreatePayload = {
	name: string;
	accountType: string;
	status: string;
	note: string | null;
	logo: string;
	initialBalance: number;
	excludeFromBalance: boolean;
	excludeInitialBalanceFromIncome: boolean;
};

export type AccountFormOptions = {
	logoOptions: string[];
};

export async function fetchAccountFormOptionsClient(): Promise<AccountFormOptions> {
	return fetchJsonData(
		"/api/accounts/form-options",
		undefined,
		"Não foi possível carregar as opções da conta.",
	);
}

export async function createAccountClient(
	input: AccountCreatePayload,
): Promise<ActionResult<AccountCreateResultData>> {
	return fetchActionResult(
		"/api/accounts",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível criar a conta.",
	);
}

export async function updateAccountClient(
	accountId: string,
	input: AccountCreatePayload,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/accounts/${accountId}`,
		{
			method: "PATCH",
			...jsonRequestBody(input),
		},
		"Não foi possível atualizar a conta.",
	);
}

export async function deleteAccountClient(
	accountId: string,
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/accounts/${accountId}`,
		{
			method: "DELETE",
		},
		"Não foi possível remover a conta.",
	);
}

export async function addAccountYieldClient(
	accountId: string,
	input: { amount: number; date: string },
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/accounts/${accountId}/yield`,
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível adicionar o rendimento.",
	);
}

export async function adjustAccountBalanceClient(
	accountId: string,
	input: {
		period: string;
		currentBalance: number;
		targetBalance: number;
		purchaseDate?: string;
	},
): Promise<ActionResult> {
	return fetchActionResult(
		`/api/accounts/${accountId}/adjust-balance`,
		{
			method: "POST",
			...jsonRequestBody(input),
		},
		"Não foi possível ajustar o saldo.",
	);
}
