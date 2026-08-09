import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/shared/lib/supabase/database.types";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/shared/lib/supabase/env";

type CookieToSet = {
	name: string;
	value: string;
	options: CookieOptions;
};

export async function createClient() {
	const cookieStore = await cookies();

	return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet: CookieToSet[]) {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, options);
					}
				} catch {
					// Server Component — cookies são definidos no proxy/callback.
				}
			},
		},
	});
}
