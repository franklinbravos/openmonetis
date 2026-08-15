import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";
import { safeToNumber } from "@/shared/utils/number";

export type RpcParams = Record<string, unknown>;

function assertRpcParams(
	functionName: string,
	params?: RpcParams,
): RpcParams | undefined {
	if (!params) return params;

	const normalized: RpcParams = { ...params };

	for (const [key, value] of Object.entries(normalized)) {
		if (value === undefined) {
			throw new Error(
				`Parâmetro RPC "${key}" indefinido em ${functionName}. Verifique o contexto financeiro (dataOwnerUserId).`,
			);
		}

		// Evita 22P02 em casts ::uuid quando o cliente envia string vazia.
		if (value === "" && key.endsWith("_id")) {
			normalized[key] = null;
		}
	}

	return normalized;
}

export async function callRpc<TRow extends Record<string, unknown>>(
	functionName: string,
	params?: RpcParams,
): Promise<TRow[]> {
	const supabase = getSupabaseAdmin();
	const rpcParams = assertRpcParams(functionName, params);
	const { data, error } = await supabase.rpc(
		functionName as never,
		rpcParams as never,
	);

	if (error) {
		console.error(`[rpc] ${functionName} falhou`, error);
		const message =
			typeof error === "string"
				? error
				: error &&
						typeof error === "object" &&
						"message" in error &&
						typeof (error as { message: unknown }).message === "string"
					? (error as { message: string }).message
					: `Falha ao executar ${functionName}`;
		const code =
			error &&
			typeof error === "object" &&
			"code" in error &&
			typeof (error as { code: unknown }).code === "string"
				? (error as { code: string }).code
				: null;
		throw new Error(code ? `[${code}] ${message}` : message);
	}

	return (data as TRow[] | null) ?? [];
}

export async function callRpcOne<TRow extends Record<string, unknown>>(
	functionName: string,
	params?: RpcParams,
): Promise<TRow | null> {
	const rows = await callRpc<TRow>(functionName, params);
	return rows[0] ?? null;
}

export function snakeToCamel(
	record: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(record)) {
		if (!key.includes("_")) {
			result[key] = value;
			continue;
		}

		const [head, ...rest] = key.split("_");
		const camelKey =
			head.toLowerCase() +
			rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
		result[camelKey] = value;
	}
	return result;
}

export function toRpcNumber(value: unknown, fallback: number = 0): number {
	return safeToNumber(value, fallback);
}
