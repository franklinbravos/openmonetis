import { loadPdfJs } from "./pdfjs-client";
import {
	logPdfPasswordDebug,
	maskPasswordCandidate,
	summarizePdfPasswordError,
} from "./pdf-password-debug";

export {
	logPdfPasswordDebug,
	maskPasswordCandidate,
	summarizePdfPasswordError,
} from "./pdf-password-debug";

export class PdfPasswordRequiredError extends Error {
	constructor(message = "Este PDF está protegido por senha.") {
		super(message);
		this.name = "PdfPasswordRequiredError";
	}
}

export class PdfPasswordIncorrectError extends Error {
	constructor(message = "Senha incorreta. Tente novamente.") {
		super(message);
		this.name = "PdfPasswordIncorrectError";
	}
}

export function isPdfPasswordError(error: unknown): boolean {
	if (
		error instanceof PdfPasswordRequiredError ||
		error instanceof PdfPasswordIncorrectError
	) {
		return true;
	}

	if (error instanceof Error) {
		return (
			error.name === "PdfPasswordRequiredError" ||
			error.name === "PdfPasswordIncorrectError"
		);
	}

	if (error && typeof error === "object" && "name" in error) {
		const name = error.name;
		return (
			name === "PdfPasswordRequiredError" ||
			name === "PdfPasswordIncorrectError"
		);
	}

	return false;
}

export function getPdfPasswordCandidates(password?: string): string[] {
	if (!password) return [];

	const trimmed = password.trim();
	if (!trimmed) return [];

	const digitsOnly = trimmed.replace(/\D/g, "");
	const candidates: string[] = [];

	if (digitsOnly.length >= 6) {
		candidates.push(digitsOnly.slice(0, 6));
	}

	if (trimmed.length > 0) {
		candidates.push(trimmed);
	}

	if (digitsOnly.length > 0 && digitsOnly !== trimmed) {
		candidates.push(digitsOnly);
	}

	return [...new Set(candidates)];
}

function isPdfJsInternalParserError(message: string): boolean {
	return /getOrInsertComputed|Invalid "Root" reference|Invalid "Encrypt" reference/i.test(
		message,
	);
}

export function mapPdfLoadError(
	error: unknown,
	passwordAttempted = false,
): Error {
	logPdfPasswordDebug("mapPdfLoadError:input", {
		passwordAttempted,
		error: summarizePdfPasswordError(error),
	});

	if (isPdfPasswordError(error)) {
		return error instanceof Error
			? error
			: new PdfPasswordIncorrectError();
	}

	if (error && typeof error === "object" && "name" in error) {
		if (error.name === "PasswordException") {
			const code = "code" in error ? Number(error.code) : undefined;
			logPdfPasswordDebug("mapPdfLoadError:password-exception", { code });
			if (code === 2) {
				return new PdfPasswordIncorrectError();
			}
			return new PdfPasswordRequiredError();
		}

		const message =
			"message" in error && typeof error.message === "string"
				? error.message
				: "";

		if (isPdfJsInternalParserError(message)) {
			return new Error(
				"Falha interna ao ler o PDF (pdf.js). Recarregue a página e tente novamente.",
			);
		}

		if (
			passwordAttempted &&
			error.name === "InvalidPDFException" &&
			/invalid root reference/i.test(message)
		) {
			return new PdfPasswordIncorrectError();
		}
	}

	if (error instanceof Error && /no password given/i.test(error.message)) {
		return new PdfPasswordRequiredError();
	}

	return error instanceof Error
		? error
		: new Error("Não foi possível ler o PDF.");
}

async function loadPdfWithPasswordCandidates(
	pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>,
	buffer: ArrayBuffer,
	candidates: string[],
) {
	const data = new Uint8Array(buffer.slice(0));
	let attemptIndex = 0;

	logPdfPasswordDebug("open:start", {
		bufferBytes: buffer.byteLength,
		candidateCount: candidates.length,
		candidates: candidates.map(maskPasswordCandidate),
		workerSrc: pdfjsLib.GlobalWorkerOptions.workerSrc,
		pdfjsVersion: pdfjsLib.version,
	});

	const loadingTask = pdfjsLib.getDocument({ data });
	loadingTask.onPassword = (
		updatePassword: (password: string | Error) => void,
		reason: number,
	) => {
		const candidate = candidates[attemptIndex];
		logPdfPasswordDebug("onPassword", {
			reason,
			attemptIndex,
			candidate: candidate ? maskPasswordCandidate(candidate) : null,
			remaining: candidates.length - attemptIndex,
		});

		if (attemptIndex >= candidates.length) {
			logPdfPasswordDebug("onPassword:exhausted");
			updatePassword(new PdfPasswordIncorrectError());
			return;
		}

		updatePassword(candidates[attemptIndex++]!);
	};

	try {
		const pdf = await loadingTask.promise;
		logPdfPasswordDebug("open:success", { numPages: pdf.numPages });
		return pdf;
	} catch (error) {
		logPdfPasswordDebug("open:failed", {
			error: summarizePdfPasswordError(error),
		});
		await loadingTask.destroy().catch(() => {});
		throw error;
	}
}

async function loadPdfRequestingPassword(
	pdfjsLib: Awaited<ReturnType<typeof loadPdfJs>>,
	buffer: ArrayBuffer,
) {
	const data = new Uint8Array(buffer.slice(0));
	logPdfPasswordDebug("open:no-password-provided", {
		bufferBytes: buffer.byteLength,
	});

	const loadingTask = pdfjsLib.getDocument({ data });
	loadingTask.onPassword = (
		updatePassword: (password: string | Error) => void,
		reason: number,
	) => {
		logPdfPasswordDebug("onPassword:required", { reason });
		updatePassword(new PdfPasswordRequiredError());
	};

	try {
		return await loadingTask.promise;
	} catch (error) {
		logPdfPasswordDebug("open:failed-no-password", {
			error: summarizePdfPasswordError(error),
		});
		await loadingTask.destroy().catch(() => {});
		throw error;
	}
}

export async function openPdfDocumentWithPassword(
	buffer: ArrayBuffer,
	password?: string,
	extraCandidates: string[] = [],
) {
	const pdfjsLib = await loadPdfJs();

	const candidates = [
		...new Set([
			...(password?.trim() ? getPdfPasswordCandidates(password) : []),
			...extraCandidates.map((candidate) => candidate.trim()).filter(Boolean),
		]),
	];

	logPdfPasswordDebug("openPdfDocumentWithPassword", {
		hasExplicitPassword: Boolean(password?.trim()),
		extraCandidateCount: extraCandidates.length,
		mergedCandidateCount: candidates.length,
	});

	if (candidates.length === 0) {
		try {
			return await loadPdfRequestingPassword(pdfjsLib, buffer);
		} catch (error) {
			throw mapPdfLoadError(error, false);
		}
	}

	try {
		return await loadPdfWithPasswordCandidates(pdfjsLib, buffer, candidates);
	} catch (error) {
		throw mapPdfLoadError(error, true);
	}
}

/** @deprecated Use mapPdfLoadError */
export const mapPdfPasswordError = mapPdfLoadError;
