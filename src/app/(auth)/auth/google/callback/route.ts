import { type NextRequest, NextResponse } from "next/server";
import {
	GOOGLE_OAUTH_REDIRECT_URI_COOKIE,
	getGoogleOAuthCallbackPath,
} from "@/shared/lib/auth/google-callback-url";
import { isGoogleOAuthConfigured } from "@/shared/lib/auth/google-env";
import { exchangeGoogleAuthCode } from "@/shared/lib/auth/google-exchange";

function resolveRedirectUri(request: NextRequest): string {
	const requestUrl = new URL(request.url);
	const fromRequest = `${requestUrl.origin}${requestUrl.pathname}`;

	const cookieValue = request.cookies.get(
		GOOGLE_OAUTH_REDIRECT_URI_COOKIE,
	)?.value;
	if (cookieValue) {
		try {
			return decodeURIComponent(cookieValue);
		} catch {
			return fromRequest;
		}
	}

	return fromRequest;
}

export async function GET(request: NextRequest) {
	if (!isGoogleOAuthConfigured()) {
		return NextResponse.redirect(
			new URL("/?error=oauth_callback_failed", request.url),
		);
	}

	const requestUrl = new URL(request.url);
	const oauthError = requestUrl.searchParams.get("error");

	if (oauthError) {
		const loginUrl = new URL("/", request.url);
		loginUrl.searchParams.set("error", oauthError);
		const description = requestUrl.searchParams.get("error_description");
		if (description) {
			loginUrl.searchParams.set("error_description", description);
		}
		return clearRedirectCookie(NextResponse.redirect(loginUrl));
	}

	const code = requestUrl.searchParams.get("code");
	if (!code) {
		return clearRedirectCookie(
			NextResponse.redirect(
				new URL("/?error=oauth_callback_failed", request.url),
			),
		);
	}

	const redirectUri = resolveRedirectUri(request);
	const result = await exchangeGoogleAuthCode(code, redirectUri);

	if (!result.ok) {
		const loginUrl = new URL("/", request.url);
		loginUrl.searchParams.set("error", result.error);
		return clearRedirectCookie(NextResponse.redirect(loginUrl));
	}

	const expectedPath = getGoogleOAuthCallbackPath();
	if (!requestUrl.pathname.endsWith(expectedPath)) {
		console.warn(
			`Google OAuth callback em path inesperado: ${requestUrl.pathname}`,
		);
	}

	return clearRedirectCookie(
		NextResponse.redirect(new URL("/dashboard", request.url)),
	);
}

function clearRedirectCookie(response: NextResponse): NextResponse {
	response.cookies.set(GOOGLE_OAUTH_REDIRECT_URI_COOKIE, "", {
		path: "/",
		maxAge: 0,
	});
	return response;
}
