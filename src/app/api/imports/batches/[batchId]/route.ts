import { NextResponse } from "next/server";
import { deleteImportBatchAction } from "@/features/transactions/actions/import-batch-history-action";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ batchId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { batchId } = await context.params;
	const result = await deleteImportBatchAction({ batchId });

	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
