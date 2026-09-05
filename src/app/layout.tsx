import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import {
	ChunkLoadRecovery,
	chunkLoadRecoveryScript,
} from "@/shared/components/chunk-load-recovery";
import { QueryProvider } from "@/shared/components/providers/query-provider";
import { SupabaseAuthListener } from "@/shared/components/providers/supabase-auth-listener";
import { ThemeProvider } from "@/shared/components/providers/theme-provider";
import { Toaster } from "@/shared/components/ui/sonner";
import "./globals.css";
import { mono, sans, signatureFont } from "@/public/fonts/font_index";

export const metadata: Metadata = {
	title: {
		default: "OpenMonetis | Suas finanças, do seu jeito",
		template: "OpenMonetis | %s",
	},
	description:
		"Controle suas finanças pessoais de forma simples e transparente.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			data-scroll-behavior="smooth"
			lang="pt-BR"
			className={`${sans.variable} ${mono.variable} ${signatureFont.variable} ${sans.className}`}
			suppressHydrationWarning
		>
			<head>
				<meta name="apple-mobile-web-app-title" content="OpenMonetis" />
				{process.env.UMAMI_URL && process.env.UMAMI_WEBSITE_ID && (
					<script
						defer
						src={`${process.env.UMAMI_URL}/script.js`}
						data-website-id={process.env.UMAMI_WEBSITE_ID}
						{...(process.env.UMAMI_DOMAINS
							? { "data-domains": process.env.UMAMI_DOMAINS }
							: {})}
					/>
				)}
			</head>
			<body className="antialiased" suppressHydrationWarning>
				<Script
					id="chunk-load-recovery"
					strategy="beforeInteractive"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: script fixo de recuperação de chunk
					dangerouslySetInnerHTML={{ __html: chunkLoadRecoveryScript }}
				/>
				<ChunkLoadRecovery />
				<ThemeProvider attribute="class" defaultTheme="light">
					<QueryProvider>
						<SupabaseAuthListener />
						<Suspense>{children}</Suspense>
						<Toaster position="top-right" />
					</QueryProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
