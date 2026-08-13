import { cache } from "react";
import { fetchPayersWithAccess } from "@/shared/lib/payers/access";
import { PAYER_ROLE_ADMIN } from "@/shared/lib/payers/constants";

export type FinancialDataContext = {
	viewerUserId: string;
	dataOwnerUserId: string;
	adminPayerId: string | null;
	isSharedAccess: boolean;
	canEditFinancial: boolean;
	canReadFinancial: boolean;
};

export const resolveFinancialDataContext = cache(
	async (userId: string): Promise<FinancialDataContext> => {
		const payers = await fetchPayersWithAccess(userId);
		const adminPayers = payers.filter(
			(payer) => payer.role === PAYER_ROLE_ADMIN,
		);

		const sharedAdmin = adminPayers.find((payer) => payer.shareId);
		const ownAdmin = adminPayers.find((payer) => !payer.shareId);
		const primaryAdmin = sharedAdmin ?? ownAdmin ?? null;

		if (!primaryAdmin) {
			return {
				viewerUserId: userId,
				dataOwnerUserId: userId,
				adminPayerId: null,
				isSharedAccess: false,
				canEditFinancial: false,
				canReadFinancial: false,
			};
		}

		const dataOwnerUserId = primaryAdmin.userId || userId;

		return {
			viewerUserId: userId,
			dataOwnerUserId,
			adminPayerId: primaryAdmin.id,
			isSharedAccess: Boolean(sharedAdmin),
			canEditFinancial: primaryAdmin.canEdit,
			canReadFinancial: true,
		};
	},
);

export const getFinancialDataOwnerId = cache(async (userId: string) => {
	const context = await resolveFinancialDataContext(userId);
	return context.dataOwnerUserId;
});
