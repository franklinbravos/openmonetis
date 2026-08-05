const PDFJS_LEGACY_WORKER_SRC = "/pdf.worker.min.mjs";

let pdfjsModulePromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null =
	null;

export async function loadPdfJs() {
	if (!pdfjsModulePromise) {
		pdfjsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").then(
			(pdfjsLib) => {
				pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_LEGACY_WORKER_SRC;
				return pdfjsLib;
			},
		);
	}

	return pdfjsModulePromise;
}
