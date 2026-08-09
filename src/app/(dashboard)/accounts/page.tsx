import { RiBankLine } from "@remixicon/react";
import { connection } from "next/server";
import { AccountsPage } from "@/features/accounts/components/accounts-page";
import { fetchAllAccountsForUser } from "@/features/accounts/queries";
import PageDescription from "@/shared/components/page-description";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const { activeAccounts, archivedAccounts, logoOptions } =
		await fetchAllAccountsForUser(userId);

	return (
		<main className="flex flex-col items-start gap-6">
			<PageDescription
				icon={<RiBankLine />}
				title="Contas"
				subtitle="Acompanhe todas as contas do mês selecionado incluindo receitas, despesas e transações previstas."
			/>
			<AccountsPage
				accounts={activeAccounts}
				archivedAccounts={archivedAccounts}
				logoOptions={logoOptions}
			/>
		</main>
	);
}
