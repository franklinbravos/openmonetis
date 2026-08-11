import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";
import { safeToNumber } from "@/shared/utils/number";

export type RpcParams = Record<string, unknown>;

export async function callRpc<TRow extends Record<string, unknown>>(
	functionName: string,
	params?: RpcParams,
): Promise<TRow[]> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase.rpc(
		functionName as never,
		params as never,
	);

	if (error) {
		console.error(`[rpc] ${functionName} falhou`, error);
		if (typeof error === "string") {
			throw new Error(error);
		}
		throw error;
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
