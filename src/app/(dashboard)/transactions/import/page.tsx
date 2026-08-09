import { randomUUID } from "node:crypto";
import { RiUploadCloud2Line } from "@remixicon/react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { resolveCardImportPdfPasswordAttempts } from "@/features/cards/lib/resolve-import-pdf-password";
import { ImportPage } from "@/features/transactions/components/import/import-page";
import {
	buildOptionSets,
	buildSluggedFilters,
	getSingleParam,
	type ResolvedSearchParams,
} from "@/features/transactions/lib/page-helpers";
import type { InvoiceImportContext } from "@/features/transactions/lib/validate-invoice-import-context";
import { fetchTransactionFilterSources } from "@/features/transactions/queries";
import { fetchImportBatchHistory } from "@/features/transactions/queries/import-batch-history";
import PageDescription from "@/shared/components/page-description";
import { getUserId } from "@/shared/lib/auth/server";
import { displayPeriod, parsePeriod } from "@/shared/utils/period";

type PageSearchParams = Promise<ResolvedSearchParams>;

type PageProps = {
	searchParams?: PageSearchParams;
};

function resolveImportPrefill(searchParams: ResolvedSearchParams | undefined) {
	const cardId = getSingleParam(searchParams ?? {}, "cartao");
	const accountId = getSingleParam(searchParams ?? {}, "conta");
	const periodRaw = getSingleParam(searchParams ?? {}, "periodo");

	let invoicePeriod: string | null = null;
	if (periodRaw) {
		try {
			parsePeriod(periodRaw);
			invoicePeriod = periodRaw;
		} catch {
			invoicePeriod = null;
		}
	}

	return {
		initialCardId: cardId,
		initialAccountId: accountId,
		initialInvoicePeriod: invoicePeriod,
		initialResumeBatchId: getSingleParam(searchParams ?? {}, "lote"),
	};
}

export async function generateMetadata({
	searchParams,
}: PageProps): Promise<Metadata> {
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const {
		initialCardId,
		initialAccountId,
		initialInvoicePeriod,
		initialResumeBatchId,
	} = resolveImportPrefill(resolvedSearchParams);

	if (initialCardId && initialInvoicePeriod) {
		return {
			title: `Importar fatura · ${displayPeriod(initialInvoicePeriod)}`,
		};
	}

	if (initialAccountId) {
		return {
			title: "Importar extrato",
		};
	}

	return {
		title: "Importar lançamentos",
	};
}

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const userId = await getUserId();
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const {
		initialCardId,
		initialAccountId,
		initialInvoicePeriod,
		initialResumeBatchId,
	} = resolveImportPrefill(resolvedSearchParams);
	const filterSources = await fetchTransactionFilterSources(userId);
	const sluggedFilters = buildSluggedFilters(filterSources);
	const {
		payerOptions,
		accountOptions,
		cardOptions,
		categoryOptions,
		defaultPayerId,
	} = buildOptionSets({
		...sluggedFilters,
		payerRows: filterSources.payerRows,
	});

	const validCardId =
		initialCardId &&
		cardOptions.some((option) => option.value === initialCardId)
			? initialCardId
			: null;

	const validAccountId =
		initialAccountId &&
		accountOptions.some((option) => option.value === initialAccountId)
			? initialAccountId
			: null;

	const accountName =
		accountOptions.find((option) => option.value === validAccountId)?.label ??
		"Conta";

	const initialPaymentAccountId = validCardId
		? (filterSources.cardRows.find((card) => card.id === validCardId)
				?.accountId ?? null)
		: null;

	const invoiceContext: InvoiceImportContext | null =
		validCardId && initialInvoicePeriod
			? {
					cardId: validCardId,
					cardName:
						cardOptions.find((option) => option.value === validCardId)?.label ??
						"Cartão",
					invoicePeriod: initialInvoicePeriod,
				}
			: null;

	const autoPdfPasswordAttempts = validCardId
		? await resolveCardImportPdfPasswordAttempts(userId, validCardId)
		: [];

	const importHistory = await fetchImportBatchHistory({
		userId,
		cardId: validCardId,
		invoicePeriod: validCardId ? initialInvoicePeriod : null,
		accountId: validAccountId && !validCardId ? validAccountId : null,
		limit: 20,
	});

	const importMountKey = initialResumeBatchId ?? randomUUID();

	return (
		<main className="flex flex-col gap-6">
			{invoiceContext ? (
				<PageDescription
					icon={<RiUploadCloud2Line />}
					title="Importar fatura"
				/>
			) : validAccountId ? (
				<PageDescription
					icon={<RiUploadCloud2Line />}
					title="Importar extrato"
					subtitle={`Importe lançamentos do extrato da conta ${accountName}.`}
				/>
			) : (
				<PageDescription
					icon={<RiUploadCloud2Line />}
					title="Importar lançamentos"
					subtitle="Importe transações a partir de extratos ou faturas (.ofx, .csv, .txt, .pdf) ou planilha .xlsx exportada pelo seu banco."
				/>
			)}

			<ImportPage
				key={importMountKey}
				importMountKey={importMountKey}
				payerOptions={payerOptions}
				accountOptions={accountOptions}
				cardOptions={cardOptions}
				categoryOptions={categoryOptions}
				defaultPayerId={defaultPayerId}
				initialCardId={validCardId}
				initialAccountId={validAccountId}
				initialInvoicePeriod={
					validCardId || validAccountId ? initialInvoicePeriod : null
				}
				initialPaymentAccountId={initialPaymentAccountId}
				invoiceContext={invoiceContext}
				linkedCardId={validCardId}
				autoPdfPasswordAttempts={autoPdfPasswordAttempts}
				initialImportHistory={importHistory}
				initialResumeBatchId={initialResumeBatchId}
			/>
		</main>
	);
}
