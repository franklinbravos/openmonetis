import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { attachments } from "@/db/schema";
import { getOptionalUserSession } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { createPresignedGetUrl } from "@/shared/lib/storage/presign";

const PRIVATE_RESPONSE_HEADERS = {
	"Cache-Control": "private, no-store",
};

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ attachmentId: string }> },
) {
	const [session, { attachmentId }] = await Promise.all([
		getOptionalUserSession(),
		params,
	]);

	if (!session?.user) {
		return NextResponse.json(
			{ error: "Não autenticado" },
			{ status: 401, headers: PRIVATE_RESPONSE_HEADERS },
		);
	}

	const userId = session.user.id;
	const dataOwnerUserId = await getFinancialDataOwnerId(userId);

	const [row] = await db
		.select({ fileKey: attachments.fileKey })
		.from(attachments)
		.where(
			and(
				eq(attachments.id, attachmentId),
				eq(attachments.userId, dataOwnerUserId),
			),
		);

	if (!row) {
		return NextResponse.json(
			{ error: "Not found" },
			{
				status: 404,
				headers: PRIVATE_RESPONSE_HEADERS,
			},
		);
	}

	const url = await createPresignedGetUrl(row.fileKey);
	return NextResponse.json(
		{ url },
		{
			headers: PRIVATE_RESPONSE_HEADERS,
		},
	);
}
