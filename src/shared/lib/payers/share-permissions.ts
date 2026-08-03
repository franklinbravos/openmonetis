import {
	type PayerSharePermission,
	payerSharePermissionCanEdit,
	payerSharePermissionCanManageShares,
	resolvePayerSharePermission,
} from "@/shared/lib/payers/constants";

export type PayerAccessFlags = {
	permission: PayerSharePermission | null;
	isOwner: boolean;
	canEdit: boolean;
	canManageShares: boolean;
};

export function resolveOwnerAccess(): PayerAccessFlags {
	return {
		permission: null,
		isOwner: true,
		canEdit: true,
		canManageShares: true,
	};
}

export function resolveSharedAccess(
	permissionRaw: string | null | undefined,
): PayerAccessFlags {
	const permission = resolvePayerSharePermission(permissionRaw);

	return {
		permission,
		isOwner: false,
		canEdit: payerSharePermissionCanEdit(permission),
		canManageShares: payerSharePermissionCanManageShares(permission),
	};
}
