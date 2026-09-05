import { detachTransactionAttachmentAction } from "@/features/transactions/actions/attachments";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ transactionId: string; attachmentId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { transactionId, attachmentId } = await context.params;

	return runActionJson(() =>
		detachTransactionAttachmentAction({ transactionId, attachmentId }),
	);
}
