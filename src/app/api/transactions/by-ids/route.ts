import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchTransactionsByIdsForViewer } from "@/features/transactions/lib/fetch-transactions-by-ids";
import { getOptionalUserSession } from "@/shared/lib/auth/server";

const bodySchema = z.object({
	ids: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: Request) {
	const session = await getOptionalUserSession();
	if (!session) {
		return NextResponse.json(
			{ success: false, error: "Não autenticado." },
			{ status: 401 },
		);
	}

	try {
		const body = bodySchema.parse(await request.json());
		const items = await fetchTransactionsByIdsForViewer(
			session.user.id,
			body.ids,
		);

		return NextResponse.json({ success: true, items });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ success: false, error: "IDs inválidos." },
				{ status: 400 },
			);
		}

		console.error("[api/transactions/by-ids]", error);
		return NextResponse.json(
			{ success: false, error: "Algo deu errado" },
			{ status: 500 },
		);
	}
}
