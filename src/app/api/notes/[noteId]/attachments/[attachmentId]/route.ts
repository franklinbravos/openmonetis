import { removeNoteAttachmentAction } from "@/features/notes/actions/attachments";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ noteId: string; attachmentId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { noteId, attachmentId } = await context.params;
	return runActionJson(() =>
		removeNoteAttachmentAction({ noteId, attachmentId }),
	);
}
