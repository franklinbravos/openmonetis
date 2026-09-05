import { NextResponse } from "next/server";
import { getPresignedUploadUrlAction } from "@/features/transactions/actions/attachments";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

type RouteContext = {
	params: Promise<{ transactionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const { transactionId } = await context.params;
	const input = await request.json();
	const result = await getPresignedUploadUrlAction({
		...input,
		transactionId,
	});

	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
