import { passkey } from "@better-auth/passkey";
import { APIError, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { GoogleProfile } from "better-auth/social-providers";
import { isSignupDisabled } from "@/shared/lib/auth/signup";
import { seedDefaultCategoriesForUser } from "@/shared/lib/categories/defaults";
import { db, schema } from "@/shared/lib/db";
import { ensureDefaultPayerForUser } from "@/shared/lib/payers/defaults";
import { hasPendingInviteForEmail } from "@/shared/lib/payers/share-invite-queries";
import { normalizeNameFromEmail } from "@/shared/lib/payers/utils";

// ============================================================================
// GOOGLE OAUTH CONFIGURATION
// ============================================================================

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const DEFAULT_SESSION_EXPIRES_IN_DAYS = 30;
const DEFAULT_SESSION_UPDATE_AGE_HOURS = 24;

function parsePositiveIntegerEnv(name: string, fallback: number): number {
	const value = process.env[name];
	if (!value) return fallback;

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const sessionExpiresInDays = parsePositiveIntegerEnv(
	"AUTH_SESSION_EXPIRES_IN_DAYS",
	DEFAULT_SESSION_EXPIRES_IN_DAYS,
);
const sessionUpdateAgeHours = parsePositiveIntegerEnv(
	"AUTH_SESSION_UPDATE_AGE_HOURS",
	DEFAULT_SESSION_UPDATE_AGE_HOURS,
);

/**
 * Extrai nome do usuário do perfil do Google com fallback hierárquico:
 * 1. profile.name (nome completo)
 * 2. profile.given_name + profile.family_name
 * 3. Nome extraído do email
 * 4. "Usuário" (fallback final)
 */
function getNameFromGoogleProfile(profile: GoogleProfile): string {
	const fullName = profile.name?.trim();
	if (fullName) return fullName;

	const fromGivenFamily = [profile.given_name, profile.family_name]
		.filter(Boolean)
		.join(" ")
		.trim();
	if (fromGivenFamily) return fromGivenFamily;

	const fromEmail = profile.email
		? normalizeNameFromEmail(profile.email)
		: undefined;

	return fromEmail ?? "Usuário";
}

function parseTrustedOriginsEnv(value: string | undefined): string[] {
	if (!value?.trim()) {
		return [];
	}

	return value
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
}

const LOCAL_DEV_PORT = process.env.APP_PORT || "3050";
const DEFAULT_LOCAL_BASE_URL = `http://localhost:${LOCAL_DEV_PORT}`;

function resolveTrustedOrigins(): string[] {
	const baseURL = process.env.BETTER_AUTH_URL || DEFAULT_LOCAL_BASE_URL;
	const origins = new Set<string>([
		baseURL,
		...parseTrustedOriginsEnv(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
	]);

	if (process.env.NODE_ENV === "development") {
		origins.add(`http://localhost:${LOCAL_DEV_PORT}`);
		origins.add(`http://127.0.0.1:${LOCAL_DEV_PORT}`);
	}

	return Array.from(origins);
}

// ============================================================================
// BETTER AUTH INSTANCE
// ============================================================================

export const auth = betterAuth({
	// Base URL configuration
	baseURL: process.env.BETTER_AUTH_URL || DEFAULT_LOCAL_BASE_URL,

	// Trust host configuration for production environments
	trustedOrigins: resolveTrustedOrigins(),

	user: {
		additionalFields: {
			mustChangePassword: {
				type: "boolean",
				defaultValue: false,
				input: false,
			},
		},
	},

	// Vincula Google a contas existentes com o mesmo e-mail (ex.: cadastro por senha)
	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
			requireLocalEmailVerified: false,
		},
	},

	onAPIError: {
		errorURL: `${process.env.BETTER_AUTH_URL || DEFAULT_LOCAL_BASE_URL}/login`,
	},

	// Email/Password authentication
	emailAndPassword: {
		enabled: true,
		autoSignIn: true,
	},

	// Rate limiting
	rateLimit: {
		window: 60,
		max: 100,
		customRules: {
			"/sign-in/email": { window: 60, max: 5 },
			"/sign-up/email": { window: 60, max: 3 },
		},
	},

	// Database adapter (Drizzle + PostgreSQL)
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
		camelCase: true,
	}),

	// Session configuration - Safari compatibility
	session: {
		expiresIn: sessionExpiresInDays * 24 * 60 * 60,
		updateAge: sessionUpdateAgeHours * 60 * 60,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5, // 5 minutes
		},
	},

	// Advanced configuration for Safari compatibility
	advanced: {
		cookieOptions: {
			sameSite: "lax", // Safari compatible
			secure: process.env.NODE_ENV === "production", // HTTPS in production only
			httpOnly: true,
		},
		crossSubDomainCookies: {
			enabled: false, // Disable for better Safari compatibility
		},
	},

	// Plugins
	plugins: [
		passkey({
			rpName: "OpenMonetis",
		}),
	],

	// Google OAuth (se configurado)
	socialProviders:
		googleClientId && googleClientSecret
			? {
					google: {
						clientId: googleClientId,
						clientSecret: googleClientSecret,
						mapProfileToUser: (profile) => ({
							name: getNameFromGoogleProfile(profile),
							email: profile.email,
							image: profile.picture,
							emailVerified: profile.email_verified,
						}),
					},
				}
			: undefined,

	// Database hooks - Executados após eventos do DB
	databaseHooks: {
		user: {
			create: {
				before: async (userData) => {
					if (!isSignupDisabled()) return;

					const email = userData.email?.trim().toLowerCase();
					if (email && (await hasPendingInviteForEmail(email))) {
						return;
					}

					throw new APIError("FORBIDDEN", {
						message: "Novos cadastros estão desativados.",
					});
				},
				after: async (user) => {
					// Se falhar aqui, o usuário já foi criado - considere usar queue para retry
					try {
						await seedDefaultCategoriesForUser(user.id);
						await ensureDefaultPayerForUser({
							id: user.id,
							name: user.name ?? undefined,
							email: user.email ?? undefined,
							image: user.image ?? undefined,
						});
					} catch (error) {
						console.error(
							"[Auth] Falha ao criar dados padrão do usuário:",
							error,
						);
					}
				},
			},
		},
	},
});

// Avisos em desenvolvimento
if (process.env.NODE_ENV === "development") {
	if (!googleClientId) {
		console.warn(
			"[Auth] Google OAuth não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.",
		);
	} else {
		const baseURL = process.env.BETTER_AUTH_URL || DEFAULT_LOCAL_BASE_URL;
		console.info(
			`[Auth] Google OAuth ativo. Redirect URI no Google Cloud Console: ${baseURL}/api/auth/callback/google`,
		);
	}
}
