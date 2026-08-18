import { RiArrowLeftRightLine } from "@remixicon/react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { fetchAllAccountsForUser } from "@/features/accounts/queries";
import { fetchUserPreferences } from "@/features/settings/queries";
import { TransactionsPage } from "@/features/transactions/components/page/transactions-page";
import { TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID } from "@/features/transactions/lib/month-toolbar";
import { ensureOpenRecurrenceInstancesForPeriod } from "@/features/transactions/lib/open-recurrence";
import {
	buildOptionSets,
	buildSluggedFilters,
	buildSlugMaps,
	buildTransactionWhere,
	extractTransactionSearchFilters,
	getSingleParam,
	mapTransactionsData,
	type ResolvedSearchParams,
	resolveTransactionPagination,
} from "@/features/transactions/lib/page-helpers";
import {
	fetchRecentEstablishments,
	fetchTransactionFilterSources,
	fetchTransactionsMonthSummaries,
	fetchTransactionsPage,
} from "@/features/transactions/queries";
import { LogoPrefetchProvider } from "@/shared/components/entity-avatar";
import { MonthToolbarSlotProvider } from "@/shared/components/month-picker/month-toolbar-slot-context";
import { StatementPeriodNavigation } from "@/shared/components/month-picker/statement-period-navigation";
import PageDescription from "@/shared/components/page-description";
import { Card } from "@/shared/components/ui/card";
import { getUserId } from "@/shared/lib/auth/server";
import { prefetchLogoMappings } from "@/shared/lib/logo/prefetch-server";
import { resolveFinancialDataContext } from "@/shared/lib/payers/financial-context";
import { parsePeriodParam } from "@/shared/utils/period";

type PageSearchParams = Promise<ResolvedSearchParams>;

type PageProps = {
	searchParams?: PageSearchParams;
};

export const metadata: Metadata = {
	title: "Lançamentos",
};

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const userId = await getUserId();
	const financialContext = await resolveFinancialDataContext(userId);
	const dataOwnerUserId = financialContext.dataOwnerUserId;
	const resolvedSearchParams = searchParams ? await searchParams : undefined;

	const periodoParamRaw = getSingleParam(resolvedSearchParams, "periodo");
	const { period: selectedPeriod } = parsePeriodParam(periodoParamRaw);

	const searchFilters = extractTransactionSearchFilters(resolvedSearchParams);
	const pagination = resolveTransactionPagination(resolvedSearchParams);

	const [filterSources, userPreferences, { activeAccounts }] =
		await Promise.all([
			fetchTransactionFilterSources(userId),
			fetchUserPreferences(userId),
			fetchAllAccountsForUser(userId),
		]);

	const sluggedFilters = buildSluggedFilters(filterSources);
	const slugMaps = buildSlugMaps(sluggedFilters);

	const filters = await buildTransactionWhere({
		userId,
		period: selectedPeriod,
		filters: searchFilters,
		slugMaps,
		hideAnticipatedInstallments:
			userPreferences?.hideAnticipatedInstallments ?? false,
	});

	const [transactionsPage, estabelecimentos, monthSummaries] =
		await Promise.all([
			ensureOpenRecurrenceInstancesForPeriod(
				dataOwnerUserId,
				selectedPeriod,
			).then(() => fetchTransactionsPage(filters, pagination)),
			fetchRecentEstablishments(dataOwnerUserId),
			fetchTransactionsMonthSummaries(userId),
		]);
	const transactionData = mapTransactionsData(
		transactionsPage.rows,
		filterSources.categoryRows,
	);

	const {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
		payerFilterOptions,
		categoryFilterOptions,
		accountCardFilterOptions,
	} = buildOptionSets({
		...sluggedFilters,
		payerRows: filterSources.payerRows,
	});

	const logoMappings = await prefetchLogoMappings(
		userId,
		transactionData.map((t) => t.name),
	);

	return (
		<main className="flex flex-col gap-3 md:gap-6">
			<PageDescription
				icon={<RiArrowLeftRightLine />}
				title="Lançamentos"
				subtitle="Acompanhe todos os lançamentos financeiros do mês selecionado incluindo receitas, despesas e transações previstas."
			/>

			<StatementPeriodNavigation
				title="Resumo mensal"
				sticky={false}
				showCalendarControls
				carouselVariant="account"
				months={monthSummaries}
			/>

			<MonthToolbarSlotProvider>
				<Card className="gap-0 overflow-hidden py-0">
					<StatementPeriodNavigation
						embedded
						hideCarousel
						toolbarSlotId={TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID}
					/>

					<LogoPrefetchProvider mappings={logoMappings}>
						<TransactionsPage
							embeddedInToolbarCard
							financialDataOwnerId={dataOwnerUserId}
							canEditFinancial={financialContext.canEditFinancial}
							transactions={transactionData}
							payerOptions={payerOptions}
							splitPayerOptions={splitPayerOptions}
							defaultPayerId={defaultPayerId}
							accountOptions={accountOptions}
							cardOptions={cardOptions}
							categoryOptions={categoryOptions}
							payerFilterOptions={payerFilterOptions}
							categoryFilterOptions={categoryFilterOptions}
							accountCardFilterOptions={accountCardFilterOptions}
							selectedPeriod={selectedPeriod}
							estabelecimentos={estabelecimentos}
							pagination={{
								page: transactionsPage.page,
								pageSize: transactionsPage.pageSize,
								totalItems: transactionsPage.totalItems,
								totalPages: transactionsPage.totalPages,
							}}
							exportContext={{
								source: "transactions",
								period: selectedPeriod,
								filters: searchFilters,
							}}
							noteAsColumn={userPreferences?.statementNoteAsColumn ?? false}
							columnOrder={userPreferences?.transactionsColumnOrder ?? null}
							groupTransactionsByDate={
								userPreferences?.groupTransactionsByDate ?? true
							}
							attachmentMaxSizeMb={userPreferences?.attachmentMaxSizeMb ?? 50}
							transferAccounts={activeAccounts}
						/>
					</LogoPrefetchProvider>
				</Card>
			</MonthToolbarSlotProvider>
		</main>
	);
}
