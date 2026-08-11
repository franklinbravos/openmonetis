"use client";

import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";
import {
	deleteCategoryAction,
	fetchCategoryLinkedTransactionsAction,
	migrateCategoryTransactionsAction,
	updateCategoryTransactionCategoryAction,
} from "@/features/categories/actions";
import {
	buildCategorySelectOptions,
	resolveCategoryTypeForTransaction,
} from "@/features/categories/lib/category-select-options";
import type { CategoryLinkedTransaction } from "@/features/categories/queries";
import { CategorySearchSelect } from "@/features/transactions/components/dialogs/transaction-dialog/category-search-select";
import { groupAndSortCategories } from "@/features/transactions/lib/category-helpers";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { CATEGORY_TYPE_LABEL } from "@/shared/lib/categories/constants";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";
import type { Category } from "./types";

type DeleteCategoryDialogProps = {
	category: Category | null;
	allCategories: Category[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function DeleteCategoryDialog({
	category,
	allCategories,
	open,
	onOpenChange,
}: DeleteCategoryDialogProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [isLoading, setIsLoading] = useState(false);
	const [linkedTransactions, setLinkedTransactions] = useState<
		CategoryLinkedTransaction[]
	>([]);
	const [bulkTargetCategoryId, setBulkTargetCategoryId] = useState("");

	const loadLinkedTransactions = useCallback(async (categoryId: string) => {
		setIsLoading(true);
		try {
			const result = await fetchCategoryLinkedTransactionsAction(categoryId);
			if (!result.success) {
				toast.error(result.error);
				setLinkedTransactions([]);
				return;
			}
			setLinkedTransactions(result.data ?? []);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!open || !category) {
			setLinkedTransactions([]);
			setBulkTargetCategoryId("");
			return;
		}

		void loadLinkedTransactions(category.id);
	}, [category, loadLinkedTransactions, open]);

	const bulkCategoryOptions = useMemo(() => {
		if (!category) return [];
		return buildCategorySelectOptions({
			categories: allCategories,
			excludeCategoryId: category.id,
			typeFilter: category.type,
		});
	}, [allCategories, category]);

	const bulkCategoryGroups = useMemo(
		() => groupAndSortCategories(bulkCategoryOptions),
		[bulkCategoryOptions],
	);

	const getRowCategoryOptions = useCallback(
		(transactionType: string) =>
			buildCategorySelectOptions({
				categories: allCategories,
				excludeCategoryId: category?.id,
				typeFilter: resolveCategoryTypeForTransaction(transactionType),
			}),
		[allCategories, category?.id],
	);

	const handleBulkMigrate = () => {
		if (!category || !bulkTargetCategoryId) {
			toast.error("Selecione uma categoria de destino.");
			return;
		}

		startTransition(async () => {
			const result = await migrateCategoryTransactionsAction({
				fromCategoryId: category.id,
				toCategoryId: bulkTargetCategoryId,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			setBulkTargetCategoryId("");
			await loadLinkedTransactions(category.id);
			router.refresh();
		});
	};

	const handleRowCategoryChange = (
		transaction: CategoryLinkedTransaction,
		targetCategoryId: string,
	) => {
		if (!category || !targetCategoryId) return;

		startTransition(async () => {
			const result = await updateCategoryTransactionCategoryAction({
				transactionId: transaction.id,
				categoryId: targetCategoryId,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			setLinkedTransactions((current) =>
				current.filter((item) => item.id !== transaction.id),
			);
			router.refresh();
		});
	};

	const handleDelete = () => {
		if (!category) return;

		startTransition(async () => {
			const result = await deleteCategoryAction({ id: category.id });

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			onOpenChange(false);
			router.refresh();
		});
	};

	const remainingCount = linkedTransactions.length;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
				<DialogHeader className="border-b px-6 py-4">
					<DialogTitle>
						{category
							? `Remover categoria "${category.name}"`
							: "Remover categoria"}
					</DialogTitle>
					<DialogDescription>
						{category
							? `Revise os lançamentos vinculados a esta categoria de ${CATEGORY_TYPE_LABEL[category.type].toLowerCase()} antes de confirmar a remoção.`
							: "Revise os lançamentos vinculados antes de confirmar a remoção."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
					{isLoading ? (
						<div className="space-y-3">
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-16 w-full" />
						</div>
					) : remainingCount === 0 ? (
						<p className="rounded-lg border border-dashed bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
							Nenhum lançamento usa esta categoria. Você pode removê-la com
							segurança.
						</p>
					) : (
						<>
							<div className="rounded-lg border bg-muted/20 p-3">
								<p className="text-sm font-medium">
									{remainingCount}{" "}
									{remainingCount === 1
										? "lançamento vinculado"
										: "lançamentos vinculados"}
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Migre todos para outra categoria ou ajuste um por um.
									Lançamentos restantes serão desvinculados ao remover.
								</p>

								<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
									<div className="min-w-0 flex-1">
										<p className="mb-1.5 text-xs font-medium text-muted-foreground">
											Migrar todos para
										</p>
										<CategorySearchSelect
											value={bulkTargetCategoryId}
											onValueChange={setBulkTargetCategoryId}
											categoryGroups={bulkCategoryGroups}
											categoryOptions={bulkCategoryOptions}
											placeholder="Selecionar categoria..."
											disabled={isPending}
											triggerClassName="w-full"
										/>
									</div>
									<Button
										type="button"
										variant="secondary"
										className="shrink-0"
										disabled={isPending || !bulkTargetCategoryId}
										onClick={handleBulkMigrate}
									>
										Aplicar a todos
									</Button>
								</div>
							</div>

							<ul className="space-y-2">
								{linkedTransactions.map((transaction) => {
									const rowOptions = getRowCategoryOptions(
										transaction.transactionType,
									);
									const rowGroups = groupAndSortCategories(rowOptions);
									const isIncome =
										transaction.transactionType.toLowerCase() === "receita";

									return (
										<li
											key={transaction.id}
											className="rounded-lg border px-3 py-3 shadow-xs"
										>
											<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
												<div className="min-w-0 flex-1 space-y-1">
													<p className="truncate text-sm font-medium">
														{transaction.name}
													</p>
													<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
														<span>
															{formatDateOnly(transaction.purchaseDate) ??
																transaction.purchaseDate}
														</span>
														<span aria-hidden>·</span>
														<span>{transaction.period}</span>
														<span aria-hidden>·</span>
														<span>{transaction.transactionType}</span>
													</div>
													<p
														className={cn(
															"text-sm font-semibold tabular-nums",
															isIncome ? "text-success" : "text-destructive",
														)}
													>
														{formatCurrency(transaction.amount)}
													</p>
												</div>

												<div className="w-full min-w-0 sm:w-56">
													<p className="mb-1.5 text-xs font-medium text-muted-foreground">
														Nova categoria
													</p>
													<CategorySearchSelect
														value=""
														onValueChange={(value) =>
															handleRowCategoryChange(transaction, value)
														}
														categoryGroups={rowGroups}
														categoryOptions={rowOptions}
														placeholder="Selecionar..."
														disabled={isPending}
														triggerClassName="w-full"
													/>
												</div>
											</div>
										</li>
									);
								})}
							</ul>
						</>
					)}
				</div>

				<DialogFooter className="border-t px-6 py-4">
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={isPending || isLoading}
						onClick={handleDelete}
					>
						{isPending
							? "Removendo..."
							: remainingCount > 0
								? `Remover e desvincular ${remainingCount}`
								: "Remover categoria"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
