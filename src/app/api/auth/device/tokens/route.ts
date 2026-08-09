import { and, desc, eq, isNull } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { apiTokens } from "@/db/schema";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

export async function GET() {
	await connection();

	try {
		const user = await getUser();

		const activeTokens = await db
			.select({
				id: apiTokens.id,
				name: apiTokens.name,
				tokenPrefix: apiTokens.tokenPrefix,
				lastUsedAt: apiTokens.lastUsedAt,
				lastUsedIp: apiTokens.lastUsedIp,
				expiresAt: apiTokens.expiresAt,
				createdAt: apiTokens.createdAt,
			})
			.from(apiTokens)
			.where(and(eq(apiTokens.userId, user.id), isNull(apiTokens.revokedAt)))
			.orderBy(desc(apiTokens.createdAt));

		return NextResponse.json({ tokens: activeTokens });
	} catch (error) {
		console.error("[API] Error listing device tokens:", error);
		return NextResponse.json(
			{ error: "Erro ao listar tokens" },
			{ status: 500 },
		);
	}
}
