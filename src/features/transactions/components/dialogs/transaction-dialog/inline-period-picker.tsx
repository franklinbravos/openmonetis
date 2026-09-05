"use client";

import { useState } from "react";
import { MonthPicker } from "@/shared/components/ui/month-picker";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
	dateToPeriod,
	displayPeriod,
	periodToDate,
} from "@/shared/utils/period";

type InlinePeriodPickerProps = {
	period: string;
	onPeriodChange: (value: string) => void;
};

export function InlinePeriodPicker({
	period,
	onPeriodChange,
}: InlinePeriodPickerProps) {
	const [open, setOpen] = useState(false);

	return (
		<div>
			<span className="text-xs text-muted-foreground">Fatura de </span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="cursor-pointer text-xs text-primary underline-offset-2 hover:underline lowercase"
					>
						{displayPeriod(period)}
					</button>
				</PopoverTrigger>
				<PopoverContent
					className="w-auto p-0"
					align="start"
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					<MonthPicker
						key={period}
						selectedMonth={periodToDate(period)}
						onMonthSelect={(date) => {
							const nextPeriod = dateToPeriod(date);
							if (nextPeriod !== period) {
								onPeriodChange(nextPeriod);
							}
							setOpen(false);
						}}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
