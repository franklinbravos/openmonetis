"use client";

import {
	RiArrowLeftSLine,
	RiArrowRightSLine,
	RiCalendarLine,
} from "@remixicon/react";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useTransition,
} from "react";
import {
	getMonthToolbarCreateSlotId,
	getMonthToolbarEndSlotId,
	getMonthToolbarExpandSlotId,
	getMonthToolbarFiltersSlotId,
	getMonthToolbarMobileActionsClassName,
	getMonthToolbarMobileActionsSlotId,
	monthToolbarPanelClassName,
} from "@/features/transactions/lib/month-toolbar";
import LoadingSpinner from "@/shared/components/month-picker/loading-spinner";
import {
	useMonthToolbarMobileColumns,
	useMonthToolbarSlotRef,
} from "@/shared/components/month-picker/month-toolbar-slot-context";
import type {
	PeriodCarouselMonth,
	PeriodCarouselStatus,
	PeriodCarouselVariant,
} from "@/shared/components/month-picker/period-carousel-types";
import ReturnButton from "@/shared/components/month-picker/return-button";
import { useMonthPeriod } from "@/shared/components/month-picker/use-month-period";
import { Button } from "@/shared/components/ui/button";
import { MonthPicker } from "@/shared/components/ui/month-picker";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { formatCurrency } from "@/shared/utils/currency";
import {
	dateToPeriod,
	formatShortPeriodLabel,
	periodToDate,
} from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

const STATUS_DOT_FILL_CLASS: Record<PeriodCarouselStatus, string> = {
	paid: "fill-emerald-600",
	partial: "fill-emerald-600/45",
	overdue: "fill-destructive",
	closed: "fill-amber-500",
	open: "fill-primary",
	future: "fill-card stroke-primary stroke-[2.5]",
};

const STATUS_DOT_RING_CLASS: Record<PeriodCarouselStatus, string> = {
	paid: "stroke-emerald-600/15",
	partial: "stroke-emerald-600/10",
	overdue: "stroke-destructive/15",
	closed: "stroke-amber-500/15",
	open: "stroke-primary/15",
	future: "stroke-primary/30",
};

const CHART_HEIGHT = 40;
const CHART_Y_MIN = 8;
const CHART_Y_MAX = 32;

const STATUS_STROKE_CLASS: Record<PeriodCarouselStatus, string> = {
	paid: "stroke-emerald-600",
	partial: "stroke-emerald-600/50",
	overdue: "stroke-destructive",
	closed: "stroke-amber-500",
	open: "stroke-primary",
	future: "stroke-primary/40",
};

type ChartPoint = {
	x: number;
	y: number;
	period: string;
};

function amountToChartY(amount: number, min: number, max: number): number {
	if (max === min) {
		return (CHART_Y_MIN + CHART_Y_MAX) / 2;
	}

	const normalized = (amount - min) / (max - min);
	// SVG: Y cresce para baixo — valores maiores ficam mais altos (Y menor).
	return CHART_Y_MAX - normalized * (CHART_Y_MAX - CHART_Y_MIN);
}

/**
 * Valor que o ponto do gráfico representa.
 *
 * Na fatura paga em parte é o que saiu da conta, não o total: a linha desenha o
 * dinheiro que se moveu, e plotar o total faria maio subir como se tudo tivesse
 * sido pago — justo o mês em que não foi.
 */
function resolveChartAmount(month: PeriodCarouselMonth): number {
	return month.paidAmount ?? month.amount;
}

function buildCurveSegment(start: ChartPoint, end: ChartPoint): string {
	const midX = (start.x + end.x) / 2;
	return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
}

type PeriodMonthCarouselProps = {
	months: PeriodCarouselMonth[];
	selectedPeriod: string;
	onNavigate: (href: string) => void;
	isPending: boolean;
	variant?: PeriodCarouselVariant;
};

function PeriodMonthCarousel({
	months,
	selectedPeriod,
	onNavigate,
	isPending,
	variant = "invoice",
}: PeriodMonthCarouselProps) {
	const isAccountVariant = variant === "account";
	const scrollRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
	const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
	const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
	const [chartWidth, setChartWidth] = useState(0);
	const [chartTop, setChartTop] = useState(0);

	const measureChart = useCallback(() => {
		const track = trackRef.current;
		if (!track || months.length === 0) {
			setChartPoints([]);
			setChartWidth(0);
			setChartTop(0);
			return;
		}

		const trackRect = track.getBoundingClientRect();
		const chartRow = track.querySelector<HTMLElement>("[data-chart-row]");
		const chartRowRect = chartRow?.getBoundingClientRect();
		const chartRowTop = chartRowRect ? chartRowRect.top - trackRect.top : 22;

		const amounts = months.map(resolveChartAmount);
		const minAmount = Math.min(...amounts);
		const maxAmount = Math.max(...amounts);

		const points: ChartPoint[] = [];

		for (let index = 0; index < months.length; index += 1) {
			const month = months[index];
			const column = columnRefs.current[index];
			if (!column) continue;

			const columnRect = column.getBoundingClientRect();
			points.push({
				period: month.period,
				x: columnRect.left + columnRect.width / 2 - trackRect.left,
				y: amountToChartY(resolveChartAmount(month), minAmount, maxAmount),
			});
		}

		setChartWidth(trackRect.width);
		setChartTop(chartRowTop);
		setChartPoints(points);
	}, [months]);

	useLayoutEffect(() => {
		measureChart();
		requestAnimationFrame(() => measureChart());
	}, [measureChart]);

	useEffect(() => {
		const track = trackRef.current;
		const scrollEl = scrollRef.current;
		if (!track) return;

		const resizeObserver = new ResizeObserver(() => measureChart());
		resizeObserver.observe(track);

		const handleScroll = () => measureChart();
		scrollEl?.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", measureChart);

		return () => {
			resizeObserver.disconnect();
			scrollEl?.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", measureChart);
		};
	}, [measureChart]);

	const scrollSelectedIntoView = useCallback(
		(behavior: ScrollBehavior = "auto") => {
			const node = itemRefs.current.get(selectedPeriod);
			if (!node) return;

			node.scrollIntoView({
				behavior,
				block: "nearest",
				inline: "center",
			});
		},
		[selectedPeriod],
	);

	useLayoutEffect(() => {
		scrollSelectedIntoView("auto");
		const frame = requestAnimationFrame(() => scrollSelectedIntoView("auto"));
		return () => cancelAnimationFrame(frame);
	}, [scrollSelectedIntoView, months, selectedPeriod]);

	/**
	 * Há ambiente que ignora rolagem suave por completo — "reduzir movimento"
	 * ligado, por exemplo — e aí o clique na seta não saía do lugar. Tenta suave
	 * e, se a posição não mudou, rola na hora.
	 */
	const scrollByOffset = (offset: number) => {
		const node = scrollRef.current;
		if (!node) return;

		const before = node.scrollLeft;
		node.scrollBy({ left: offset, behavior: "smooth" });

		window.setTimeout(() => {
			const current = scrollRef.current;
			if (!current || current.scrollLeft !== before) return;
			current.scrollBy({ left: offset, behavior: "auto" });
		}, 120);
	};

	return (
		<div className="relative isolate w-full">
			<div
				ref={scrollRef}
				className="relative z-0 w-full overflow-x-auto scrollbar-none"
			>
				<div
					ref={trackRef}
					className="relative flex w-max min-w-full items-stretch px-1 py-1"
				>
					{chartWidth > 0 && chartPoints.length > 0 ? (
						<svg
							className="pointer-events-none absolute left-0 z-20"
							style={{ top: chartTop, height: CHART_HEIGHT, width: chartWidth }}
							width={chartWidth}
							height={CHART_HEIGHT}
							viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
							aria-hidden
						>
							{chartPoints.length > 1
								? chartPoints.slice(0, -1).map((start, index) => {
										const end = chartPoints[index + 1];
										if (!end) return null;

										const endMonth = months[index + 1];
										const isFutureSegment =
											endMonth?.status === "future" &&
											endMonth.period !== selectedPeriod;

										return (
											<path
												key={`${start.period}-${end.period}`}
												d={buildCurveSegment(start, end)}
												fill="none"
												strokeWidth={2}
												strokeLinecap="round"
												className={cn(
													isAccountVariant
														? "stroke-primary"
														: STATUS_STROKE_CLASS[months[index].status],
													isFutureSegment && "opacity-35",
												)}
											/>
										);
									})
								: null}

							{chartPoints.map((point) => {
								const month = months.find(
									(entry) => entry.period === point.period,
								);
								if (!month) return null;

								const isSelected = month.period === selectedPeriod;
								const isFuture = month.status === "future";
								const dotRadius = isSelected ? 6 : 5;
								const ringRadius = isSelected ? 10 : 8;
								const balanceIsPositive = month.amount >= 0;

								return (
									<g
										key={point.period}
										className={cn(isFuture && !isSelected && "opacity-40")}
									>
										<circle
											cx={point.x}
											cy={point.y}
											r={ringRadius}
											fill="none"
											strokeWidth={6}
											className={
												isAccountVariant
													? balanceIsPositive
														? "stroke-emerald-600/15"
														: "stroke-destructive/15"
													: STATUS_DOT_RING_CLASS[month.status]
											}
										/>
										<circle
											cx={point.x}
											cy={point.y}
											r={dotRadius}
											className={cn(
												isAccountVariant
													? isFuture && !isSelected
														? "fill-muted-foreground/35"
														: balanceIsPositive
															? "fill-emerald-600"
															: "fill-destructive"
													: STATUS_DOT_FILL_CLASS[month.status],
												isFuture && !isAccountVariant && "fill-card",
											)}
										/>
									</g>
								);
							})}
						</svg>
					) : null}

					{months.map((month, index) => {
						const isSelected = month.period === selectedPeriod;
						const isFuture = month.status === "future";
						const monthIncomes = month.incomes ?? 0;
						const monthExpenses = month.expenses ?? 0;
						const monthBalance = month.amount;
						const periodLabel = formatShortPeriodLabel(month.period);
						/** Só vem preenchido na fatura paga em parte. */
						const paidAmount = month.paidAmount ?? null;
						const ariaLabel = isAccountVariant
							? `${periodLabel}: entradas ${formatCurrency(monthIncomes)}, saídas ${formatCurrency(monthExpenses)}, saldo ${formatCurrency(monthBalance)}`
							: paidAmount != null
								? `${periodLabel}: ${formatCurrency(paidAmount)} pagos de ${formatCurrency(month.amount)}`
								: `${periodLabel}: ${formatCurrency(month.amount)}`;

						return (
							<div
								key={month.period}
								ref={(node) => {
									columnRefs.current[index] = node;
								}}
								className={cn(
									"relative flex flex-1 basis-0 flex-col items-center px-0.5",
									isAccountVariant
										? "min-w-[7.25rem] sm:min-w-[8rem] md:min-w-[8.75rem]"
										: "min-w-[5.75rem] sm:min-w-[6.75rem] md:min-w-[7.5rem]",
									isFuture && !isSelected && "opacity-70",
								)}
							>
								<button
									ref={(node) => {
										if (node) {
											itemRefs.current.set(month.period, node);
										} else {
											itemRefs.current.delete(month.period);
										}
									}}
									type="button"
									disabled={isPending}
									onClick={() => onNavigate(month.period)}
									className={cn(
										// `h-full`: o mês pago em parte tem uma linha a mais, e sem
										// isto só o card dele cresce, deixando a fileira irregular.
										"relative z-10 flex h-full w-full flex-col items-center gap-0 rounded-lg border px-1 py-2 transition-colors",
										"border-border/70 hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										isFuture &&
											!isSelected &&
											"border-dashed border-border/45 bg-muted/20 hover:border-primary/25 hover:bg-muted/30",
										isSelected && "border-primary bg-primary/5 shadow-xs",
									)}
									aria-current={isSelected ? "date" : undefined}
									aria-label={ariaLabel}
								>
									<span
										className={cn(
											"mb-1 text-[0.6875rem] font-medium capitalize sm:text-xs",
											isSelected
												? "text-primary"
												: isFuture
													? "text-muted-foreground/55"
													: "text-muted-foreground",
										)}
									>
										{periodLabel}
									</span>

									<div
										className="relative h-10 w-full"
										data-chart-row
										aria-hidden
									/>

									{isAccountVariant ? (
										<div className="flex w-full flex-col gap-0.5 px-0.5">
											<div className="flex items-center justify-between gap-1 text-[0.625rem] leading-tight sm:text-[0.6875rem]">
												<span
													className={cn(
														"text-muted-foreground",
														isFuture &&
															!isSelected &&
															"text-muted-foreground/50",
													)}
												>
													Ent.
												</span>
												<span
													className={cn(
														"truncate font-medium tabular-nums text-success",
														isFuture && !isSelected && "text-success/45",
													)}
												>
													{formatCurrency(monthIncomes)}
												</span>
											</div>
											<div className="flex items-center justify-between gap-1 text-[0.625rem] leading-tight sm:text-[0.6875rem]">
												<span
													className={cn(
														"text-muted-foreground",
														isFuture &&
															!isSelected &&
															"text-muted-foreground/50",
													)}
												>
													Saí.
												</span>
												<span
													className={cn(
														"truncate font-medium tabular-nums text-destructive",
														isFuture && !isSelected && "text-destructive/45",
													)}
												>
													{formatCurrency(monthExpenses)}
												</span>
											</div>
											<div className="flex items-center justify-between gap-1 border-t border-border/50 pt-0.5 text-[0.6875rem] leading-tight sm:text-xs">
												<span
													className={cn(
														"text-muted-foreground",
														isFuture &&
															!isSelected &&
															"text-muted-foreground/50",
													)}
												>
													Saldo
												</span>
												<span
													className={cn(
														"truncate font-semibold tabular-nums",
														monthBalance < 0
															? isFuture && !isSelected
																? "text-destructive/45"
																: "text-destructive"
															: isSelected
																? "text-foreground"
																: isFuture
																	? "text-muted-foreground/55"
																	: "text-muted-foreground",
													)}
												>
													{formatCurrency(monthBalance)}
												</span>
											</div>
										</div>
									) : (
										<>
											<span
												className={cn(
													"max-w-full truncate text-[0.6875rem] tabular-nums sm:text-xs",
													isSelected
														? "font-semibold text-foreground"
														: isFuture
															? "font-medium text-muted-foreground/55"
															: "font-medium text-muted-foreground",
												)}
											>
												{formatCurrency(paidAmount ?? month.amount)}
											</span>
											{/* Fatura paga em parte: o número em destaque é o que
											    saiu da conta, e o total da fatura fica logo abaixo.
											    Sem isso o mês parecia pago por inteiro. */}
											{paidAmount != null ? (
												<span className="max-w-full truncate text-[0.625rem] text-muted-foreground tabular-nums">
													de {formatCurrency(month.amount)}
												</span>
											) : null}
										</>
									)}
								</button>
							</div>
						);
					})}
				</div>
			</div>

			<div
				className="pointer-events-none absolute inset-y-0 left-0 z-40 w-11 bg-gradient-to-r from-card from-50% via-card/90 to-transparent sm:w-12"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-y-0 right-0 z-40 w-11 bg-gradient-to-l from-card from-50% via-card/90 to-transparent sm:w-12"
				aria-hidden
			/>

			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				className="absolute top-1/2 left-1.5 z-50 size-9 -translate-y-1/2 rounded-full border border-border bg-card text-primary shadow-md hover:bg-accent/60 sm:left-2"
				onClick={() => scrollByOffset(-200)}
				aria-label="Rolar meses anteriores"
			>
				<RiArrowLeftSLine className="size-5" aria-hidden />
			</Button>

			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				className="absolute top-1/2 right-1.5 z-50 size-9 -translate-y-1/2 rounded-full border border-border bg-card text-primary shadow-md hover:bg-accent/60 sm:right-2"
				onClick={() => scrollByOffset(200)}
				aria-label="Rolar próximos meses"
			>
				<RiArrowRightSLine className="size-5" aria-hidden />
			</Button>
		</div>
	);
}

type StatementPeriodCalendarControlsProps = {
	className?: string;
};

export function StatementPeriodCalendarControls({
	className,
}: StatementPeriodCalendarControlsProps) {
	const { period, defaultPeriod, buildHref } = useMonthPeriod();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [isPickerOpen, setIsPickerOpen] = useState(false);

	const isDifferentFromCurrent = period !== defaultPeriod;

	const handleNavigate = (targetPeriod: string) => {
		setIsPickerOpen(false);
		startTransition(() => {
			router.replace(buildHref(targetPeriod), { scroll: false });
		});
	};

	const handleMonthSelect = (date: Date) => {
		handleNavigate(dateToPeriod(date));
	};

	return (
		<div
			className={cn("flex shrink-0 items-center justify-end gap-1", className)}
		>
			{isPending ? (
				<div className="flex size-8 items-center justify-center">
					<LoadingSpinner />
				</div>
			) : null}

			<Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={isPending}
						className="text-primary"
						aria-label="Abrir seletor de mês"
					>
						<RiCalendarLine className="size-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="end">
					<MonthPicker
						selectedMonth={periodToDate(period)}
						onMonthSelect={handleMonthSelect}
					/>
				</PopoverContent>
			</Popover>

			{isDifferentFromCurrent ? (
				<ReturnButton
					disabled={isPending}
					onClick={() => handleNavigate(defaultPeriod)}
				/>
			) : null}
		</div>
	);
}

type StatementPeriodToolbarPanelProps = {
	toolbarSlotId: string;
};

function StatementPeriodToolbarPanel({
	toolbarSlotId,
}: StatementPeriodToolbarPanelProps) {
	const mobileColumns = useMonthToolbarMobileColumns();
	const createSlotRef = useMonthToolbarSlotRef("create");
	const mobileActionsSlotRef = useMonthToolbarSlotRef("mobileActions");
	const filtersSlotRef = useMonthToolbarSlotRef("filters");
	const expandSlotRef = useMonthToolbarSlotRef("expand");
	const legacySlotRef = useMonthToolbarSlotRef("legacy");
	const endSlotRef = useMonthToolbarSlotRef("end");

	return (
		<div className={monthToolbarPanelClassName}>
			<div
				ref={createSlotRef}
				id={getMonthToolbarCreateSlotId(toolbarSlotId)}
				className="flex w-full min-w-0 empty:hidden md:h-full md:w-auto md:shrink-0 md:items-stretch md:self-stretch"
			/>

			<div
				ref={mobileActionsSlotRef}
				id={getMonthToolbarMobileActionsSlotId(toolbarSlotId)}
				className={cn(
					getMonthToolbarMobileActionsClassName(mobileColumns),
					"empty:hidden",
				)}
			/>

			<div
				ref={filtersSlotRef}
				id={getMonthToolbarFiltersSlotId(toolbarSlotId)}
				className="hidden min-w-0 flex-1 empty:hidden md:flex md:h-full md:items-stretch md:self-stretch"
			/>

			<div
				ref={expandSlotRef}
				id={getMonthToolbarExpandSlotId(toolbarSlotId)}
				className="empty:hidden md:hidden"
			/>

			{/* Slots legados para MonthNavigation em outras páginas */}
			<div
				ref={legacySlotRef}
				id={toolbarSlotId}
				className="hidden"
				aria-hidden
			/>
			<div
				ref={endSlotRef}
				id={getMonthToolbarEndSlotId(toolbarSlotId)}
				className="hidden"
				aria-hidden
			/>
		</div>
	);
}

export type StatementPeriodNavigationProps = {
	months?: PeriodCarouselMonth[];
	toolbarSlotId?: string;
	embedded?: boolean;
	hideCarousel?: boolean;
	hideCreateActions?: boolean;
	showCalendarControls?: boolean;
	carouselVariant?: PeriodCarouselVariant;
	title?: string;
	sticky?: boolean;
};

export function StatementPeriodNavigation({
	months = [],
	toolbarSlotId,
	embedded = false,
	hideCarousel = false,
	hideCreateActions = false,
	showCalendarControls = false,
	carouselVariant = "invoice",
	title,
	sticky = true,
}: StatementPeriodNavigationProps) {
	const { period, buildHref } = useMonthPeriod();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const handleNavigate = (targetPeriod: string) => {
		startTransition(() => {
			router.replace(buildHref(targetPeriod), { scroll: false });
		});
	};

	const showUnifiedToolbar =
		hideCarousel && toolbarSlotId && !hideCreateActions;

	const content = (
		<div
			className={cn(
				"flex w-full flex-col",
				showUnifiedToolbar ? "gap-0" : "gap-2.5 sm:gap-3",
			)}
		>
			{showUnifiedToolbar ? (
				<StatementPeriodToolbarPanel toolbarSlotId={toolbarSlotId} />
			) : null}

			{title ? (
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-sm font-semibold">{title}</h2>
					{showCalendarControls && !hideCarousel ? (
						<StatementPeriodCalendarControls />
					) : null}
				</div>
			) : showCalendarControls && !hideCarousel ? (
				<div className="-mb-0.5 flex items-center justify-end">
					<StatementPeriodCalendarControls />
				</div>
			) : null}

			{hideCarousel ? null : (
				<PeriodMonthCarousel
					months={months}
					selectedPeriod={period}
					onNavigate={handleNavigate}
					isPending={isPending}
					variant={carouselVariant}
				/>
			)}
		</div>
	);

	if (embedded) {
		return (
			<div className="flex w-full flex-col gap-0 px-3 py-2 sm:px-4">
				{content}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex w-full flex-col gap-0 bg-card",
				sticky
					? "sticky top-18 z-10 border border-transparent px-3 py-3 shadow-xs backdrop-blur-md supports-backdrop-filter:bg-card/60 sm:px-4 dark:border-border"
					: "rounded-lg border border-border px-3 py-3 shadow-xs transition-colors duration-200 hover:border-primary/50 sm:px-4",
			)}
		>
			{content}
		</div>
	);
}
