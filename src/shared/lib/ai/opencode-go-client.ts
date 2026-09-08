import { randomUUID } from "node:crypto";
import { getOpenCodePlanFromBaseUrl } from "@/shared/lib/ai/opencode-plans";

export const OPENMONETIS_OPENCODE_USER_AGENT = "OpenMonetis/2.8.0";
export const OPENCODE_GO_SESSION_HEADER = "x-opencode-session";

export function createOpenCodeGoSessionId(): string {
	return randomUUID();
}

export function isOpenCodeGoBaseUrl(baseUrl?: string | null): boolean {
	return getOpenCodePlanFromBaseUrl(baseUrl) === "go";
}

export function buildOpenCodeGoHeaders(
	sessionId: string,
): Record<string, string> {
	return {
		[OPENCODE_GO_SESSION_HEADER]: sessionId,
		"User-Agent": OPENMONETIS_OPENCODE_USER_AGENT,
	};
}

export function resolveOpenCodeGoSessionId(
	sessionId?: string | null,
): string | undefined {
	const normalized = sessionId?.trim();
	if (normalized) return normalized;
	return createOpenCodeGoSessionId();
}
