"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/shared/lib/auth/client";

/**
 * Mantém a sessão Supabase sincronizada entre cliente e servidor.
 * Renova tokens em background e força revalidação do RSC após refresh.
 */
export function SupabaseAuthListener() {
	const router = useRouter();

	useEffect(() => {
		void supabase.auth.getSession().catch(() => {
			// Sessão indisponível (servidor reiniciando ou rede). O listener abaixo reconecta.
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event) => {
			if (
				event === "TOKEN_REFRESHED" ||
				event === "SIGNED_IN" ||
				event === "INITIAL_SESSION"
			) {
				router.refresh();
			}
		});

		return () => subscription.unsubscribe();
	}, [router]);

	return null;
}
