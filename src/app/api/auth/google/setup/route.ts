import { NextResponse } from "next/server";
import {
	getGoogleClientId,
	isGoogleOAuthConfigured,
} from "@/shared/lib/auth/google-env";
import { getGoogleOAuthCallbackPath } from "@/shared/lib/auth/google-callback-url";
import { getAppOrigin } from "@/shared/lib/app-url";

/**
 * Diagnóstico de OAuth Google (dev/setup).
 * GET /api/auth/google/setup
 */
export async function GET() {
	const appOrigin = getAppOrigin();
	const redirectUri = appOrigin
		? `${appOrigin.replace(/\/$/, "")}${getGoogleOAuthCallbackPath()}`
		: null;

	return NextResponse.json({
		configured: isGoogleOAuthConfigured(),
		clientId: getGoogleClientId() ?? null,
		appUrl: appOrigin || null,
		googleCloudConsole: {
			clientType: "Web application",
			authorizedJavaScriptOrigins: appOrigin ? [appOrigin] : [],
			authorizedRedirectUris: redirectUri ? [redirectUri] : [],
			notes: [
				"Cadastre também 127.0.0.1 ou outros hosts se abrir o app por eles.",
				"O login Google é validado no Next.js; não é necessário configurar provider Google no painel Supabase.",
				"O fluxo popup usa postmessage e não exige redirect URI; o redirect exige a URI acima.",
			],
		},
	});
}
