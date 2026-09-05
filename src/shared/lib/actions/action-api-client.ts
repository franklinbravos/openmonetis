import type { ActionResult } from "@/shared/lib/types/actions";

export function getApiOrigin() {
	if (typeof window === "undefined") {
		return "";
	}

	return window.location.origin;
}

export function jsonRequestBody(input: unknown): Pick<RequestInit, "headers" | "body"> {
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	};
}

export async function fetchActionResult<T = void>(
	path: string,
	init?: RequestInit,
	fallbackMessage = "Algo deu errado.",
): Promise<ActionResult<T>> {
	const response = await fetch(`${getApiOrigin()}${path}`, {
		credentials: "include",
		...init,
	});

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error(fallbackMessage);
	}

	return (await response.json()) as ActionResult<T>;
}

export async function fetchJsonData<T>(
	path: string,
	init?: RequestInit,
	fallbackMessage = "Algo deu errado.",
): Promise<T> {
	const response = await fetch(`${getApiOrigin()}${path}`, {
		credentials: "include",
		...init,
	});

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("application/json")) {
		throw new Error(fallbackMessage);
	}

	if (!response.ok) {
		const payload = (await response.json()) as { error?: string };
		throw new Error(payload.error ?? fallbackMessage);
	}

	return (await response.json()) as T;
}
