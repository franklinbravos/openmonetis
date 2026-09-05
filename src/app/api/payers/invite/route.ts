import { NextResponse } from "next/server";
import {
	acceptPayerInviteAction,
	getPayerInvitePreviewAction,
} from "@/features/payers/actions/share-access";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

export async function GET(request: Request) {
	const token = new URL(request.url).searchParams.get("token")?.trim();
	if (!token) {
		return NextResponse.json(
			{ success: false, error: "Convite inválido." },
			{ status: 400 },
		);
	}

	const result = await getPayerInvitePreviewAction({ token });

	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const body = (await request.json()) as { token?: string };
	const token = body.token?.trim();
	if (!token) {
		return NextResponse.json(
			{ success: false, error: "Convite inválido." },
			{ status: 400 },
		);
	}

	return runActionJson(() => acceptPayerInviteAction({ token }));
}
