import { RiHistoryLine } from "@remixicon/react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { ImportHistoryPage } from "@/features/transactions/components/import/import-history-page";
import { fetchImportBatchHistory } from "@/features/transactions/queries/import-batch-history";
import PageDescription from "@/shared/components/page-description";
import { getUserId } from "@/shared/lib/auth/server";

export const metadata: Metadata = {
	title: "Histórico de importações",
};

export default async function Page() {
	await connection();
	const userId = await getUserId();

	const entries = await fetchImportBatchHistory({
		userId,
		limit: 100,
	});

	return (
		<main className="flex flex-col gap-6">
			<PageDescription
				icon={<RiHistoryLine />}
				title="Histórico de importações"
				subtitle="Consulte todos os arquivos de extrato e fatura já processados pelo OpenMonetis."
			/>
			<ImportHistoryPage entries={entries} />
		</main>
	);
}
