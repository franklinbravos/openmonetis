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

const PUBLIC_AUTH_ROUTES = ["/", "/login", "/signup"];

const PUBLIC_SITE_AUTH_PREFIXES = ["/api/auth", "/auth"];

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
		// 'unsafe-inline' é necessário para os scripts inline que o Next.js injeta
		// para hidratação do App Router. Para removê-lo, seria preciso adotar
		// nonce (header x-nonce + geração por request). 'unsafe-eval' só em dev
		// (Turbopack/HMR).
		`script-src 'self' 'unsafe-inline' https://accounts.google.com${isDev ? " 'unsafe-eval'" : ""}${umamiOrigin ? ` ${umamiOrigin}` : ""}`,
		"style-src 'self' 'unsafe-inline'",
		`img-src 'self' ${imgExtras} data: blob:`,
		"font-src 'self'",
		`connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com ${connectExtras}`,
		"worker-src 'self' blob:",
		`frame-src 'self' https://accounts.google.com${storageOrigin ? ` ${storageOrigin}` : ""}`,
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
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

function isLoopbackHostname(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "0.0.0.0"
	);
}

/** Dev: 127.0.0.1 → localhost quando APP_URL usa localhost (evita OAuth mismatch). */
function redirectLoopbackToCanonicalAppUrl(
	request: NextRequest,
): NextResponse | null {
	if (process.env.NODE_ENV !== "development") return null;
	// Só redireciona GET: POST (Server Actions) perde o body no 307 e o cliente
	// recebe "An unexpected response was received from the server".
	if (request.method !== "GET") return null;

	const appUrl =
		process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
	if (!appUrl) return null;

	let canonical: URL;
	try {
		canonical = new URL(appUrl);
	} catch {
		return null;
	}

	if (!isLoopbackHostname(canonical.hostname)) return null;

	const requestUrl = new URL(request.url);
	if (!isLoopbackHostname(requestUrl.hostname)) return null;
	if (requestUrl.hostname === canonical.hostname) return null;
	if (requestUrl.port !== canonical.port) return null;

	requestUrl.hostname = canonical.hostname;
	requestUrl.protocol = canonical.protocol;
	return NextResponse.redirect(requestUrl);
}

export default async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	const loopbackRedirect = redirectLoopbackToCanonicalAppUrl(request);
	if (loopbackRedirect) {
		return loopbackRedirect;
	}

	const publicDomain = process.env.PUBLIC_DOMAIN?.replace(
		/^https?:\/\//,
		"",
	).replace(/:\d+$/, "");
	const hostname = request.headers.get("host")?.replace(/:\d+$/, "");

	if (publicDomain && hostname === publicDomain) {
		const isPublicSiteAuthRoute =
			pathname === "/" ||
			pathname === "/login" ||
			pathname.startsWith("/signup") ||
			PUBLIC_SITE_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

		if (!isPublicSiteAuthRoute) {
			if (pathname.startsWith("/api/")) {
				return NextResponse.json({ error: "Not found" }, { status: 404 });
			}
			return NextResponse.redirect(new URL("/", request.url));
		}
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
				isAuthenticated ? "/dashboard" : "/",
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

	const isServerAction =
		request.method === "POST" && request.headers.has("next-action");

	if (!isAuthenticated && isProtectedRoute) {
		// Redirect em Server Action devolve HTML → E394 no cliente.
		if (isServerAction) {
			return new NextResponse("Unauthorized", { status: 401 });
		}

		return redirectKeepingSession(
			request,
			"/",
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
