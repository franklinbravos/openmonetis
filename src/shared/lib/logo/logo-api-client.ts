import { fetchActionResult } from "@/shared/lib/actions/action-api-client";

export async function saveEstablishmentLogoClient(name: string, domain: string) {
	return fetchActionResult("/api/logo/establishment", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name, domain }),
	});
}

export async function removeEstablishmentLogoClient(name: string) {
	return fetchActionResult(
		`/api/logo/establishment?name=${encodeURIComponent(name)}`,
		{
			method: "DELETE",
		},
	);
}
