import { grantPayerAccessToExistingUserAction } from "@/features/payers/actions/share-access";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ payerId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { payerId } = await context.params;
	const input = await request.json();
	return runActionJson(() =>
		grantPayerAccessToExistingUserAction({ payerId, ...input }),
	);
}
