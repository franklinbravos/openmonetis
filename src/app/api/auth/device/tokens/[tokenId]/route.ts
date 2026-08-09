import { and, eq } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { apiTokens } from "@/db/schema";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

interface RouteParams {
	params: Promise<{ tokenId: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
	await connection();

	const { tokenId } = await params;

	try {
		const user = await getUser();

		const token = await db.query.apiTokens.findFirst({
			where: and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, user.id)),
		});

		if (!token) {
			return NextResponse.json(
				{ error: "Token não encontrado" },
				{ status: 404 },
			);
		}

		await db
			.update(apiTokens)
			.set({ revokedAt: new Date() })
			.where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, user.id)));

		return NextResponse.json({
			message: "Token revogado com sucesso",
			tokenId,
		});
	} catch (error) {
		console.error("[API] Error revoking device token:", error);
		return NextResponse.json(
			{ error: "Erro ao revogar token" },
			{ status: 500 },
		);
	}
}
