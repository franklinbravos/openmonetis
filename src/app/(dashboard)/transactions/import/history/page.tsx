import { RiHistoryLine } from "@remixicon/react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ImportHistoryPage } from "@/features/transactions/components/import/import-history-page";
import {
	buildOptionSets,
	buildSluggedFilters,
	getSingleParam,
} from "@/features/transactions/lib/page-helpers";
import type { ResolvedSearchParams } from "@/features/transactions/lib/page-helpers";
import { fetchImportBatchHistory } from "@/features/transactions/queries/import-batch-history";
import { fetchTransactionFilterSources } from "@/features/transactions/queries";
import PageDescription from "@/shared/components/page-description";
import { getUserId } from "@/shared/lib/auth/server";
import { parsePeriod } from "@/shared/utils/period";

type PageSearchParams = Promise<ResolvedSearchParams>;

type PageProps = {
	searchParams?: PageSearchParams;
};

export const metadata: Metadata = {
	title: "Histórico de importações",
};

function resolveHistoryFilters(searchParams: ResolvedSearchParams | undefined) {
	const cardId = getSingleParam(searchParams, "cartao");
	const periodRaw = getSingleParam(searchParams, "periodo");

	let invoicePeriod: string | null = null;
	if (periodRaw) {
		try {
			parsePeriod(periodRaw);
			invoicePeriod = periodRaw;
		} catch {
			invoicePeriod = null;
		}
	}

	return { cardId, invoicePeriod };
}

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const userId = await getUserId();
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const { cardId, invoicePeriod } = resolveHistoryFilters(resolvedSearchParams);

	const [entries, filterSources] = await Promise.all([
		fetchImportBatchHistory({
			userId,
			cardId: cardId ?? null,
			invoicePeriod: invoicePeriod ?? null,
			limit: 100,
		}),
		fetchTransactionFilterSources(userId),
	]);

	const sluggedFilters = buildSluggedFilters(filterSources);
	const { cardOptions } = buildOptionSets({
		...sluggedFilters,
		payerRows: filterSources.payerRows,
	});

	const isInvoiceContext = Boolean(cardId && invoicePeriod);

	const backHref =
		cardId && invoicePeriod
			? `/cards/${cardId}/invoice?periodo=${encodeURIComponent(invoicePeriod)}`
			: "/transactions/import";

	return (
		<main className="flex flex-col gap-6">
			<PageDescription
				icon={<RiHistoryLine />}
				title="Histórico de importações"
				subtitle="Consulte tentativas de importação. Use os filtros para refinar a lista ou limpe-os para ver tudo."
			/>
			<ImportHistoryPage
				entries={entries}
				cardOptions={cardOptions}
				cardId={cardId}
				invoicePeriod={invoicePeriod}
				backHref={backHref}
				backLabel={isInvoiceContext ? "Voltar para a fatura" : "Voltar para importação"}
				cardDescription="Cada linha registra uma tentativa de importação. Importações incompletas podem ser retomadas ou excluídas."
				emptyMessage={
					cardId || invoicePeriod
						? "Nenhuma tentativa de importação encontrada com os filtros atuais."
						: "Nenhum arquivo importado registrado ainda."
				}
			/>
		</main>
	);
}
