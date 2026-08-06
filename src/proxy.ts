import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/shared/lib/auth/config";
import { isSignupDisabled } from "@/shared/lib/auth/signup";

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
	"/change-password-required",
];

// Rotas públicas (não requerem autenticação)
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

	const connectExtras = [umamiOrigin, storageOrigin].filter(Boolean).join(" ");

	const imgExtras = [
		"https://lh3.googleusercontent.com",
		"https://img.logo.dev",
		storageOrigin,
	]
		.filter(Boolean)
		.join(" ");

	return [
		"default-src 'self'",
		`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${umamiOrigin ? ` ${umamiOrigin}` : ""}`,
		"style-src 'self' 'unsafe-inline'",
		`img-src 'self' ${imgExtras} data: blob:`,
		"font-src 'self'",
		`connect-src 'self' ${connectExtras}`,
		`frame-src 'self'${storageOrigin ? ` ${storageOrigin}` : ""}`,
		"frame-ancestors 'none'",
	].join("; ");
}

export default async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Multi-domain: block all routes except landing on public domain
	// Normalize PUBLIC_DOMAIN: strip protocol and port if provided
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

	// Validate actual session, not just cookie existence
	const session = await auth.api.getSession({
		headers: request.headers,
	});

	const isAuthenticated = !!session?.user;
	const signupDisabled = isSignupDisabled();

	if (signupDisabled) {
		const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
		const isInviteSignup = callbackUrl?.includes("/invite?token=");

		if (
			!isInviteSignup &&
			(pathname === "/signup" || pathname.startsWith("/signup/"))
		) {
			return NextResponse.redirect(
				new URL(isAuthenticated ? "/dashboard" : "/login", request.url),
			);
		}
	}

	// Redirect authenticated users away from login/signup pages
	if (
		isAuthenticated &&
		PUBLIC_AUTH_ROUTES.includes(pathname) &&
		pathname !== "/signup"
	) {
		return NextResponse.redirect(new URL("/dashboard", request.url));
	}

	const mustChangePassword = Boolean(
		session?.user &&
			"mustChangePassword" in session.user &&
			session.user.mustChangePassword,
	);

	if (mustChangePassword && isAuthenticated) {
		const canAccess =
			pathname.startsWith("/change-password-required") ||
			pathname.startsWith("/api/auth");

		if (!canAccess) {
			return NextResponse.redirect(
				new URL("/change-password-required", request.url),
			);
		}
	}

	// Redirect unauthenticated users trying to access protected routes
	const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
		pathname.startsWith(route),
	);

	if (!isAuthenticated && isProtectedRoute) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	const response = NextResponse.next();
	if (!pathname.startsWith("/api/")) {
		response.headers.set("Content-Security-Policy", buildCsp());
	}
	return response;
}

export const config = {
	// Apply middleware to protected and auth routes
	matcher: [
		"/",
		"/api/:path*",
		"/settings/:path*",
		"/notes/:path*",
		"/calendar/:path*",
		"/cards/:path*",
		"/categories/:path*",
		"/accounts/:path*",
		"/dashboard/:path*",
		"/insights/:path*",
		"/transactions/:path*",
		"/budgets/:path*",
		"/payers/:path*",
		"/inbox/:path*",
		"/reports/:path*",
		"/reconciliation/:path*",
		"/login",
		"/signup",
		"/invite",
		"/change-password-required",
	],
};
