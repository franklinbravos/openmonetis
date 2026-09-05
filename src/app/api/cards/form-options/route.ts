import { NextResponse } from "next/server";
import { fetchCardFormOptionsAction } from "@/features/cards/actions";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

export async function GET() {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const data = await fetchCardFormOptionsAction();
	return NextResponse.json(data);
}
