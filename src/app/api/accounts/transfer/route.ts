import { NextResponse } from "next/server";
import {
	type TransferBetweenAccountsInput,
	transferBetweenAccounts,
} from "@/features/accounts/lib/transfer-between-accounts";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getOptionalUserSession } from "@/shared/lib/auth/server";

export async function POST(request: Request) {
	const session = await getOptionalUserSession();
	if (!session) {
		return NextResponse.json(
			{ success: false, error: "Não autenticado." },
			{ status: 401 },
		);
	}

	try {
		const input = (await request.json()) as TransferBetweenAccountsInput;
		const result = await transferBetweenAccounts(session.user.id, input);
		return NextResponse.json(result);
	} catch (error) {
		const result = handleActionError(error);
		return NextResponse.json(result, {
			status: result.success ? 200 : 400,
		});
	}
}
