import { archiveNoteAction } from "@/features/notes/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

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
	return runActionJson(() => archiveNoteAction({ id: noteId, ...input }));
}
