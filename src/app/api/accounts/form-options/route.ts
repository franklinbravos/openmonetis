import { NextResponse } from "next/server";
import { fetchAccountFormOptionsAction } from "@/features/accounts/actions";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

export async function GET() {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const data = await fetchAccountFormOptionsAction();
	return NextResponse.json(data);
}
