import { updatePaymentDateAction } from "@/features/invoices/actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

export async function PATCH(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const input = await request.json();
	return runActionJson(() => updatePaymentDateAction(input));
}
