import { RiBankCard2Line } from "@remixicon/react";
import { connection } from "next/server";
import { CardsPage } from "@/features/cards/components/cards-page";
import { fetchAllCardsForUser } from "@/features/cards/queries";
import PageDescription from "@/shared/components/page-description";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const {
		activeCards,
		archivedCards,
		accounts,
		logoOptions,
		currentInvoicePeriod,
	} = await fetchAllCardsForUser(userId);

	return (
		<main className="flex flex-col gap-6">
			<PageDescription
				icon={<RiBankCard2Line />}
				title="Cartões"
				subtitle="Acompanhe todos os cartões do mês selecionado incluindo faturas, limites e transações previstas."
			/>
			<CardsPage
				cards={activeCards}
				archivedCards={archivedCards}
				accounts={accounts}
				logoOptions={logoOptions}
				currentInvoicePeriod={currentInvoicePeriod}
			/>
		</main>
	);
}
