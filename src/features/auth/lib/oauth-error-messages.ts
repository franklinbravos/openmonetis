const OAUTH_ERROR_MESSAGES: Record<string, string> = {
	account_not_linked:
		"Não foi possível vincular sua conta Google. Tente entrar com e-mail e senha ou entre em contato com o administrador.",
	unable_to_link_account:
		"Não foi possível vincular a conta. Tente novamente ou use outro método de login.",
	signup_disabled: "Novos cadastros estão desativados no momento.",
};

export function getOAuthErrorMessage(
	errorCode: string | null,
	description?: string | null,
): string | null {
	if (!errorCode) return null;

	return (
		OAUTH_ERROR_MESSAGES[errorCode] ??
		description ??
		"Não foi possível concluir o login. Tente novamente."
	);
}
