import type { GeneratedInsightsResult } from "@/features/insights/actions/generate";
import type { ActionResult as InsightsActionResult } from "@/features/insights/actions/types";
import { getApiOrigin, jsonRequestBody } from "@/shared/lib/actions/action-api-client";

async function fetchInsightsActionResult<T>(
	path: string,
	init?: RequestInit,
	fallbackMessage = "Algo deu errado.",
): Promise<InsightsActionResult<T>> {
	const response = await fetch(`${getApiOrigin()}${path}`, {
		credentials: "include",
		...init,
	});

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error(fallbackMessage);
	}

	return (await response.json()) as InsightsActionResult<T>;
}

export async function fetchProviderModelsClient(input: {
	provider: string;
	apiKey?: string;
	baseUrl?: string;
}): Promise<
	InsightsActionResult<{
		models: Array<{ id: string; name: string }>;
	}>
> {
	return fetchInsightsActionResult("/api/insights/provider-models", {
		method: "POST",
		...jsonRequestBody(input),
	});
}

export async function generateInsightsClient(input: {
	period: string;
	modelId: string;
	userInstructions?: string;
	credentialOverride?: unknown;
}): Promise<InsightsActionResult<GeneratedInsightsResult>> {
	return fetchInsightsActionResult<GeneratedInsightsResult>(
		"/api/insights/generate",
		{
			method: "POST",
			...jsonRequestBody(input),
		},
	);
}

export async function deleteSavedInsightsClient(
	period: string,
): Promise<InsightsActionResult<void>> {
	return fetchInsightsActionResult<void>(
		`/api/insights/saved?period=${encodeURIComponent(period)}`,
		{
			method: "DELETE",
		},
	);
}
