import {
	createAccountAction,
} from "@/features/accounts/actions";
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
	return runActionJson(() => createAccountAction(input));
}
