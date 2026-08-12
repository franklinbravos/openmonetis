/**
 * Erro de negócio com mensagem acionável para o usuário.
 *
 * Deve ser usado em Server Actions para erros cuja mensagem pode e deve ser
 * exibida ao usuário final (ex.: "Crie uma pessoa admin antes de definir um
 * saldo inicial."). Erros técnicos continuam sendo lançados como `Error`
 * comum e são convertidos em mensagem genérica pelo `handleActionError`.
 */
export class ActionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ActionError";
	}
}
