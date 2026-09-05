import { NextResponse } from "next/server";
import {
	removeEstablishmentLogoAction,
	saveEstablishmentLogoAction,
} from "@/shared/lib/logo/establishment-logo-actions";
import {
	requireAuthSession,
	runActionJson,
} from "@/shared/lib/actions/action-route-handler";

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const body = (await request.json()) as { name?: string; domain?: string };
	if (!body.name || !body.domain) {
		return NextResponse.json(
			{ success: false, error: "Dados inválidos." },
			{ status: 400 },
		);
	}

	return runActionJson(() =>
		saveEstablishmentLogoAction(body.name as string, body.domain as string),
	);
}

export async function DELETE(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const name = new URL(request.url).searchParams.get("name")?.trim();
	if (!name) {
		return NextResponse.json(
			{ success: false, error: "Nome inválido." },
			{ status: 400 },
		);
	}

	return runActionJson(() => removeEstablishmentLogoAction(name));
}
