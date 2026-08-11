"use client";
import { RiArrowLeftRightLine, RiFlashlightFill } from "@remixicon/react";
import {
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type Row,
	type RowSelectionState,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
	TransactionsExportContext,
	TransactionsPaginationState,
} from "@/features/transactions/lib/export-types";
import { buildAccountImportHref } from "@/features/transactions/lib/import-continue-href";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { formatDateGroupLabel } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";
import {
	getMonthToolbarCreateSlotId,
	monthToolbarCreateGroupClassName,
	monthToolbarMassAddClassName,
	TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID,
} from "../../lib/month-toolbar";
import { TransactionsExport } from "../transactions-export";
import { TransactionsImportButton } from "../transactions-import-button";
import type {
	AccountCardFilterOption,
	TransactionFilterOption,
	TransactionItem,
} from "../types";
import { TransactionsBulkBar } from "./transactions-bulk-bar";
import { getTransactionColumns } from "./transactions-columns";
import { TransactionsFilters } from "./transactions-filters";
import { TransactionsMobileList } from "./transactions-mobile-list";
import { TransactionsPagination } from "./transactions-pagination";

type TransactionsTableProps = {
	data: TransactionItem[];
	currentUserId: string;
	noteAsColumn?: boolean;
	columnOrder?: string[] | null;
	payerFilterOptions?: TransactionFilterOption[];
	categoryFilterOptions?: TransactionFilterOption[];
	accountCardFilterOptions?: AccountCardFilterOption[];
	selectedPeriod?: string;
	pagination?: TransactionsPaginationState;
	exportContext?: TransactionsExportContext;
	createSlot?: ReactNode;
	onMassAdd?: () => void;
	onEdit?: (item: TransactionItem) => void;
	onCopy?: (item: TransactionItem) => void;
	onImport?: (item: TransactionItem) => void;
	onConfirmDelete?: (item: TransactionItem) => void;
	onBulkDelete?: (items: TransactionItem[]) => void;
	onBulkImport?: (items: TransactionItem[]) => void;
	onViewDetails?: (item: TransactionItem) => void;
	onRefund?: (item: TransactionItem) => void;
	onConvertToInstallment?: (item: TransactionItem) => void;
	onConvertToRecurring?: (item: TransactionItem) => void;
	onToggleSettlement?: (item: TransactionItem) => void;
	onAnticipate?: (item: TransactionItem) => void;
	onViewAnticipationHistory?: (item: TransactionItem) => void;
	isSettlementLoading?: (id: string) => boolean;
	showActions?: boolean;
	showFilters?: boolean;
	showImportButton?: boolean;
	groupTransactionsByDate?: boolean;
};

export function TransactionsTable({
	data,
	currentUserId,
	noteAsColumn = false,
	columnOrder: columnOrderPreference = null,
	payerFilterOptions = [],
	categoryFilterOptions = [],
	accountCardFilterOptions = [],
	selectedPeriod,
	pagination: serverPagination,
	exportContext,
	createSlot,
	onMassAdd,
	onEdit,
	onCopy,
	onImport,
	onConfirmDelete,
	onBulkDelete,
	onBulkImport,
	onViewDetails,
	onRefund,
	onConvertToInstallment,
	onConvertToRecurring,
	onToggleSettlement,
	onAnticipate,
	onViewAnticipationHistory,
	isSettlementLoading,
	showActions = true,
	showFilters = true,
	showImportButton = true,
	groupTransactionsByDate = true,
}: TransactionsTableProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "purchaseDate", desc: true },
	]);
	const [columnVisibility] = useState<VisibilityState>({
		purchaseDate: false,
	});
	const [pagination, setPagination] = useState({
		pageIndex: 0,
		pageSize: 30,
	});
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const isServerPaginated = Boolean(serverPagination);

	const columns = useMemo(
		() =>
			getTransactionColumns({
				currentUserId,
				noteAsColumn,
				onEdit,
				onCopy,
				onImport,
				onConfirmDelete,
				onViewDetails,
				onRefund,
				onConvertToInstallment,
				onConvertToRecurring,
				onToggleSettlement,
				onAnticipate,
				onViewAnticipationHistory,
				isSettlementLoading: isSettlementLoading ?? (() => false),
				showActions,
				showDateGroups: groupTransactionsByDate,
				columnOrder: columnOrderPreference,
			}),
		[
			currentUserId,
			noteAsColumn,
			columnOrderPreference,
			groupTransactionsByDate,
			onEdit,
			onCopy,
			onImport,
			onConfirmDelete,
			onViewDetails,
			onRefund,
			onConvertToInstallment,
			onConvertToRecurring,
			onToggleSettlement,
			onAnticipate,
			onViewAnticipationHistory,
			isSettlementLoading,
			showActions,
		],
	);

	const table = useReactTable({
		data,
		columns,
		state: isServerPaginated
			? { sorting, columnVisibility, rowSelection }
			: { sorting, columnVisibility, pagination, rowSelection },
		onSortingChange: setSorting,
		onPaginationChange: isServerPaginated ? undefined : setPagination,
		onRowSelectionChange: setRowSelection,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: isServerPaginated
			? undefined
			: getPaginationRowModel(),
		manualPagination: isServerPaginated,
		pageCount: serverPagination?.totalPages,
		enableRowSelection: (row) =>
			row.original.userId === currentUserId
				? !row.original.readonly
				: Boolean(onBulkImport),
	});

	const rowModel = table.getRowModel();
	const hasRows = rowModel.rows.length > 0;
	const groupedRows = rowModel.rows.reduce<
		Array<{ date: string; label: string; rows: Row<TransactionItem>[] }>
	>((acc, row) => {
		const date = row.original.purchaseDate?.slice(0, 10) ?? "";
		const existingGroup = acc.find((group) => group.date === date);
		if (existingGroup) {
			existingGroup.rows.push(row);
			return acc;
		}

		acc.push({
			date,
			label: formatDateGroupLabel(row.original.purchaseDate),
			rows: [row],
		});
		return acc;
	}, []);
	const visibleColumnCount = table.getVisibleLeafColumns().length;
	const totalRows = isServerPaginated
		? (serverPagination?.totalItems ?? 0)
		: table.getCoreRowModel().rows.length;
	const selectedRows = table.getFilteredSelectedRowModel().rows;
	const selectedOwnRows = selectedRows.filter(
		(row) => row.original.userId === currentUserId,
	);
	const selectedImportRows = selectedRows.filter(
		(row) => row.original.userId !== currentUserId,
	);
	const selectedCount = selectedRows.length;
	const selectedTotal = selectedRows.reduce(
		(total, row) => total + (row.original.amount ?? 0),
		0,
	);
	const selectedImportTotal = selectedImportRows.reduce(
		(total, row) => total + (row.original.amount ?? 0),
		0,
	);
	const currentPage = isServerPaginated
		? (serverPagination?.page ?? 1)
		: table.getState().pagination.pageIndex + 1;
	const currentPageSize = isServerPaginated
		? (serverPagination?.pageSize ?? pagination.pageSize)
		: pagination.pageSize;
	const totalPages = isServerPaginated
		? Math.max(serverPagination?.totalPages ?? 1, 1)
		: Math.max(table.getPageCount(), 1);
	const canPreviousPage = currentPage > 1;
	const canNextPage = currentPage < totalPages;

	const hasOtherUserData = data.some((item) => item.userId !== currentUserId);

	const handleBulkDelete = () => {
		if (onBulkDelete && selectedCount > 0) {
			onBulkDelete(selectedRows.map((row) => row.original));
			setRowSelection({});
		}
	};

	const handleBulkImport = () => {
		if (onBulkImport && selectedImportRows.length > 0) {
			onBulkImport(selectedImportRows.map((row) => row.original));
			setRowSelection({});
		}
	};

	const navigateToPage = (nextPage: number, nextPageSize = currentPageSize) => {
		const nextParams = new URLSearchParams(searchParams.toString());
		if (nextPage <= 1) {
			nextParams.delete("page");
		} else {
			nextParams.set("page", nextPage.toString());
		}
		if (nextPageSize === 30) {
			nextParams.delete("pageSize");
		} else {
			nextParams.set("pageSize", nextPageSize.toString());
		}
		const target = nextParams.toString()
			? `${pathname}?${nextParams.toString()}`
			: pathname;
		router.replace(target, { scroll: false });
		setRowSelection({});
	};

	const handlePageChange = (nextPage: number) => {
		if (isServerPaginated) {
			navigateToPage(nextPage);
		} else {
			table.setPageIndex(nextPage - 1);
		}
	};

	const handlePageSizeChange = (size: number) => {
		if (isServerPaginated) {
			navigateToPage(1, size);
		} else {
			table.setPageSize(size);
		}
	};

	const showTopControls =
		Boolean(createSlot) || Boolean(onMassAdd) || showFilters;
	const exportSlot =
		showFilters && selectedPeriod ? (
			<TransactionsExport
				lancamentos={data}
				period={selectedPeriod}
				exportContext={exportContext}
			/>
		) : null;
	const importHref =
		exportContext?.source === "account-statement" && exportContext.accountId
			? buildAccountImportHref(exportContext.accountId, exportContext.period)
			: undefined;
	const importSlot =
		showTopControls && showImportButton ? (
			<TransactionsImportButton href={importHref} />
		) : null;

	const monthToolbarCreateSlotId = showFilters
		? getMonthToolbarCreateSlotId(TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID)
		: null;
	const [monthToolbarCreateSlot, setMonthToolbarCreateSlot] =
		useState<HTMLElement | null>(null);

	useEffect(() => {
		if (!monthToolbarCreateSlotId) {
			setMonthToolbarCreateSlot(null);
			return;
		}

		setMonthToolbarCreateSlot(
			document.getElementById(monthToolbarCreateSlotId),
		);
	}, [monthToolbarCreateSlotId]);

	const createActions =
		createSlot || onMassAdd ? (
			<div
				className={cn(
					monthToolbarCreateGroupClassName,
					"md:[&_.quick-actions-root_button]:h-full md:[&_.quick-actions-root_button]:min-h-0 md:[&_.quick-actions-root_button]:rounded-none md:[&_.quick-actions-root_button]:border-0 md:[&_.quick-actions-root_button]:py-0 md:[&_.quick-actions-root_button]:shadow-none",
				)}
			>
				{createSlot}
				{onMassAdd ? (
					<Button
						onClick={onMassAdd}
						variant="ghost"
						size="sm"
						className={monthToolbarMassAddClassName}
						aria-label="Adicionar múltiplos lançamentos"
					>
						<RiFlashlightFill className="size-5 shrink-0 text-primary md:size-4" />
						<span className="md:hidden">Múltiplos</span>
						<span className="hidden md:inline">Múltiplos</span>
					</Button>
				) : null}
			</div>
		) : null;

	const portaledCreateActions =
		monthToolbarCreateSlot && createActions
			? createPortal(createActions, monthToolbarCreateSlot)
			: null;
	const showCreateInline = createActions && !monthToolbarCreateSlot;
	const hasPortaledToolbar = Boolean(monthToolbarCreateSlot);

	const handleOpenRowDetails = (item: TransactionItem) => {
		onViewDetails?.(item);
	};

	const isInteractiveRowClickTarget = (target: EventTarget | null) => {
		if (!(target instanceof HTMLElement)) return false;
		return Boolean(
			target.closest(
				'button, a, input, textarea, select, label, [role="checkbox"], [role="menuitem"]',
			),
		);
	};

	const renderTransactionRow = (row: Row<TransactionItem>) => (
		<TableRow
			key={row.id}
			className={cn(
				onViewDetails && "cursor-pointer",
				row.original.paymentMethod === "Boleto" &&
					row.original.dueDate &&
					!row.original.isSettled &&
					new Date(row.original.dueDate) < new Date()
					? "bg-destructive/3 hover:bg-destructive/5"
					: undefined,
			)}
			onClick={
				onViewDetails
					? (event) => {
							if (isInteractiveRowClickTarget(event.target)) return;
							handleOpenRowDetails(row.original);
						}
					: undefined
			}
			onKeyDown={
				onViewDetails
					? (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								handleOpenRowDetails(row.original);
							}
						}
					: undefined
			}
			tabIndex={onViewDetails ? 0 : undefined}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell key={cell.id}>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	);

	return (
		<TooltipProvider>
			{portaledCreateActions}
			{showFilters && hasPortaledToolbar ? (
				<TransactionsFilters
					payerOptions={payerFilterOptions}
					categoryOptions={categoryFilterOptions}
					accountCardOptions={accountCardFilterOptions}
					hideAdvancedFilters={hasOtherUserData}
					exportButton={exportSlot}
					importButton={importSlot}
					monthToolbarSlotId={TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID}
				/>
			) : null}
			{showTopControls && !hasPortaledToolbar ? (
				<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
					{showCreateInline ? createActions : null}

					{showFilters ? (
						<TransactionsFilters
							payerOptions={payerFilterOptions}
							categoryOptions={categoryFilterOptions}
							accountCardOptions={accountCardFilterOptions}
							className="w-full lg:flex-1 lg:justify-end"
							hideAdvancedFilters={hasOtherUserData}
							exportButton={exportSlot}
							importButton={importSlot}
							monthToolbarSlotId={TRANSACTIONS_MONTH_TOOLBAR_SLOT_ID}
						/>
					) : null}
				</div>
			) : null}

			{selectedCount > 0 &&
			onBulkDelete &&
			selectedOwnRows.length === selectedCount ? (
				<TransactionsBulkBar
					selectedCount={selectedCount}
					selectedTotal={selectedTotal}
					mode="delete"
					onAction={handleBulkDelete}
				/>
			) : null}

			{selectedCount > 0 && onBulkImport && selectedImportRows.length > 0 ? (
				<TransactionsBulkBar
					selectedCount={selectedImportRows.length}
					selectedTotal={selectedImportTotal}
					mode="import"
					onAction={handleBulkImport}
				/>
			) : null}

			<Card className="py-2">
				<CardContent className="px-2 sm:px-4">
					{hasRows ? (
						<>
							<TransactionsMobileList
								data={rowModel.rows.map((row) => row.original)}
								currentUserId={currentUserId}
								onEdit={onEdit}
								onCopy={onCopy}
								onImport={onImport}
								onConfirmDelete={onConfirmDelete}
								onViewDetails={onViewDetails}
								onRefund={onRefund}
								onToggleSettlement={onToggleSettlement}
								onAnticipate={onAnticipate}
								onViewAnticipationHistory={onViewAnticipationHistory}
								isSettlementLoading={isSettlementLoading ?? (() => false)}
								showActions={showActions}
								showDateGroups={groupTransactionsByDate}
							/>

							<div className="hidden overflow-x-auto md:block">
								<Table>
									<TableHeader>
										{table.getHeaderGroups().map((headerGroup) => (
											<TableRow key={headerGroup.id}>
												{headerGroup.headers.map((header) => (
													<TableHead
														key={header.id}
														className="whitespace-nowrap"
													>
														{header.isPlaceholder
															? null
															: flexRender(
																	header.column.columnDef.header,
																	header.getContext(),
																)}
													</TableHead>
												))}
											</TableRow>
										))}
									</TableHeader>
									<TableBody>
										{groupTransactionsByDate
											? groupedRows.map((group, groupIndex) => (
													<Fragment
														key={`${group.date || group.label}-${groupIndex}`}
													>
														<TableRow className="border-y bg-muted/40 hover:bg-muted/60">
															<TableCell
																colSpan={visibleColumnCount}
																className="h-9 px-3 py-2 text-xs font-semibold text-muted-foreground"
															>
																{group.label}
															</TableCell>
														</TableRow>
														{group.rows.map(renderTransactionRow)}
													</Fragment>
												))
											: rowModel.rows.map(renderTransactionRow)}
									</TableBody>
								</Table>
							</div>

							<TransactionsPagination
								totalRows={totalRows}
								currentPage={currentPage}
								currentPageSize={currentPageSize}
								totalPages={totalPages}
								canPreviousPage={canPreviousPage}
								canNextPage={canNextPage}
								onPageChange={handlePageChange}
								onPageSizeChange={handlePageSizeChange}
							/>
						</>
					) : (
						<div className="flex w-full items-center justify-center py-12">
							<EmptyState
								media={<RiArrowLeftRightLine className="size-6 text-primary" />}
								title="Nenhum lançamento encontrado"
								description="Ajuste os filtros ou cadastre um novo lançamento para visualizar aqui."
							/>
						</div>
					)}
				</CardContent>
			</Card>
		</TooltipProvider>
	);
}
