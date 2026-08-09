import { join } from "node:path";
import { pathToFileURL } from "node:url";

function resolvePdfWorkerSrc(): string {
	if (typeof window !== "undefined") {
		return "/pdf.worker.min.mjs";
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
