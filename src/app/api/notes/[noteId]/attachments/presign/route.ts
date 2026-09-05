import { NextResponse } from "next/server";
import { getPresignedNoteAttachmentUploadUrlAction } from "@/features/notes/actions/attachments";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ noteId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { noteId } = await context.params;
	const input = await request.json();
	const result = await getPresignedNoteAttachmentUploadUrlAction({
		noteId,
		...input,
	});
	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
