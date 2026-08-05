export const IMPORT_SOURCE_MIME_TYPES = [
	"application/pdf",
	"text/csv",
	"text/plain",
	"application/x-ofx",
	"application/vnd.intu.qfx",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/octet-stream",
] as const;

export type ImportSourceMimeType = (typeof IMPORT_SOURCE_MIME_TYPES)[number];

export function resolveImportFileMimeType(file: File): ImportSourceMimeType {
	if (
		file.type &&
		IMPORT_SOURCE_MIME_TYPES.includes(file.type as ImportSourceMimeType)
	) {
		return file.type as ImportSourceMimeType;
	}

	const extension = file.name.split(".").pop()?.toLowerCase();
	switch (extension) {
		case "pdf":
			return "application/pdf";
		case "csv":
			return "text/csv";
		case "txt":
			return "text/plain";
		case "ofx":
		case "qfx":
			return "application/x-ofx";
		case "xlsx":
			return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
		case "xls":
			return "application/vnd.ms-excel";
		default:
			return "application/octet-stream";
	}
}

export function isAllowedImportSourceMimeType(
	mimeType: string,
): mimeType is ImportSourceMimeType {
	return IMPORT_SOURCE_MIME_TYPES.includes(mimeType as ImportSourceMimeType);
}
