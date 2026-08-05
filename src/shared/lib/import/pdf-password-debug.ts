type PdfPasswordDebugPayload = Record<string, unknown>;

export function logPdfPasswordDebug(
	step: string,
	payload?: PdfPasswordDebugPayload,
) {
	if (process.env.NODE_ENV === "production") return;

	const prefix = "[import-pdf]";
	if (payload) {
		console.info(prefix, step, payload);
	} else {
		console.info(prefix, step);
	}
}

export function summarizePdfPasswordError(error: unknown) {
	if (!error || typeof error !== "object") {
		return { type: typeof error, value: String(error) };
	}

	const record = error as Record<string, unknown>;
	return {
		name: record.name,
		message: record.message,
		code: record.code,
		stack:
			error instanceof Error
				? error.stack?.split("\n").slice(0, 3).join("\n")
				: undefined,
	};
}

export function maskPasswordCandidate(candidate: string) {
	const trimmed = candidate.trim();
	if (!trimmed) return "(vazio)";
	if (trimmed.length <= 2) return "*".repeat(trimmed.length);
	return `${trimmed.slice(0, 2)}***${trimmed.slice(-1)} (len=${trimmed.length})`;
}
