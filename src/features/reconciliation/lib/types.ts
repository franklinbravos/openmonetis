import type { ReconciliationLine, ReconciliationSession } from "@/db/schema";
import type { ImportStatement } from "@/shared/lib/import/types";

export type ReconciliationSessionWithLines = ReconciliationSession & {
	lines: ReconciliationLine[];
};

export type ParsedReconciliationUpload = {
	statement: ImportStatement;
	sourceFileName: string;
	sourceType: "ofx" | "xls";
};

export type ReconciliationScope = {
	targetType: "card" | "account";
	targetId: string;
	period: string;
};
