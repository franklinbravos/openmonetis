"use client";

import { RiCalendarLine, RiExchangeDollarLine } from "@remixicon/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
	DEFAULT_TRANSACTIONS_VIEW_MODE,
	type TransactionsViewMode,
	TRANSACTIONS_VIEW_MODE_PARAM,
} from "@/features/transactions/lib/view-mode";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/utils/ui";

type TransactionsViewModeToggleProps = {
	value?: TransactionsViewMode;
	className?: string;
};

export function TransactionsViewModeToggle({
	value = DEFAULT_TRANSACTIONS_VIEW_MODE,
	className,
}: TransactionsViewModeToggleProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const handleChange = (nextValue: string) => {
		if (!nextValue || nextValue === value) {
			return;
		}

		const params = new URLSearchParams(searchParams.toString());
		params.set(TRANSACTIONS_VIEW_MODE_PARAM, nextValue);
		params.delete("page");

		startTransition(() => {
			router.replace(`${pathname}?${params.toString()}`);
		});
	};

	return (
		<ToggleGroup
			type="single"
			value={value}
			onValueChange={handleChange}
			variant="outline"
			size="sm"
			disabled={isPending}
			className={cn(
				"grid w-full shrink-0 grid-cols-2 rounded-lg bg-muted/30 p-0.5 sm:w-auto",
				className,
			)}
			aria-label="Modo de visualização dos lançamentos"
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<ToggleGroupItem
						value="competencia"
						className="gap-1.5 px-2.5 text-xs font-medium transition-all data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:shadow-sm sm:px-3"
					>
						<RiCalendarLine className="size-3.5 shrink-0" aria-hidden />
						<span className="truncate">Competência</span>
					</ToggleGroupItem>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="max-w-xs text-xs">
					Valores na data do lançamento — a compra parcelada aparece inteira no
					mês da compra.
				</TooltipContent>
			</Tooltip>

			<Tooltip>
				<TooltipTrigger asChild>
					<ToggleGroupItem
						value="fluxo-caixa"
						className="gap-1.5 px-2.5 text-xs font-medium transition-all data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:shadow-sm sm:px-3"
					>
						<RiExchangeDollarLine className="size-3.5 shrink-0" aria-hidden />
						<span className="truncate">Fluxo de caixa</span>
					</ToggleGroupItem>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="max-w-xs text-xs">
					Valores quando o dinheiro entra ou sai — cada parcela aparece no mês
					do pagamento ou da fatura.
				</TooltipContent>
			</Tooltip>
		</ToggleGroup>
	);
}
