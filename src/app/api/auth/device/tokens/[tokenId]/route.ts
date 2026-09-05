import { NextResponse } from "next/server";
import { revokeApiTokenAction } from "@/features/settings/actions";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

interface RouteParams {
	params: Promise<{ tokenId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const { tokenId } = await params;
	const result = await revokeApiTokenAction({ tokenId });
	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
