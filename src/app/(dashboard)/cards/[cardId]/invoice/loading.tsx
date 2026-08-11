import {
	FilterSkeleton,
	InvoiceSummaryCardSkeleton,
	TransactionsTableSkeleton,
} from "@/shared/components/skeletons";
import { Card } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

/**
 * Loading state para a página de fatura de cartão
 * Layout: NavigationShell + InvoiceSummaryCard + Filtros + Tabela
 */
export default function FaturaLoading() {
	return (
		<main className="flex flex-col gap-6">
			<Card className="gap-0 overflow-hidden py-0">
				<div className="border-b border-border/60 px-3 py-2.5 sm:px-4 sm:py-3">
					<div className="flex items-center gap-3">
						<Skeleton className="size-10 shrink-0 rounded-full bg-foreground/10 sm:size-11" />
						<div className="min-w-0 flex-1 space-y-1.5">
							<Skeleton className="h-3 w-12 rounded-md bg-foreground/10" />
							<Skeleton className="h-5 w-28 rounded-md bg-foreground/10" />
							<Skeleton className="h-3.5 w-40 rounded-md bg-foreground/10" />
						</div>
						<div className="flex items-center gap-1">
							<Skeleton className="size-8 rounded-md bg-foreground/10" />
							<Skeleton className="size-8 rounded-md bg-foreground/10" />
						</div>
					</div>
				</div>
				<div className="px-3 py-2.5 sm:px-4 sm:py-3">
					<Skeleton className="h-16 w-full rounded-lg bg-foreground/10" />
				</div>
			</Card>

			<section className="flex flex-col gap-4">
				<InvoiceSummaryCardSkeleton />
			</section>

			<section className="flex flex-col gap-4">
				<div className="space-y-6 pt-4">
					<div className="flex items-center justify-between">
						<Skeleton className="h-8 w-48 rounded-md bg-foreground/10" />
						<Skeleton className="h-10 w-40 rounded-md bg-foreground/10" />
					</div>

					<FilterSkeleton />

					<TransactionsTableSkeleton />
				</div>
			</section>
		</main>
	);
}
