export const PAYER_STATUS_OPTIONS = ["Ativo", "Inativo"] as const;

export type PayerStatus = (typeof PAYER_STATUS_OPTIONS)[number];

export const PAYER_ROLE_ADMIN = "admin";
export const PAYER_ROLE_THIRD_PARTY = "terceiro";
export const DEFAULT_PAYER_AVATAR = "default_icon.png";

export const PAYER_SHARE_PERMISSIONS = ["read", "edit", "admin"] as const;
export type PayerSharePermission = (typeof PAYER_SHARE_PERMISSIONS)[number];

export const PAYER_SHARE_PERMISSION_LABELS: Record<
	PayerSharePermission,
	string
> = {
	read: "Somente visualização",
	edit: "Edição",
	admin: "Admin (acesso completo)",
};

export function resolvePayerSharePermission(
	value: string | null | undefined,
): PayerSharePermission {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "edit" || normalized === "admin") return normalized;
	return "read";
}

export function payerSharePermissionCanEdit(
	permission: PayerSharePermission,
): boolean {
	return permission === "edit" || permission === "admin";
}

export function payerSharePermissionCanManageShares(
	permission: PayerSharePermission,
): boolean {
	return permission === "admin";
}
