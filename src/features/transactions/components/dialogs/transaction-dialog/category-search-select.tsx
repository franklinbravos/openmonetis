"use client";

import { RiAddFill, RiCheckLine, RiExpandUpDownLine } from "@remixicon/react";
import { useState } from "react";
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
};

const getCategorySearchValue = (option: SelectOption) =>
	[option.label, option.categoryPath, option.value].filter(Boolean).join(" ");

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
}: CategorySearchSelectProps) {
	const [searchValue, setSearchValue] = useState("");
	const [internalOpen, setInternalOpen] = useState(false);
	const isOpenControlled = open !== undefined;
	const popoverOpen = isOpenControlled ? open : internalOpen;
	const selectedOption = categoryOptions.find(
		(option) => option.value === value,
	);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setSearchValue("");
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

	return (
		<Popover open={popoverOpen} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={popoverOpen}
					disabled={disabled}
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
				className="w-[var(--radix-popover-trigger-width)] p-0"
				align="start"
			>
				<Command shouldFilter>
					<CommandInput
						placeholder="Buscar categoria..."
						value={searchValue}
						onValueChange={setSearchValue}
					/>
					<CommandList>
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
