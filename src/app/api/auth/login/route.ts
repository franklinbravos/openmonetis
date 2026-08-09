import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/shared/lib/supabase/server";

const bodySchema = z.object({
	email: z.string().email("E-mail inválido."),
	password: z.string().min(1, "Senha obrigatória."),
});

export async function POST(request: Request) {
	try {
		const { email, password } = bodySchema.parse(await request.json());
		const supabase = await createClient();
		const { error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});

		if (error) {
			return NextResponse.json({ error: error.message }, { status: 401 });
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return NextResponse.json(
				{ error: error.issues[0]?.message ?? "Dados inválidos." },
				{ status: 400 },
			);
		}
		console.error("Login route failed:", error);
		return NextResponse.json({ error: "Algo deu errado." }, { status: 500 });
	}
}
