import { NextResponse } from "next/server";
import { z } from "zod";
import { isGoogleOAuthConfigured } from "@/shared/lib/auth/google-env";
import { exchangeGoogleAuthCode } from "@/shared/lib/auth/google-exchange";

const bodySchema = z.object({
	code: z.string().min(1),
	redirect_uri: z.string().optional(),
});

/** Popup GIS (postmessage) — redirect usa GET /auth/google/callback. */
export async function POST(request: Request) {
	if (!isGoogleOAuthConfigured()) {
		return NextResponse.json(
			{ error: "Login com Google não está configurado." },
			{ status: 503 },
		);
	}

	try {
		const { code, redirect_uri: redirectUri } = bodySchema.parse(
			await request.json(),
		);

		const result = await exchangeGoogleAuthCode(
			code,
			redirectUri ?? "postmessage",
		);

		if (!result.ok) {
			return NextResponse.json({ error: result.error }, { status: 401 });
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("Google auth route failed:", error);
		return NextResponse.json({ error: "Algo deu errado." }, { status: 500 });
	}
}
