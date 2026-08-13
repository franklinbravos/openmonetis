import {
	RiArrowLeftDoubleLine,
	RiArrowLeftSLine,
	RiArrowRightDoubleLine,
	RiArrowRightSLine,
} from "@remixicon/react";
import { Button } from "@/shared/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 40, 50, 100] as const;

type TransactionsPaginationProps = {
	totalRows: number;
	currentPage: number;
	currentPageSize: number;
	totalPages: number;
	canPreviousPage: boolean;
	canNextPage: boolean;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
};

export function TransactionsPagination({
	totalRows,
	currentPage,
	currentPageSize,
	totalPages,
	canPreviousPage,
	canNextPage,
	onPageChange,
	onPageSizeChange,
}: TransactionsPaginationProps) {
	const hasMultiplePages = totalPages > 1;

	return (
		<div className="mt-4 flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
			<div className="flex min-w-0 items-center gap-2">
				<span className="whitespace-nowrap text-sm text-muted-foreground">
					{totalRows} lançamentos
				</span>
				<Select
					value={currentPageSize.toString()}
					onValueChange={(value) => onPageSizeChange(Number(value))}
				>
					<SelectTrigger
						className="h-8 w-max min-w-0"
						aria-label="Linhas por página"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PAGE_SIZE_OPTIONS.map((size) => (
							<SelectItem key={size} value={size.toString()}>
								<span className="sm:hidden">{size}</span>
								<span className="hidden sm:inline">{size} linhas</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{hasMultiplePages ? (
				<div className="flex items-center gap-2">
					<span className="whitespace-nowrap text-sm text-muted-foreground">
						<span className="sm:hidden">
							Pág. {currentPage}/{totalPages}
						</span>
						<span className="hidden sm:inline">
							Página {currentPage} de {totalPages}
						</span>
					</span>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => onPageChange(1)}
							disabled={!canPreviousPage}
							aria-label="Primeira página"
						>
							<RiArrowLeftDoubleLine className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => onPageChange(currentPage - 1)}
							disabled={!canPreviousPage}
							aria-label="Página anterior"
						>
							<RiArrowLeftSLine className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => onPageChange(currentPage + 1)}
							disabled={!canNextPage}
							aria-label="Próxima página"
						>
							<RiArrowRightSLine className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => onPageChange(totalPages)}
							disabled={!canNextPage}
							aria-label="Última página"
						>
							<RiArrowRightDoubleLine className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
