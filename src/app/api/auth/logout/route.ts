import { NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";

export async function POST() {
	try {
		const supabase = await createClient();
		await supabase.auth.signOut();
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("Logout route failed:", error);
		return NextResponse.json({ error: "Algo deu errado." }, { status: 500 });
	}
}
