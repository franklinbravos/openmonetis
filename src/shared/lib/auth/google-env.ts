export function getGoogleClientId(): string | undefined {
	return (
		process.env.GOOGLE_CLIENT_ID?.trim() ||
		process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
		undefined
	);
}

export function getGoogleClientSecret(): string | undefined {
	return process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
}

export function isGoogleOAuthConfigured(): boolean {
	return Boolean(getGoogleClientId() && getGoogleClientSecret());
}
