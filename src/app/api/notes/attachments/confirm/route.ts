import { NextResponse } from "next/server";
import { confirmNoteAttachmentUploadAction } from "@/features/notes/actions/attachments";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const input = await request.json();
	return runActionJson(() => confirmNoteAttachmentUploadAction(input));
}
