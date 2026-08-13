import {
	type FinancialDataContext,
	resolveFinancialDataContext,
} from "@/shared/lib/payers/financial-context";

export type FinancialAccessContext = FinancialDataContext;

export class FinancialAccessError extends Error {
	constructor(message = "Você não tem permissão para esta operação.") {
		super(message);
		this.name = "FinancialAccessError";
	}
}

export async function resolveFinancialAccessContext(
	viewerUserId: string,
): Promise<FinancialAccessContext> {
	return resolveFinancialDataContext(viewerUserId);
}

export async function assertFinancialReadAccess(
	viewerUserId: string,
): Promise<FinancialAccessContext> {
	const context = await resolveFinancialDataContext(viewerUserId);
	if (!context.canReadFinancial && !context.adminPayerId) {
		throw new FinancialAccessError("Ambiente financeiro não configurado.");
	}
	return context;
}

export async function assertFinancialEditAccess(
	viewerUserId: string,
): Promise<FinancialAccessContext> {
	const context = await resolveFinancialDataContext(viewerUserId);
	if (!context.canEditFinancial) {
		throw new FinancialAccessError();
	}
	return context;
}
