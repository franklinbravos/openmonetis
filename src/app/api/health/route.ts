import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";

/**
 * Health check endpoint para Docker, monitoring e OpenMonetis Companion
 * GET /api/health
 */
export async function GET() {
	try {
		const supabase = getSupabaseAdmin();
		const { error } = await supabase.rpc("health_check");
		if (error) throw error;

		return NextResponse.json(
			{
				status: "ok",
				name: "OpenMonetis",
				timestamp: new Date().toISOString(),
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error("Health check failed:", error);

		return NextResponse.json(
			{
				status: "error",
				name: "OpenMonetis",
				timestamp: new Date().toISOString(),
				message: "Supabase connection failed",
			},
			{ status: 503 },
		);
	}
}
