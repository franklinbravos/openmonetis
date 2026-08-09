import { NextResponse } from "next/server";
import { z } from "zod";
import {
	getGoogleClientId,
	getGoogleClientSecret,
	isGoogleOAuthConfigured,
} from "@/shared/lib/auth/google-env";
import { createClient } from "@/shared/lib/supabase/server";

const bodySchema = z.object({
	code: z.string().min(1),
	redirect_uri: z.string().optional(),
});

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
		const clientId = getGoogleClientId();
		const clientSecret = getGoogleClientSecret();

		if (!clientId || !clientSecret) {
			return NextResponse.json(
				{ error: "Login com Google não está configurado." },
				{ status: 503 },
			);
		}

		const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: clientId,
				client_secret: clientSecret,
				redirect_uri: redirectUri ?? "postmessage",
				grant_type: "authorization_code",
			}),
		});

		if (!tokenResponse.ok) {
			console.error(
				"Google token exchange failed:",
				await tokenResponse.text(),
			);
			return NextResponse.json(
				{ error: "Não foi possível validar o login com Google." },
				{ status: 401 },
			);
		}

		const tokens = (await tokenResponse.json()) as { id_token?: string };
		if (!tokens.id_token) {
			return NextResponse.json(
				{ error: "Resposta inválida do Google." },
				{ status: 401 },
			);
		}

		const supabase = await createClient();
		const { error } = await supabase.auth.signInWithIdToken({
			provider: "google",
			token: tokens.id_token,
		});

		if (error) {
			console.error("Supabase signInWithIdToken failed:", error);
			return NextResponse.json(
				{
					error:
						error.message === "Unacceptable audience in id_token"
							? "Client ID do Google não autorizado no Supabase. Adicione-o em Authentication → Providers → Google."
							: "Não foi possível concluir o login com Google.",
				},
				{ status: 401 },
			);
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("Google auth route failed:", error);
		return NextResponse.json({ error: "Algo deu errado." }, { status: 500 });
	}
}
