"use client";
import { RiLoader4Line } from "@remixicon/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { getAuthErrorMessage } from "@/features/auth/lib/auth-error-messages";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldSeparator,
} from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { authClient, googleSignInAvailable } from "@/shared/lib/auth/client";
import { preloadGoogleSignIn } from "@/shared/lib/auth/google-sign-in";
import { cn } from "@/shared/utils/ui";
import { AuthCardShell } from "./auth-card-shell";
import { AuthErrorAlert } from "./auth-error-alert";
import { AuthHeader } from "./auth-header";
import { GoogleAuthButton } from "./google-auth-button";
import { GoogleOAuthSetupHint } from "./google-oauth-setup-hint";

type DivProps = React.ComponentProps<"div">;

interface LoginFormProps extends DivProps {
	signupDisabled?: boolean;
}

const authLinkClassName =
	"font-medium text-foreground/88 underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/30 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function LoginForm({
	className,
	signupDisabled = false,
	...props
}: LoginFormProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const isGoogleAvailable = googleSignInAvailable;

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [rememberMe, setRememberMe] = useState(true);

	useEffect(() => {
		const stored = localStorage.getItem("openmonetis-remember-me");
		if (stored !== null) {
			setRememberMe(stored === "true");
		}
	}, []);

	const [error, setError] = useState("");
	const [loadingEmail, setLoadingEmail] = useState(false);
	const [loadingGoogle, setLoadingGoogle] = useState(false);

	useEffect(() => {
		preloadGoogleSignIn();
	}, []);

	useEffect(() => {
		const oauthError = getAuthErrorMessage(
			searchParams.get("error"),
			searchParams.get("error_description"),
		);
		if (!oauthError) return;

		setError(oauthError);
		router.replace("/login", { scroll: false });
	}, [router, searchParams]);

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();

		await authClient.signIn.email(
			{
				email,
				password,
			},
			{
				onRequest: () => {
					setError("");
					setLoadingEmail(true);
				},
				onSuccess: () => {
					localStorage.setItem("openmonetis-remember-me", String(rememberMe));
					setLoadingEmail(false);
					toast.success("Login realizado com sucesso!");
					router.refresh();
					router.replace("/dashboard");
				},
				onError: (ctx) => {
					if (
						ctx.error.status === 500 &&
						ctx.error.statusText === "Internal Server Error"
					) {
						toast.error(
							"Ocorreu uma falha na requisição. Tente novamente mais tarde.",
						);
					}

					setError(getAuthErrorMessage(ctx.error.message) ?? ctx.error.message);
					setLoadingEmail(false);
				},
			},
		);
	}

	async function handleGoogle() {
		if (!isGoogleAvailable) {
			setError("Login com Google não está disponível no momento.");
			return;
		}

		// Ativa loading antes de iniciar o fluxo OAuth
		setError("");
		setLoadingGoogle(true);

		// OAuth redirect - o loading permanece até a página ser redirecionada
		await authClient.signIn.social(
			{
				provider: "google",
				callbackURL: "/dashboard",
			},
			{
				onSuccess: () => {
					setLoadingGoogle(false);
					toast.success("Login realizado com sucesso!");
					router.refresh();
					router.replace("/dashboard");
				},
				onError: (ctx) => {
					setError(getAuthErrorMessage(ctx.error.message) ?? ctx.error.message);
					setLoadingGoogle(false);
				},
			},
		);
	}

	return (
		<div className={cn("flex flex-col gap-5", className)} {...props}>
			<AuthCardShell>
				<form
					className="flex w-full items-center px-6 py-7 md:px-10 md:py-9"
					onSubmit={handleSubmit}
					noValidate
				>
					<FieldGroup className="mx-auto w-full max-w-md gap-5">
						<AuthHeader
							title="Entrar no OpenMonetis"
							description="Acesse sua conta para acompanhar cartões, lançamentos e metas em um só lugar."
						/>

						<AuthErrorAlert error={error} />

						{isGoogleAvailable ? <GoogleOAuthSetupHint /> : null}

						<Field>
							<FieldLabel htmlFor="email">E-mail</FieldLabel>
							<Input
								id="email"
								type="email"
								placeholder="Digite seu e-mail"
								autoComplete="username webauthn"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								aria-invalid={!!error}
							/>
						</Field>

						<Field>
							<div className="flex items-center">
								<FieldLabel htmlFor="password">Senha</FieldLabel>
							</div>
							<Input
								id="password"
								type="password"
								required
								placeholder="Digite sua senha"
								autoComplete="current-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								aria-invalid={!!error}
							/>
						</Field>

						<div className="flex items-start gap-3">
							<Checkbox
								id="remember-me"
								checked={rememberMe}
								onCheckedChange={(checked) => setRememberMe(checked === true)}
								disabled={loadingEmail || loadingGoogle}
								className="mt-0.5"
							/>
							<div className="grid gap-1">
								<FieldLabel
									htmlFor="remember-me"
									className="cursor-pointer font-medium"
								>
									Manter conectado neste dispositivo
								</FieldLabel>
							</div>
						</div>

						<Field>
							<Button
								type="submit"
								disabled={loadingEmail || loadingGoogle}
								className="w-full"
							>
								{loadingEmail ? (
									<RiLoader4Line className="h-4 w-4 animate-spin" />
								) : (
									"Entrar"
								)}
							</Button>
						</Field>

						<FieldSeparator className="my-1.5 *:data-[slot=field-separator-content]:bg-card">
							Ou continue com
						</FieldSeparator>

						<Field>
							<GoogleAuthButton
								onClick={handleGoogle}
								loading={loadingGoogle}
								disabled={loadingEmail || loadingGoogle || !isGoogleAvailable}
								text="Google"
							/>
						</Field>

						{!signupDisabled && (
							<FieldDescription className="pt-1 text-center">
								Não tem uma conta?{" "}
								<a href="/signup" className={authLinkClassName}>
									Inscreva-se
								</a>
							</FieldDescription>
						)}

						<FieldDescription className="text-center text-sm text-muted-foreground">
							<a href="/" className={authLinkClassName}>
								Voltar para a página inicial
							</a>
						</FieldDescription>
					</FieldGroup>
				</form>
			</AuthCardShell>
		</div>
	);
}
