const AUTH_ERROR_MESSAGES: Record<string, string> = {
	"Invalid login credentials":
		"E-mail ou senha incorretos. Se você usava o OpenMonetis antes da migração para Supabase, crie uma nova conta em Inscreva-se — as senhas antigas não foram transferidas.",
	"Email not confirmed":
		"Confirme seu e-mail antes de entrar. Verifique a caixa de entrada (e o spam).",
	"User already registered":
		"Este e-mail já está cadastrado. Tente entrar ou use outro e-mail.",
	"Signup requires a valid password":
		"A senha não atende aos requisitos mínimos do Supabase.",
	invalid_client:
		"Client ID do Google inválido ou origem não autorizada. Verifique GOOGLE_CLIENT_ID no .env e cadastre a URL do app em Origens JavaScript autorizadas no Google Cloud Console.",
	account_not_linked:
		"Não foi possível vincular sua conta Google. Tente entrar com e-mail e senha ou entre em contato com o administrador.",
	unable_to_link_account:
		"Não foi possível vincular a conta. Tente novamente ou use outro método de login.",
	signup_disabled: "Novos cadastros estão desativados no momento.",
	oauth_callback_failed:
		"Não foi possível concluir o login com Google. Tente novamente.",
	popup_blocked_by_browser:
		"O navegador bloqueou o popup do Google. O login será feito por redirecionamento — se não abrir, use Chrome ou Safari em http://localhost:3050.",
	redirect_uri_mismatch:
		"URI de redirecionamento não autorizada no Google. Em Google Cloud Console → Credentials, cadastre http://localhost:3050/auth/google/callback e abra o app em http://localhost:3050 (não use 127.0.0.1, IP da rede nem preview embutido).",
};

export function getAuthErrorMessage(
	errorCodeOrMessage: string | null,
	description?: string | null,
): string | null {
	if (!errorCodeOrMessage) return null;

	return (
		AUTH_ERROR_MESSAGES[errorCodeOrMessage] ?? description ?? errorCodeOrMessage
	);
}

/** @deprecated use getAuthErrorMessage */
export function getOAuthErrorMessage(
	errorCode: string | null,
	description?: string | null,
): string | null {
	return getAuthErrorMessage(errorCode, description);
}
