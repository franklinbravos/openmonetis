"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/shared/lib/auth/client";

/**
 * Mantém o cliente Supabase ativo para renovação de token no browser.
 *
 * Não chama router.refresh() aqui: o proxy já renova cookies em cada request e
 * refresh concorrente com RSC/server actions gera "unexpected response" no Next 16.
 * Login, logout e mutations fazem refresh explícito onde precisam.
 */
export function SupabaseAuthListener() {
	const router = useRouter();

	useEffect(() => {
		void supabase.auth.getSession().catch(() => {
			// Sessão indisponível (servidor reiniciando ou rede).
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event) => {
			if (event === "SIGNED_OUT") {
				// Logout em outra aba: atualiza RSC depois que o evento de auth termina.
				queueMicrotask(() => {
					router.refresh();
				});
			}
		});

		return () => subscription.unsubscribe();
	}, [router]);

	return null;
}
