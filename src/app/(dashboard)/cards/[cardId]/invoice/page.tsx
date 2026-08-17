import { RiPencilLine } from "@remixicon/react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { FinancialAccount } from "@/db/schema";
import { CardDialog } from "@/features/cards/components/card-dialog";
import type { Card as CreditCard } from "@/features/cards/components/types";
import { CardInvoiceContextHeader } from "@/features/invoices/components/card-invoice-context-header";
import { CardInvoiceNavigationShell } from "@/features/invoices/components/card-invoice-navigation-shell";
import { InvoiceSummaryCard } from "@/features/invoices/components/invoice-summary-card";
import { fetchInvoiceReconciliation } from "@/features/invoices/lib/invoice-reconciliation";
import {
	fetchCardData,
	fetchCardInvoiceMonthSummaries,
	fetchCardTransactions,
	fetchInvoiceData,
} from "@/features/invoices/queries";
import { fetchUserPreferences } from "@/features/settings/queries";
import { TransactionsPage as LancamentosSection } from "@/features/transactions/components/page/transactions-page";
import { TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID } from "@/features/transactions/lib/month-toolbar";
import {
	buildOptionSets,
	buildSluggedFilters,
	buildSlugMaps,
	buildTransactionWhere,
	extractTransactionSearchFilters,
	getSingleParam,
	mapTransactionsData,
	type ResolvedSearchParams,
} from "@/features/transactions/lib/page-helpers";
import {
	fetchRecentEstablishments,
	fetchTransactionFilterSources,
} from "@/features/transactions/queries";
import { fetchImportBatchHistory } from "@/features/transactions/queries/import-batch-history";
import { StatementPeriodNavigation } from "@/shared/components/month-picker/statement-period-navigation";
import { MonthToolbarSlotProvider } from "@/shared/components/month-picker/month-toolbar-slot-context";
import { PageBreadcrumb } from "@/shared/components/navigation/page-breadcrumb";
import { Button } from "@/shared/components/ui/button";
import { Card as UiCard } from "@/shared/components/ui/card";
import { getUserId } from "@/shared/lib/auth/server";
import { resolveFinancialDataContext } from "@/shared/lib/payers/financial-context";
import {
	CARD_IMPORT_PDF_PASSWORD_RULES,
	isCardImportPdfPasswordRule,
} from "@/shared/lib/cards/import-pdf-password";
import { loadLogoOptions } from "@/shared/lib/logo/options";
import { parsePeriodParam } from "@/shared/utils/period";

type PageSearchParams = Promise<ResolvedSearchParams>;

type PageProps = {
	params: Promise<{ cardId: string }>;
	searchParams?: PageSearchParams;
};

export default async function Page({ params, searchParams }: PageProps) {
	await connection();
	const { cardId } = await params;
	const userId = await getUserId();
	const financialContext = await resolveFinancialDataContext(userId);
	const resolvedSearchParams = searchParams ? await searchParams : undefined;

	const periodoParamRaw = getSingleParam(resolvedSearchParams, "periodo");
	const {
		period: selectedPeriod,
		monthName,
		year,
	} = parsePeriodParam(periodoParamRaw);

	const searchFilters = extractTransactionSearchFilters(resolvedSearchParams);

	const card = await fetchCardData(userId, cardId);

	if (!card) {
		notFound();
	}

	const [
		filterSources,
		logoOptions,
		invoiceData,
		invoiceReconciliation,
		estabelecimentos,
		userPreferences,
		importHistory,
		invoiceMonthSummaries,
	] = await Promise.all([
		fetchTransactionFilterSources(userId),
		loadLogoOptions(),
		fetchInvoiceData(userId, cardId, selectedPeriod),
		fetchInvoiceReconciliation(userId, cardId, selectedPeriod),
		fetchRecentEstablishments(userId),
		fetchUserPreferences(userId),
		fetchImportBatchHistory({
			userId,
			cardId,
			invoicePeriod: selectedPeriod,
			limit: 1,
		}),
		fetchCardInvoiceMonthSummaries(
			userId,
			cardId,
			String(card.closingDay),
			String(card.dueDay),
		),
	]);
	const sluggedFilters = buildSluggedFilters(filterSources);
	const slugMaps = buildSlugMaps(sluggedFilters);

	const filters = await buildTransactionWhere({
		userId,
		period: selectedPeriod,
		filters: searchFilters,
		slugMaps,
		cardId: card.id,
		hideAnticipatedInstallments:
			userPreferences?.hideAnticipatedInstallments ?? false,
	});

	const transactionRows = await fetchCardTransactions(filters);

	const transactionData = mapTransactionsData(
		transactionRows,
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
		limitCartaoId: card.id,
	});

	const cardDialogAccounts = filterSources.accountRows.map(
		(financialAccount: FinancialAccount) => ({
			id: financialAccount.id,
			name: financialAccount.name ?? "Conta",
			logo: financialAccount.logo ?? null,
		}),
	);

	const accountName =
		filterSources.accountRows.find(
			(financialAccount: FinancialAccount) =>
				financialAccount.id === card.accountId,
		)?.name ?? "Conta";

	const limitAmount = Number(card.limit);

	const importPdfPasswordRule = isCardImportPdfPasswordRule(
		card.importPdfPasswordRule,
	)
		? card.importPdfPasswordRule
		: CARD_IMPORT_PDF_PASSWORD_RULES.none;

	const cardDialogData: CreditCard = {
		id: card.id,
		name: card.name,
		brand: card.brand ?? "",
		status: card.status ?? "",
		closingDay: card.closingDay,
		dueDay: card.dueDay,
		note: card.note ?? null,
		logo: card.logo,
		limit: limitAmount,
		accountId: card.accountId,
		accountName,
		limitInUse: 0,
		limitAvailable: limitAmount,
		currentInvoiceAmount: 0,
		currentInvoiceLabel: "",
		currentInvoiceStatus: null,
		importPdfPasswordRule,
		hasImportPdfPasswordSecret: card.hasImportPdfPasswordSecret,
	};

	const { totalAmount, invoiceStatus, paymentDate } = invoiceData;

	const periodLabel = `${monthName.charAt(0).toUpperCase()}${monthName.slice(
		1,
	)} de ${year}`;

	return (
		<main className="flex flex-col gap-6">
			<PageBreadcrumb
				items={[{ label: "Cartões", href: "/cards" }, { label: card.name }]}
			/>

			<CardInvoiceNavigationShell
				monthSummaries={invoiceMonthSummaries}
				header={
					<CardInvoiceContextHeader
						embedded
						cardId={card.id}
						cardName={card.name}
						cardBrand={card.brand ?? null}
						logo={card.logo}
						periodLabel={periodLabel}
						importPdfPasswordRule={importPdfPasswordRule}
						hasImportPdfPasswordSecret={card.hasImportPdfPasswordSecret}
						actions={
							<CardDialog
								mode="update"
								card={cardDialogData}
								logoOptions={logoOptions}
								accounts={cardDialogAccounts}
								trigger={
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="text-muted-foreground hover:text-foreground"
										aria-label="Editar cartão"
									>
										<RiPencilLine className="size-4" />
									</Button>
								}
							/>
						}
					/>
				}
			/>

			<section className="flex flex-col gap-4">
				<InvoiceSummaryCard
					cardId={card.id}
					period={selectedPeriod}
					cardBrand={card.brand ?? null}
					cardStatus={card.status ?? null}
					closingDay={card.closingDay}
					dueDay={card.dueDay}
					totalAmount={totalAmount}
					limitAmount={limitAmount}
					invoiceStatus={invoiceStatus}
					paymentDate={paymentDate}
					defaultPaymentAccountId={card.accountId}
					paymentAccountOptions={accountOptions.map((option) => ({
						value: option.value,
						label: option.label,
						logo: option.logo ?? null,
					}))}
					hasImportHistory={importHistory.length > 0}
					hasImportAttachment={importHistory.some(
						(entry) => entry.hasAttachment,
					)}
					reconciliation={
						invoiceReconciliation.sourceTotal != null &&
						invoiceReconciliation.sourceKind
							? {
									sourceTotal: invoiceReconciliation.sourceTotal,
									sourceKind: invoiceReconciliation.sourceKind,
									sourceOverride: invoiceReconciliation.sourceOverride,
									delta: invoiceReconciliation.delta ?? 0,
									extraTransactions: invoiceReconciliation.transactions,
								}
							: null
					}
				/>
			</section>

			<MonthToolbarSlotProvider mobileColumns={3}>
				<UiCard className="gap-0 overflow-hidden py-0">
					<StatementPeriodNavigation
						embedded
						hideCarousel
						toolbarSlotId={TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID}
					/>
				</UiCard>

				<section className="flex flex-col gap-4">
					<LancamentosSection
					financialDataOwnerId={financialContext.dataOwnerUserId}
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
					allowCreate
					noteAsColumn={userPreferences?.statementNoteAsColumn ?? false}
					columnOrder={userPreferences?.transactionsColumnOrder ?? null}
					groupTransactionsByDate={
						userPreferences?.groupTransactionsByDate ?? true
					}
					attachmentMaxSizeMb={userPreferences?.attachmentMaxSizeMb ?? 50}
					defaultCardId={card.id}
					defaultPaymentMethod="Cartão de crédito"
					lockCardSelection
					lockPaymentMethod
					showImportButton={false}
					exportContext={{
						source: "transactions",
						period: selectedPeriod,
						filters: searchFilters,
						cardId: card.id,
					}}
				/>
				</section>
			</MonthToolbarSlotProvider>
		</main>
	);
}
