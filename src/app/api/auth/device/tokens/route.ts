import { and, desc, eq, isNull } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { apiTokens } from "@/db/schema";
import { createApiTokenAction } from "@/features/settings/actions";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";
import { getOptionalUserSession } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

export async function GET() {
	await connection();

	const session = await getOptionalUserSession();
	if (!session) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	try {
		const user = session.user;

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

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) {
		return unauthorized;
	}

	const input = await request.json();
	const result = await createApiTokenAction(input);
	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
