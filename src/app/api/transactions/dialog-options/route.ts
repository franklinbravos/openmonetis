import { NextResponse } from "next/server";
import { fetchTransactionDialogOptionsAction } from "@/features/transactions/actions/fetch-dialog-options";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

const PRIVATE_RESPONSE_HEADERS = {
	"Cache-Control": "private, no-store",
};

export async function GET() {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	try {
		const options = await fetchTransactionDialogOptionsAction();
		return NextResponse.json(options, { headers: PRIVATE_RESPONSE_HEADERS });
	} catch (error) {
		console.error("[api/transactions/dialog-options]", error);
		return NextResponse.json(
			{ error: "Algo deu errado" },
			{ status: 500, headers: PRIVATE_RESPONSE_HEADERS },
		);
	}
}
