import type { AIProvider } from "@/features/insights/constants";
import { PROVIDERS } from "@/features/insights/constants";

export function getAiProviderSettingsLabel(provider: AIProvider): string {
	return PROVIDERS[provider]?.name ?? provider;
}

/** Mensagem padrão quando o provedor não tem chave utilizável. */
export function getAiProviderNotConfiguredMessage(
	provider: AIProvider,
): string {
	return `${getAiProviderSettingsLabel(provider)} não configurado. Defina a chave em Ajustes → Inteligência artificial.`;
}

/** Quando há chave criptografada no banco, mas o APP_SECRET atual não consegue abri-la. */
export const AI_STORED_KEY_UNREADABLE_MESSAGE =
	"A chave salva no banco não pôde ser lida. Salve-a novamente em Ajustes → Inteligência artificial (mantenha o APP_SECRET estável no servidor).";

/** Quando há chave criptografada no banco, mas o APP_SECRET não está definido no servidor. */
export const AI_STORED_KEY_MISSING_APP_SECRET_MESSAGE =
	"O servidor não tem o APP_SECRET definido, então a chave salva no banco não pôde ser lida. Defina o APP_SECRET (igual ao de quando a chave foi salva) e salve a chave novamente em Ajustes → Inteligência artificial.";
