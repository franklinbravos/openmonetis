"use client";

import { RiAddFill, RiCheckLine, RiExpandUpDownLine } from "@remixicon/react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/shared/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { cn } from "@/shared/utils/ui";
import { CategorySelectContent } from "../../select-items";
import type { SelectOption } from "../../types";

type CategoryGroup = {
	label: string;
	options: SelectOption[];
};

type CategorySearchSelectProps = {
	id?: string;
	value: string;
	onValueChange: (value: string) => void;
	categoryGroups: CategoryGroup[];
	categoryOptions: SelectOption[];
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	placeholder?: string;
	triggerExtra?: React.ReactNode;
	onCreateCategory?: () => void;
	disabled?: boolean;
	triggerClassName?: string;
	enableCategoryTabFlow?: boolean;
};

const IMPORT_REVIEW_CATEGORY_SELECTOR = "[data-import-review-category]";

function scrollImportReviewCategoryIntoView(element: HTMLElement) {
	const card = element.closest("article");
	const target = card instanceof HTMLElement ? card : element;
	target.scrollIntoView({
		behavior: "smooth",
		block: "center",
		inline: "nearest",
	});
}

function focusAdjacentImportReviewCategory(
	current: HTMLElement,
	direction: 1 | -1,
) {
	const triggers = Array.from(
		document.querySelectorAll<HTMLElement>(IMPORT_REVIEW_CATEGORY_SELECTOR),
	);
	const currentIndex = triggers.indexOf(current);
	if (currentIndex === -1) return false;

	const next = triggers[currentIndex + direction];
	if (!next) return false;

	next.focus({ preventScroll: true });
	scrollImportReviewCategoryIntoView(next);
	return true;
}

const getCategorySearchValue = (option: SelectOption) =>
	[option.label, option.categoryPath, option.value].filter(Boolean).join(" ");

function isCategoryTypeaheadKey(event: React.KeyboardEvent) {
	if (event.ctrlKey || event.metaKey || event.altKey) return false;
	return event.key.length === 1;
}

function syncCommandSearchInput(input: HTMLInputElement, nextValue: string) {
	const descriptor = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	);
	descriptor?.set?.call(input, nextValue);
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.focus({ preventScroll: true });
	const cursor = nextValue.length;
	input.setSelectionRange(cursor, cursor);
}

export function CategorySearchSelect({
	id,
	value,
	onValueChange,
	categoryGroups,
	categoryOptions,
	open,
	onOpenChange,
	placeholder = "Selecione",
	triggerExtra,
	onCreateCategory,
	disabled,
	triggerClassName,
	enableCategoryTabFlow = false,
}: CategorySearchSelectProps) {
	const [searchValue, setSearchValue] = useState("");
	const [internalOpen, setInternalOpen] = useState(false);
	const popoverContentRef = useRef<HTMLDivElement>(null);
	const pendingTypeaheadRef = useRef("");
	const shouldFocusSearchOnOpenRef = useRef(false);
	const isOpenControlled = open !== undefined;
	const popoverOpen = isOpenControlled ? open : internalOpen;
	const selectedOption = categoryOptions.find(
		(option) => option.value === value,
	);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setSearchValue("");
			pendingTypeaheadRef.current = "";
			shouldFocusSearchOnOpenRef.current = false;
		} else {
			shouldFocusSearchOnOpenRef.current = true;
		}
		if (!isOpenControlled) {
			setInternalOpen(nextOpen);
		}
		onOpenChange?.(nextOpen);
	};

	const handleSelect = (optionValue: string) => {
		onValueChange(optionValue);
		handleOpenChange(false);
	};

	const openSearch = (initialSearch = "") => {
		pendingTypeaheadRef.current = initialSearch;
		setSearchValue(initialSearch);
		shouldFocusSearchOnOpenRef.current = true;
		handleOpenChange(true);
	};

	const focusSearchInput = (initialSearch: string) => {
		const input = popoverContentRef.current?.querySelector(
			"[data-slot=command-input]",
		);
		if (!(input instanceof HTMLInputElement)) {
			return false;
		}

		setSearchValue(initialSearch);
		syncCommandSearchInput(input, initialSearch);
		return true;
	};

	useLayoutEffect(() => {
		if (!popoverOpen || !shouldFocusSearchOnOpenRef.current) return;

		shouldFocusSearchOnOpenRef.current = false;
		const initialSearch = pendingTypeaheadRef.current;
		pendingTypeaheadRef.current = "";

		if (!focusSearchInput(initialSearch)) {
			requestAnimationFrame(() => {
				focusSearchInput(initialSearch);
			});
		}
	}, [popoverOpen]);

	return (
		<Popover open={popoverOpen} onOpenChange={handleOpenChange} modal>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={popoverOpen}
					disabled={disabled}
					{...(enableCategoryTabFlow
						? { "data-import-review-category": "" }
						: {})}
					onKeyDown={(event) => {
						if (enableCategoryTabFlow && !popoverOpen && event.key === "Tab") {
							const moved = focusAdjacentImportReviewCategory(
								event.currentTarget,
								event.shiftKey ? -1 : 1,
							);
							if (moved) {
								event.preventDefault();
							}
							return;
						}

						if (popoverOpen) {
							if (isCategoryTypeaheadKey(event)) {
								event.preventDefault();
								const nextSearch = searchValue + event.key;
								setSearchValue(nextSearch);
								focusSearchInput(nextSearch);
								return;
							}

							if (event.key === "Backspace") {
								event.preventDefault();
								const nextSearch = searchValue.slice(0, -1);
								setSearchValue(nextSearch);
								focusSearchInput(nextSearch);
							}
							return;
						}

						if (isCategoryTypeaheadKey(event)) {
							event.preventDefault();
							openSearch(event.key);
							return;
						}

						if (
							event.key === "ArrowDown" ||
							event.key === "Enter" ||
							event.key === " "
						) {
							event.preventDefault();
							openSearch();
						}
					}}
					className={cn(
						"h-9 w-full justify-between border-input bg-transparent px-3 py-2 font-normal shadow-none hover:bg-transparent",
						!selectedOption && "text-muted-foreground",
						triggerClassName,
					)}
				>
					<span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">
						{selectedOption ? (
							<>
								<CategorySelectContent
									label={selectedOption.label}
									icon={selectedOption.icon}
									depth={selectedOption.categoryDepth}
									pathLabel={selectedOption.categoryPath}
								/>
								{triggerExtra}
							</>
						) : (
							placeholder
						)}
					</span>
					<RiExpandUpDownLine
						className="ml-2 size-4 shrink-0 opacity-50"
						aria-hidden
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				ref={popoverContentRef}
				className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0"
				align="start"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
				}}
			>
				<Command shouldFilter>
					<CommandInput
						placeholder="Buscar categoria..."
						value={searchValue}
						onValueChange={setSearchValue}
					/>
					<CommandList className="overscroll-contain">
						<CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
						{categoryGroups.map((group) => (
							<CommandGroup key={group.label} heading={group.label}>
								{group.options.map((option) => {
									const isSelected = option.value === value;

									return (
										<CommandItem
											key={option.value}
											value={getCategorySearchValue(option)}
											onSelect={() => handleSelect(option.value)}
											className="gap-2"
										>
											<CategorySelectContent
												label={option.label}
												icon={option.icon}
												depth={option.categoryDepth}
												pathLabel={option.categoryPath}
											/>
											{isSelected ? (
												<RiCheckLine
													className="ml-auto size-4 shrink-0"
													aria-hidden
												/>
											) : null}
										</CommandItem>
									);
								})}
							</CommandGroup>
						))}
						{onCreateCategory ? (
							<>
								<CommandSeparator />
								<div className="p-1">
									<button
										type="button"
										className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-primary text-sm hover:bg-accent"
										onClick={() => {
											handleOpenChange(false);
											requestAnimationFrame(() => {
												onCreateCategory();
											});
										}}
									>
										<RiAddFill className="size-4" />
										Nova categoria
									</button>
								</div>
							</>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
