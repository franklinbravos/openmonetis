import { NextResponse } from "next/server";
import {
	createMassTransactionsAction,
	deleteMultipleTransactionsAction,
	deleteTransactionBulkAction,
	updateTransactionBulkAction,
} from "@/features/transactions/actions";
import { detachAttachmentBulkAction } from "@/features/transactions/actions/attachments";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const body = (await request.json()) as {
		operation?: string;
		[key: string]: unknown;
	};
	const { operation, ...payload } = body;

	switch (operation) {
		case "deleteBulk":
			return runActionJson(() =>
				deleteTransactionBulkAction(
					payload as Parameters<typeof deleteTransactionBulkAction>[0],
				),
			);
		case "updateBulk":
			return runActionJson(() =>
				updateTransactionBulkAction(
					payload as Parameters<typeof updateTransactionBulkAction>[0],
				),
			);
		case "massCreate":
			return runActionJson(() =>
				createMassTransactionsAction(
					payload as Parameters<typeof createMassTransactionsAction>[0],
				),
			);
		case "deleteMultiple":
			return runActionJson(() =>
				deleteMultipleTransactionsAction(
					payload as Parameters<typeof deleteMultipleTransactionsAction>[0],
				),
			);
		case "detachAttachments":
			return runActionJson(() =>
				detachAttachmentBulkAction(
					payload as Parameters<typeof detachAttachmentBulkAction>[0],
				),
			);
		default:
			return NextResponse.json(
				{ success: false, error: "Operação inválida." },
				{ status: 400 },
			);
	}
}
