import { join } from "node:path";
import { pathToFileURL } from "node:url";

function resolvePdfWorkerSrc(): string {
	if (typeof window !== "undefined") {
		// URL absoluta evita falha de same-origin do pdf.js 6 com path relativo.
		return `${window.location.origin}/pdf.worker.min.mjs`;
	}

	return pathToFileURL(join(process.cwd(), "public/pdf.worker.min.mjs")).href;
}

let pdfjsModulePromise: Promise<
	typeof import("pdfjs-dist/legacy/build/pdf.mjs")
> | null = null;

export async function loadPdfJs() {
	if (!pdfjsModulePromise) {
		pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then(
			(pdfjsLib) => {
				pdfjsLib.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc();
				return pdfjsLib;
			},
		);
	}

	return pdfjsModulePromise;
}

export function buildPdfDocumentInit(
	data: Uint8Array,
	password?: string,
): {
	data: Uint8Array;
	password?: string;
	useWasm: boolean;
	useWorkerFetch: boolean;
} {
	return {
		data,
		...(password ? { password } : {}),
		// Evita fetch de wasm/cmaps externos que podem travar atrás da CSP.
		useWasm: false,
		useWorkerFetch: false,
	};
}
