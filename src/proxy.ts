import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isSignupDisabled } from "@/shared/lib/auth/signup";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/shared/lib/supabase/env";

type CookieToSet = {
	name: string;
	value: string;
	options: CookieOptions;
};

// Rotas protegidas que requerem autenticação
const PROTECTED_ROUTES = [
	"/settings",
	"/notes",
	"/calendar",
	"/cards",
	"/categories",
	"/accounts",
	"/dashboard",
	"/insights",
	"/transactions",
	"/budgets",
	"/payers",
	"/inbox",
	"/reports",
	"/reconciliation",
	"/attachments",
	"/changelog",
	"/change-password-required",
];

function redirectKeepingSession(
	request: NextRequest,
	path: string,
	sessionCookies: CookieToSet[],
	authHeaders: Record<string, string>,
) {
	const redirectResponse = NextResponse.redirect(new URL(path, request.url));

	for (const { name, value, options } of sessionCookies) {
		redirectResponse.cookies.set(name, value, options);
	}

	for (const [key, value] of Object.entries(authHeaders)) {
		redirectResponse.headers.set(key, value);
	}

	return redirectResponse;
}

const PUBLIC_AUTH_ROUTES = ["/login", "/signup"];

function buildCsp(): string {
	const isDev = process.env.NODE_ENV === "development";

	const storageOrigin = (() => {
		try {
			if (process.env.SUPABASE_URL?.trim()) {
				return new URL(process.env.SUPABASE_URL).origin;
			}
			if (process.env.S3_ENDPOINT?.trim()) {
				return new URL(process.env.S3_ENDPOINT).origin;
			}
			return "";
		} catch {
			return "";
		}
	})();

	const umamiOrigin = process.env.UMAMI_URL ?? "";

	const connectExtras = [umamiOrigin, storageOrigin, getSupabaseUrl()]
		.filter(Boolean)
		.join(" ");

	const imgExtras = [
		"https://lh3.googleusercontent.com",
		"https://img.logo.dev",
		storageOrigin,
	]
		.filter(Boolean)
		.join(" ");

	return [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline' https://accounts.google.com${isDev ? " 'unsafe-eval'" : ""}${umamiOrigin ? ` ${umamiOrigin}` : ""}`,
		"style-src 'self' 'unsafe-inline'",
		`img-src 'self' ${imgExtras} data: blob:`,
		"font-src 'self'",
		`connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com ${connectExtras}`,
		`frame-src 'self' https://accounts.google.com${storageOrigin ? ` ${storageOrigin}` : ""}`,
		"frame-ancestors 'none'",
	].join("; ");
}

async function getSessionUser(request: NextRequest) {
	let response = NextResponse.next({ request });
	let sessionCookies: CookieToSet[] = [];
	let authHeaders: Record<string, string> = {};

	const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet, headers = {}) {
				sessionCookies = cookiesToSet;
				authHeaders = headers;

				for (const { name, value } of cookiesToSet) {
					request.cookies.set(name, value);
				}
				response = NextResponse.next({ request });
				for (const { name, value, options } of cookiesToSet) {
					response.cookies.set(name, value, options);
				}
				for (const [key, value] of Object.entries(headers)) {
					response.headers.set(key, value);
				}
			},
		},
	});

	const { data } = await supabase.auth.getUser();
	return { user: data.user, response, sessionCookies, authHeaders };
}

export default async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	const publicDomain = process.env.PUBLIC_DOMAIN?.replace(
		/^https?:\/\//,
		"",
	).replace(/:\d+$/, "");
	const hostname = request.headers.get("host")?.replace(/:\d+$/, "");

	if (publicDomain && hostname === publicDomain) {
		if (pathname.startsWith("/api/")) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		if (pathname !== "/") {
			return NextResponse.redirect(new URL("/", request.url));
		}
		return NextResponse.next();
	}

	const {
		user,
		response: sessionResponse,
		sessionCookies,
		authHeaders,
	} = await getSessionUser(request);
	const isAuthenticated = Boolean(user);
	const signupDisabled = isSignupDisabled();

	if (signupDisabled) {
		const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
		const isInviteSignup = callbackUrl?.includes("/invite?token=");

		if (
			!isInviteSignup &&
			(pathname === "/signup" || pathname.startsWith("/signup/"))
		) {
			return redirectKeepingSession(
				request,
				isAuthenticated ? "/dashboard" : "/login",
				sessionCookies,
				authHeaders,
			);
		}
	}

	if (
		isAuthenticated &&
		PUBLIC_AUTH_ROUTES.includes(pathname) &&
		pathname !== "/signup"
	) {
		return redirectKeepingSession(
			request,
			"/dashboard",
			sessionCookies,
			authHeaders,
		);
	}

	const mustChangePassword = Boolean(user?.user_metadata?.must_change_password);

	if (mustChangePassword && isAuthenticated) {
		const canAccess =
			pathname.startsWith("/change-password-required") ||
			pathname.startsWith("/auth");

		if (!canAccess) {
			return redirectKeepingSession(
				request,
				"/change-password-required",
				sessionCookies,
				authHeaders,
			);
		}
	}

	const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
		pathname.startsWith(route),
	);

	if (!isAuthenticated && isProtectedRoute) {
		return redirectKeepingSession(
			request,
			"/login",
			sessionCookies,
			authHeaders,
		);
	}

	const response = sessionResponse;
	if (!pathname.startsWith("/api/")) {
		response.headers.set("Content-Security-Policy", buildCsp());
	}
	return response;
}

export const config = {
	matcher: [
		/*
		 * Renova sessão Supabase em todas as rotas dinâmicas.
		 * Server Components não conseguem gravar cookies — o proxy precisa cobrir tudo.
		 */
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
	],
};
