import { confirmAttachmentUploadAction } from "@/features/transactions/actions/attachments";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ transactionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const input = await request.json();

	return runActionJson(() => confirmAttachmentUploadAction(input));
}
