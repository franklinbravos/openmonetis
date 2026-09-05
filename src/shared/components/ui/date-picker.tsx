"use client";

import { RiCalendarLine } from "@remixicon/react";
import { ptBR } from "date-fns/locale";
import * as React from "react";

import { Button } from "@/shared/components/ui/button";
import { Calendar } from "@/shared/components/ui/calendar";
import { Input } from "@/shared/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
	parseFlexibleDateInput,
	parseLocalDateString,
	toLocalDateString,
} from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

function isValidDate(date: Date | undefined): date is Date {
	if (!date) {
		return false;
	}
	return !Number.isNaN(date.getTime());
}

function dateToYYYYMMDD(date: Date | undefined): string {
	return isValidDate(date) ? (toLocalDateString(date) ?? "") : "";
}

function parseYYYYMMDD(dateString: string): Date | undefined {
	if (!dateString) {
		return undefined;
	}

	const date = parseLocalDateString(dateString);
	return isValidDate(date) ? date : undefined;
}

function formatDatePickerDisplay(
	date: Date | undefined,
	compact = false,
): string {
	if (!isValidDate(date)) {
		return "";
	}

	if (compact) {
		return date
			.toLocaleDateString("pt-BR", {
				day: "numeric",
				month: "short",
			})
			.replace(".", "")
			.replace(" de ", " ");
	}

	return date.toLocaleDateString("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

function isCompleteDateInput(value: string): boolean {
	const trimmed = value.trim();
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
		/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed) ||
		/^\d{1,2}-\d{1,2}-\d{4}$/.test(trimmed)
	);
}

function commitParsedDate(
	raw: string,
	compact: boolean,
): {
	date: Date | undefined;
	displayValue: string;
	isoValue: string;
} {
	const isoValue = parseFlexibleDateInput(raw) ?? "";
	const date = isoValue ? parseYYYYMMDD(isoValue) : undefined;

	return {
		date,
		displayValue: formatDatePickerDisplay(date, compact),
		isoValue,
	};
}

export interface DatePickerProps {
	id?: string;
	value?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	className?: string;
	inputClassName?: string;
	/** Show compact format like "10 mar" instead of "10/03/2026" */
	compact?: boolean;
	/** Desativa focus trap modal — use dentro de Dialog para evitar loops de foco. */
	nested?: boolean;
}

export function DatePicker({
	id,
	value = "",
	onChange,
	placeholder = "Selecione uma data",
	required = false,
	disabled = false,
	className,
	inputClassName,
	compact = false,
	nested = false,
}: DatePickerProps) {
	const [open, setOpen] = React.useState(false);
	const [date, setDate] = React.useState<Date | undefined>(() =>
		parseYYYYMMDD(value),
	);
	const [month, setMonth] = React.useState<Date | undefined>(() =>
		parseYYYYMMDD(value),
	);
	const [displayValue, setDisplayValue] = React.useState(() =>
		formatDatePickerDisplay(parseYYYYMMDD(value), compact),
	);
	const isEditingRef = React.useRef(false);
	const fieldRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (isEditingRef.current) {
			return;
		}

		const newDate = parseYYYYMMDD(value);
		setDate(newDate);
		setMonth(newDate);
		setDisplayValue(formatDatePickerDisplay(newDate, compact));
	}, [value, compact]);

	const applyCommittedDate = React.useCallback(
		(raw: string) => {
			const committed = commitParsedDate(raw, compact);
			setDate(committed.date);
			setMonth(committed.date);
			setDisplayValue(committed.displayValue);
			if (committed.isoValue && committed.isoValue !== value) {
				onChange?.(committed.isoValue);
			}
		},
		[compact, onChange, value],
	);

	const openCalendar = React.useCallback(() => {
		if (!disabled) {
			setOpen(true);
		}
	}, [disabled]);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputValue = e.target.value;
		setDisplayValue(inputValue);

		if (isCompleteDateInput(inputValue)) {
			applyCommittedDate(inputValue);
		}
	};

	const commitInputBlur = React.useCallback(() => {
		isEditingRef.current = false;

		const trimmed = displayValue.trim();
		if (!trimmed) {
			setDate(undefined);
			setMonth(undefined);
			setDisplayValue("");
			onChange?.("");
			return;
		}

		const isoValue = parseFlexibleDateInput(trimmed);
		if (isoValue) {
			applyCommittedDate(trimmed);
			return;
		}

		setDisplayValue(formatDatePickerDisplay(date, compact));
	}, [applyCommittedDate, compact, date, displayValue, onChange]);

	const handleInputBlur = () => {
		window.setTimeout(() => {
			if (fieldRef.current?.contains(document.activeElement)) {
				return;
			}

			commitInputBlur();
		}, 0);
	};

	const handleInputFocus = () => {
		isEditingRef.current = true;
	};

	const handleInputClick = () => {
		openCalendar();
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			openCalendar();
		}

		if (e.key === "Escape") {
			setOpen(false);
		}

		if (e.key === "Enter") {
			e.currentTarget.blur();
		}
	};

	const handleCalendarSelect = (selectedDate: Date | undefined) => {
		const nextValue = dateToYYYYMMDD(selectedDate);
		setDate(selectedDate);
		setMonth(selectedDate);
		setDisplayValue(formatDatePickerDisplay(selectedDate, compact));
		if (nextValue !== value) {
			onChange?.(nextValue);
		}
		setOpen(false);
		isEditingRef.current = false;
	};

	const preventFieldDismiss = (target: EventTarget | null) =>
		target instanceof Node && fieldRef.current?.contains(target);

	return (
		<div ref={fieldRef} className={cn("relative flex gap-2", className)}>
			<Input
				id={id}
				value={displayValue}
				placeholder={placeholder}
				className={cn("bg-background pr-10", inputClassName)}
				onChange={handleInputChange}
				onFocus={handleInputFocus}
				onClick={handleInputClick}
				onBlur={handleInputBlur}
				onKeyDown={handleInputKeyDown}
				required={required}
				disabled={disabled}
				inputMode="numeric"
			/>
			<Popover modal={!nested} open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						disabled={disabled}
						className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
						aria-label="Abrir calendário"
					>
						<RiCalendarLine className="size-3.5" />
						<span className="sr-only">Selecionar data</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="w-auto overflow-hidden p-0"
					align="end"
					alignOffset={-8}
					sideOffset={10}
					onOpenAutoFocus={(event) => event.preventDefault()}
					onCloseAutoFocus={(event) => event.preventDefault()}
					onMouseDown={(event) => event.preventDefault()}
					onPointerDownOutside={(event) => {
						if (preventFieldDismiss(event.target)) {
							event.preventDefault();
						}
					}}
					onFocusOutside={(event) => {
						if (preventFieldDismiss(event.target)) {
							event.preventDefault();
						}
					}}
				>
					<Calendar
						mode="single"
						selected={date}
						captionLayout="dropdown"
						month={month}
						onMonthChange={setMonth}
						onSelect={handleCalendarSelect}
						startMonth={new Date(2020, 0)}
						endMonth={new Date(new Date().getFullYear() + 10, 11)}
						locale={ptBR}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
