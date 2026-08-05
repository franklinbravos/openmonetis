"use client";

import { RiArrowDropDownLine, RiCalendarLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { MonthPicker } from "@/shared/components/ui/month-picker";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
	dateToPeriod,
	getNextPeriod,
	getPreviousPeriod,
	periodToDate,
} from "@/shared/utils/period";
import LoadingSpinner from "./loading-spinner";
import NavigationButton from "./nav-button";
import ReturnButton from "./return-button";
import { useMonthPeriod } from "./use-month-period";

const getToolbarExpandSlotId = (toolbarSlotId: string) =>
	`${toolbarSlotId}-expand`;

const getToolbarEndSlotId = (toolbarSlotId: string) => `${toolbarSlotId}-end`;

type MonthNavigationProps = {
	toolbarSlotId?: string;
	embedded?: boolean;
};

export default function MonthNavigation({
	toolbarSlotId,
	embedded = false,
}: MonthNavigationProps = {}) {
	const { period, currentMonth, currentYear, defaultPeriod, buildHref } =
		useMonthPeriod();

	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [isPickerOpen, setIsPickerOpen] = useState(false);

	const currentMonthLabel = `${currentMonth.charAt(0).toUpperCase()}${currentMonth.slice(1)} ${currentYear}`;
	const prevTarget = buildHref(getPreviousPeriod(period));
	const nextTarget = buildHref(getNextPeriod(period));
	const returnTarget = buildHref(defaultPeriod);
	const isDifferentFromCurrent = period !== defaultPeriod;

	useEffect(() => {
		router.prefetch(prevTarget);
		router.prefetch(nextTarget);
		if (isDifferentFromCurrent) {
			router.prefetch(returnTarget);
		}
	}, [router, prevTarget, nextTarget, returnTarget, isDifferentFromCurrent]);

	const handleNavigate = (href: string) => {
		setIsPickerOpen(false);
		startTransition(() => {
			router.replace(href, { scroll: false });
		});
	};

	const handleMonthSelect = (date: Date) => {
		handleNavigate(buildHref(dateToPeriod(date)));
	};

	const content = (
		<>
			<div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2">
				{toolbarSlotId ? (
					<div
						id={toolbarSlotId}
						className="flex min-w-0 items-center justify-start gap-1 md:hidden"
					/>
				) : (
					<div aria-hidden />
				)}

				<div className="flex min-w-0 items-center justify-center">
					<NavigationButton
						direction="left"
						disabled={isPending}
						onClick={() => handleNavigate(prevTarget)}
					/>

					<Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={isPending}
								className="min-w-0 gap-1 px-1.5 font-semibold"
								aria-current={!isDifferentFromCurrent ? "date" : undefined}
								aria-label={`Selecionar período. Período atual: ${currentMonthLabel}`}
							>
								{isPending ? (
									<LoadingSpinner />
								) : (
									<RiCalendarLine className="size-4 text-primary" />
								)}
								<span className="truncate capitalize">{currentMonthLabel}</span>
								<RiArrowDropDownLine
									className="size-4 text-muted-foreground/50"
									aria-hidden
								/>
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="center">
							<MonthPicker
								selectedMonth={periodToDate(period)}
								onMonthSelect={handleMonthSelect}
							/>
						</PopoverContent>
					</Popover>

					<NavigationButton
						direction="right"
						disabled={isPending}
						onClick={() => handleNavigate(nextTarget)}
					/>
				</div>

				<div className="flex items-center justify-end gap-1">
					{toolbarSlotId ? (
						<div
							id={getToolbarEndSlotId(toolbarSlotId)}
							className="flex items-center justify-end empty:hidden md:hidden"
						/>
					) : null}
					{isDifferentFromCurrent ? (
						<ReturnButton
							disabled={isPending}
							onClick={() => handleNavigate(returnTarget)}
						/>
					) : null}
				</div>
			</div>

			{toolbarSlotId ? (
				<div
					id={getToolbarExpandSlotId(toolbarSlotId)}
					className="empty:hidden md:hidden"
				/>
			) : null}
		</>
	);

	if (embedded) {
		return (
			<div className="flex w-full flex-col gap-0 px-3 py-2.5 sm:px-4 sm:py-3">
				{content}
			</div>
		);
	}

	return (
		<Card className="sticky top-18 z-10 flex w-full flex-col gap-0 px-3 py-3 backdrop-blur-md supports-backdrop-filter:bg-card/60 sm:px-4">
			{content}
		</Card>
	);
}
