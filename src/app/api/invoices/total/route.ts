import { fetchInvoiceRegisteredTotal } from "@/features/invoices/queries";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

export async function GET(request: Request) {
	const { session, unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { searchParams } = new URL(request.url);
	const cardId = searchParams.get("cardId")?.trim();
	const period = searchParams.get("period")?.trim();

	if (!cardId || !period || !/^\d{4}-\d{2}$/.test(period)) {
		return runActionJson(async () => ({
			success: false,
			error: "Parâmetros inválidos.",
		}));
	}

	return runActionJson(async () => {
		const totalAmount = await fetchInvoiceRegisteredTotal(
			session.user.id,
			cardId,
			period,
		);

		return {
			success: true,
			message: "Total da fatura carregado.",
			data: { totalAmount },
		};
	});
}
