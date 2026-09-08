import { describe, expect, it } from "vitest";
import {
	buildOpenCodeGoHeaders,
	createOpenCodeGoSessionId,
	isOpenCodeGoBaseUrl,
	OPENMONETIS_OPENCODE_USER_AGENT,
	OPENCODE_GO_SESSION_HEADER,
} from "@/shared/lib/ai/opencode-go-client";

describe("opencode-go-client", () => {
	it("identifica base URL do plano Go", () => {
		expect(isOpenCodeGoBaseUrl("https://opencode.ai/zen/go/v1")).toBe(true);
		expect(isOpenCodeGoBaseUrl("https://opencode.ai/zen/v1")).toBe(false);
	});

	it("gera headers exigidos pelo OpenCode Go", () => {
		const sessionId = createOpenCodeGoSessionId();
		const headers = buildOpenCodeGoHeaders(sessionId);

		expect(headers[OPENCODE_GO_SESSION_HEADER]).toBe(sessionId);
		expect(headers["User-Agent"]).toBe(OPENMONETIS_OPENCODE_USER_AGENT);
	});
});
