"use client";

import { RiLoader4Line } from "@remixicon/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthCardShell } from "@/features/auth/components/auth-card-shell";
import { AuthErrorAlert } from "@/features/auth/components/auth-error-alert";
import { AuthHeader } from "@/features/auth/components/auth-header";
import { getAuthErrorMessage } from "@/features/auth/lib/auth-error-messages";
import { supabase } from "@/shared/lib/auth/client";
import { getGoogleOAuthCallbackUrl } from "@/shared/lib/auth/google-callback-url";

export function GoogleCallbackHandler() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const started = useRef(false);
	const [error, setError] = useState("");

	useEffect(() => {
		if (started.current) return;
		started.current = true;

		const oauthError = searchParams.get("error");
		if (oauthError) {
			setError(
				getAuthErrorMessage(
					oauthError,
					searchParams.get("error_description"),
				) ?? "Login com Google cancelado.",
			);
			return;
		}

		const code = searchParams.get("code");
		if (!code) {
			setError("Resposta inválida do Google. Tente entrar novamente.");
			return;
		}

		void (async () => {
			try {
				const res = await fetch("/api/auth/google", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						code,
						redirect_uri: getGoogleOAuthCallbackUrl(),
					}),
					credentials: "same-origin",
				});
				const data = (await res.json()) as { error?: string };

				if (!res.ok) {
					setError(
						getAuthErrorMessage(data.error ?? null) ??
							data.error ??
							"Não foi possível entrar com Google.",
					);
					return;
				}

				await supabase.auth.getSession();
				router.refresh();
				router.replace("/dashboard");
			} catch {
				setError("Falha na requisição. Tente novamente mais tarde.");
			}
		})();
	}, [router, searchParams]);

	return (
		<AuthCardShell>
			<AuthHeader
				title={error ? "Não foi possível entrar" : "Conectando com Google"}
				description={
					error
						? "Volte ao login e tente outro método."
						: "Aguarde enquanto validamos sua conta."
				}
			/>
			{error ? (
				<AuthErrorAlert error={error} />
			) : (
				<div className="flex justify-center py-8">
					<RiLoader4Line className="h-8 w-8 animate-spin text-muted-foreground" />
				</div>
			)}
		</AuthCardShell>
	);
}
