"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { getGoogleOAuthConsoleSetup } from "@/shared/lib/auth/google-callback-url";
import { getAppOrigin, normalizeOAuthOrigin } from "@/shared/lib/app-url";

export function GoogleOAuthSetupHint() {
	const [hint, setHint] = useState<string | null>(null);

	useEffect(() => {
		if (process.env.NODE_ENV !== "development") return;

		const browserOrigin = window.location.origin;
		const canonicalOrigin = normalizeOAuthOrigin(browserOrigin);
		const appOrigin = getAppOrigin();
		const { javascriptOrigin, redirectUri } = getGoogleOAuthConsoleSetup();
		const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
		const clientSuffix = clientId?.slice(-12);

		if (browserOrigin !== canonicalOrigin) {
			setHint(
				`Abra o app em ${canonicalOrigin} (não em ${browserOrigin}) para o login Google funcionar.`,
			);
			return;
		}

		setHint(
			`Google OAuth (dev): no cliente Web cujo ID termina em …${clientSuffix}, cadastre Origem JavaScript ${javascriptOrigin} e Redirect URI ${redirectUri}.`,
		);
	}, []);

	if (!hint) return null;

	return (
		<Alert className="border-dashed">
			<AlertDescription className="text-xs leading-relaxed text-muted-foreground">
				{hint}
			</AlertDescription>
		</Alert>
	);
}
