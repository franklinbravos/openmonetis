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
