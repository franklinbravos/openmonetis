export function canManageFamilyTransaction(
	item: { userId: string },
	financialDataOwnerId: string,
	canEditFinancial: boolean,
): boolean {
	return canEditFinancial && item.userId === financialDataOwnerId;
}
