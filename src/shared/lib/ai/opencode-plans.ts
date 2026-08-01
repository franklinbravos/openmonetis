export const OPENCODE_PLAN_ZEN_URL = "https://opencode.ai/zen/v1";
export const OPENCODE_PLAN_GO_URL = "https://opencode.ai/zen/go/v1";

export type OpenCodePlanId = "zen" | "go";

export const OPENCODE_PLANS = [
	{
		id: "zen" as const,
		name: "OpenCode Zen",
		description:
			"Gateway curado com GPT, Claude, Gemini e modelos gratuitos via pay-per-use.",
		baseUrl: OPENCODE_PLAN_ZEN_URL,
	},
	{
		id: "go" as const,
		name: "OpenCode Go",
		description:
			"Assinatura mensal com modelos open-source como Qwen, GLM e Kimi.",
		baseUrl: OPENCODE_PLAN_GO_URL,
	},
] as const;

export function getOpenCodePlanFromBaseUrl(
	baseUrl?: string | null,
): OpenCodePlanId {
	const normalized = baseUrl?.trim().toLowerCase() ?? "";
	if (normalized.includes("/zen/go")) {
		return "go";
	}

	return "zen";
}

export function resolveOpenCodePlanBaseUrl(baseUrl?: string | null): string {
	return getOpenCodePlanFromBaseUrl(baseUrl) === "go"
		? OPENCODE_PLAN_GO_URL
		: OPENCODE_PLAN_ZEN_URL;
}

export function isOpenCodeZenBaseUrl(baseUrl?: string | null): boolean {
	return getOpenCodePlanFromBaseUrl(baseUrl) === "zen";
}

export function isOpenCodeFreeModelId(modelId: string): boolean {
	const normalized = modelId
		.replace(/^opencode:/, "")
		.trim()
		.toLowerCase();
	return normalized.endsWith("-free");
}
