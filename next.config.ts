import dotenv from "dotenv";
import type { NextConfig } from "next";

// Carregar variáveis de ambiente explicitamente
dotenv.config();

const nextConfig: NextConfig = {
	output: "standalone",
	cacheComponents: true,
	reactCompiler: true,
	// Expõe Supabase no cliente mesmo quando só SUPABASE_* está no .env
	env: {
		NEXT_PUBLIC_SUPABASE_URL:
			process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
		NEXT_PUBLIC_SUPABASE_ANON_KEY:
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
			process.env.SUPABASE_ANON_KEY ??
			"",
		NEXT_PUBLIC_GOOGLE_CLIENT_ID:
			process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
			process.env.GOOGLE_CLIENT_ID ??
			"",
		NEXT_PUBLIC_APP_URL:
			process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "",
	},
	images: {
		remotePatterns: [
			new URL("https://lh3.googleusercontent.com/**"),
			{ protocol: "https", hostname: "**" },
			{ protocol: "http", hostname: "**" },
		],
	},
	devIndicators: {
		position: "bottom-right",
	},
	experimental: {
		prefetchInlining: true,
		turbopackFileSystemCacheForDev: true,
		optimizePackageImports: ["@remixicon/react"],
		serverActions: {
			bodySizeLimit: "52mb",
		},
		// Reduz o pico de memória do build em servidores com pouca RAM (Coolify).
		cpus: 2,
	},

	// Headers for Safari compatibility
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{
						key: "X-DNS-Prefetch-Control",
						value: "on",
					},
					{
						key: "Strict-Transport-Security",
						value: "max-age=31536000; includeSubDomains",
					},
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "X-Permitted-Cross-Domain-Policies",
						value: "none",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=()",
					},
				],
			},
		];
	},
};

export default nextConfig;
