"use client";

import { RiCheckLine, RiExpandUpDownLine } from "@remixicon/react";
import { useMemo, useState } from "react";
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
import type { ListedProviderModel } from "@/shared/lib/ai/list-provider-models";
import { cn } from "@/shared/utils/ui";

interface ModelSearchComboboxProps {
	id?: string;
	value: string;
	models: ListedProviderModel[];
	placeholder?: string;
	disabled?: boolean;
	onValueChange: (value: string) => void;
	className?: string;
}

function formatModelLabel(model: ListedProviderModel) {
	return model.id === "gpt-5.5" ? `${model.name} (Recomendado)` : model.name;
}

function FreeModelBadge({ className }: { className?: string }) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"shrink-0 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400",
				className,
			)}
		>
			Grátis
		</Badge>
	);
}

function ModelOptionRow({
	model,
	isSelected,
}: {
	model: ListedProviderModel;
	isSelected: boolean;
}) {
	return (
		<>
			<RiCheckLine
				className={cn(
					"mr-2 size-4 shrink-0",
					isSelected ? "opacity-100" : "opacity-0",
				)}
			/>
			<span className="min-w-0 flex-1 truncate">{formatModelLabel(model)}</span>
			{model.isFreeTier ? <FreeModelBadge /> : null}
		</>
	);
}

export function ModelSearchCombobox({
	id,
	value,
	models,
	placeholder = "Selecione um modelo",
	disabled,
	onValueChange,
	className,
}: ModelSearchComboboxProps) {
	const [open, setOpen] = useState(false);
	const selectedModel = models.find((model) => model.id === value);

	const { freeModels, paidModels } = useMemo(() => {
		const free = models.filter((model) => model.isFreeTier);
		const paid = models.filter((model) => !model.isFreeTier);
		return { freeModels: free, paidModels: paid };
	}, [models]);

	const hasFreeGroup = freeModels.length > 0;

	return (
		<Popover open={open} onOpenChange={setOpen} modal>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"h-9 w-full justify-between border-border/70 bg-background font-normal shadow-none",
						!selectedModel && "text-muted-foreground",
						className,
					)}
				>
					<span className="flex min-w-0 items-center gap-2">
						<span className="truncate">
							{selectedModel ? formatModelLabel(selectedModel) : placeholder}
						</span>
						{selectedModel?.isFreeTier ? <FreeModelBadge /> : null}
					</span>
					<RiExpandUpDownLine className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[var(--radix-popover-trigger-width)] p-0"
				align="start"
			>
				<Command>
					<CommandInput placeholder="Buscar modelo..." />
					<CommandList>
						<CommandEmpty>Nenhum modelo encontrado.</CommandEmpty>
						{hasFreeGroup ? (
							<>
								<CommandGroup heading="Modelos gratuitos">
									{freeModels.map((model) => (
										<CommandItem
											key={model.id}
											value={`${model.id} ${model.name} grátis free`}
											onSelect={() => {
												onValueChange(model.id);
												setOpen(false);
											}}
											className="gap-2"
										>
											<ModelOptionRow
												model={model}
												isSelected={value === model.id}
											/>
										</CommandItem>
									))}
								</CommandGroup>
								<CommandGroup heading="Demais modelos">
									{paidModels.map((model) => (
										<CommandItem
											key={model.id}
											value={`${model.id} ${model.name}`}
											onSelect={() => {
												onValueChange(model.id);
												setOpen(false);
											}}
											className="gap-2"
										>
											<ModelOptionRow
												model={model}
												isSelected={value === model.id}
											/>
										</CommandItem>
									))}
								</CommandGroup>
							</>
						) : (
							<CommandGroup>
								{models.map((model) => (
									<CommandItem
										key={model.id}
										value={`${model.id} ${model.name}`}
										onSelect={() => {
											onValueChange(model.id);
											setOpen(false);
										}}
										className="gap-2"
									>
										<ModelOptionRow
											model={model}
											isSelected={value === model.id}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
