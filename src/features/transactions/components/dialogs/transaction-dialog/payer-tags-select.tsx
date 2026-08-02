"use client";

import { RiCloseLine, RiExpandUpDownLine } from "@remixicon/react";
import { useMemo, useState } from "react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/shared/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { getAvatarSrc } from "@/shared/lib/payers/utils";
import { cn } from "@/shared/utils/ui";
import { PayerSelectContent } from "../../select-items";

type PayerOption = {
	value: string;
	label: string;
	avatarUrl?: string | null;
};

type PayerTagsSelectProps = {
	id?: string;
	options: PayerOption[];
	selectedIds: string[];
	onChange: (selectedIds: string[]) => void;
	placeholder?: string;
};

function PayerTag({
	label,
	avatarUrl,
	onRemove,
}: {
	label: string;
	avatarUrl?: string | null;
	onRemove: () => void;
}) {
	const initial = label.charAt(0).toUpperCase() || "?";

	return (
		<Badge
			variant="secondary"
			className="gap-1 border border-border/70 bg-background py-1 pr-1 pl-1.5 font-normal text-foreground"
		>
			<Avatar className="size-5 border border-border/60 bg-background">
				<AvatarImage src={getAvatarSrc(avatarUrl)} alt={`Avatar de ${label}`} />
				<AvatarFallback className="text-[0.55rem] font-medium uppercase">
					{initial}
				</AvatarFallback>
			</Avatar>
			<span className="max-w-[9rem] truncate">{label}</span>
			<button
				type="button"
				onClick={onRemove}
				className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={`Remover ${label}`}
			>
				<RiCloseLine className="size-3" aria-hidden />
			</button>
		</Badge>
	);
}

export function PayerTagsSelect({
	id,
	options,
	selectedIds,
	onChange,
	placeholder = "Adicionar pessoa",
}: PayerTagsSelectProps) {
	const [open, setOpen] = useState(false);
	const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

	const selectedOptions = useMemo(
		() =>
			selectedIds
				.map((value) => options.find((option) => option.value === value))
				.filter(Boolean) as PayerOption[],
		[options, selectedIds],
	);

	const availableOptions = useMemo(
		() => options.filter((option) => !selectedSet.has(option.value)),
		[options, selectedSet],
	);

	const addPayer = (value: string) => {
		if (selectedSet.has(value)) return;
		onChange([...selectedIds, value]);
	};

	const removePayer = (value: string) => {
		onChange(selectedIds.filter((id) => id !== value));
	};

	return (
		<Popover open={open} onOpenChange={setOpen} modal>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className={cn(
						"h-auto min-h-9 w-full justify-between px-2 py-1.5 font-normal",
						selectedOptions.length === 0 && "text-muted-foreground",
					)}
				>
					<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-left">
						{selectedOptions.length === 0 ? (
							<span className="px-1 text-sm">{placeholder}</span>
						) : (
							selectedOptions.map((option) => (
								<span
									key={option.value}
									role="group"
									onMouseDown={(event) => event.stopPropagation()}
								>
									<PayerTag
										label={option.label}
										avatarUrl={option.avatarUrl}
										onRemove={() => removePayer(option.value)}
									/>
								</span>
							))
						)}
					</span>
					<RiExpandUpDownLine
						className="ml-2 size-4 shrink-0 opacity-50"
						aria-hidden
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[var(--radix-popover-trigger-width)] p-0"
			>
				<Command>
					<CommandInput placeholder="Buscar pessoa..." />
					<CommandList>
						<CommandEmpty>Nenhuma pessoa encontrada.</CommandEmpty>
						<CommandGroup>
							{availableOptions.map((option) => (
								<CommandItem
									key={option.value}
									value={`${option.value} ${option.label}`}
									onSelect={() => {
										addPayer(option.value);
										setOpen(false);
									}}
									className="gap-2"
								>
									<PayerSelectContent
										label={option.label}
										avatarUrl={option.avatarUrl}
									/>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
