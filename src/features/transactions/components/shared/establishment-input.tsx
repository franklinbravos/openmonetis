"use client";

import { RiSearchLine } from "@remixicon/react";
import * as React from "react";

import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/shared/components/ui/command";
import { Input } from "@/shared/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";

interface EstablishmentInputProps {
	id?: string;
	value: string;
	onChange: (value: string) => void;
	estabelecimentos: string[];
	placeholder?: string;
	required?: boolean;
	maxLength?: number;
}

function resolveAutocompleteMatch(
	query: string,
	suggestions: string[],
): string | null {
	const trimmed = query.trim();
	if (!trimmed || suggestions.length === 0) {
		return null;
	}

	const lowerQuery = trimmed.toLowerCase();

	const exactMatch = suggestions.find(
		(item) => item.toLowerCase() === lowerQuery,
	);
	if (exactMatch) {
		return exactMatch;
	}

	const prefixMatch = suggestions.find((item) =>
		item.toLowerCase().startsWith(lowerQuery),
	);
	if (prefixMatch) {
		return prefixMatch;
	}

	return suggestions[0] ?? null;
}

export function EstablishmentInput({
	id,
	value,
	onChange,
	estabelecimentos = [],
	placeholder = "Ex.: Padaria, Transferência, Saldo inicial",
	required = false,
	maxLength = 20,
}: EstablishmentInputProps) {
	const [open, setOpen] = React.useState(false);
	const [searchValue, setSearchValue] = React.useState("");
	const [width, setWidth] = React.useState<number | undefined>();
	const containerRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!open || !containerRef.current) return;
		setWidth(containerRef.current.offsetWidth);
	}, [open]);

	const handleSelect = (selectedValue: string) => {
		onChange(selectedValue);
		setOpen(false);
		setSearchValue("");
	};

	const filteredEstabelecimentos = React.useMemo(() => {
		if (!searchValue) {
			return estabelecimentos;
		}

		const lowerSearch = searchValue.toLowerCase();
		return estabelecimentos
			.filter((item) => item.toLowerCase().includes(lowerSearch))
			.sort((left, right) => {
				const leftLower = left.toLowerCase();
				const rightLower = right.toLowerCase();
				const leftStarts = leftLower.startsWith(lowerSearch);
				const rightStarts = rightLower.startsWith(lowerSearch);

				if (leftStarts !== rightStarts) {
					return leftStarts ? -1 : 1;
				}

				if (leftLower === lowerSearch && rightLower !== lowerSearch) {
					return -1;
				}

				if (rightLower === lowerSearch && leftLower !== lowerSearch) {
					return 1;
				}

				return left.localeCompare(right, "pt-BR", { sensitivity: "base" });
			});
	}, [estabelecimentos, searchValue]);

	const hasSuggestions = filteredEstabelecimentos.length > 0;

	React.useEffect(() => {
		if (!hasSuggestions && open) {
			setOpen(false);
		}
	}, [hasSuggestions, open]);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		onChange(newValue);
		setSearchValue(newValue);

		if (newValue.length === 0 || estabelecimentos.length === 0) {
			setOpen(false);
			return;
		}

		const lowerSearch = newValue.toLowerCase();
		const hasMatches = estabelecimentos.some((item) =>
			item.toLowerCase().includes(lowerSearch),
		);
		setOpen(hasMatches);
	};

	const acceptSuggestedMatch = () => {
		const match = resolveAutocompleteMatch(
			value,
			filteredEstabelecimentos,
		);
		if (!match) {
			return false;
		}

		handleSelect(match);
		return true;
	};

	const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key !== "Enter" && e.key !== "Tab") {
			return;
		}

		if (!open || !hasSuggestions) {
			return;
		}

		const accepted = acceptSuggestedMatch();
		if (!accepted) {
			return;
		}

		if (e.key === "Enter") {
			e.preventDefault();
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen} modal>
			<PopoverTrigger asChild>
				<div ref={containerRef} className="relative w-full">
					<Input
						id={id}
						value={value}
						onChange={handleInputChange}
						onKeyDown={handleInputKeyDown}
						placeholder={placeholder}
						required={required}
						maxLength={maxLength}
						autoComplete="off"
						className={estabelecimentos.length > 0 ? "pr-8" : undefined}
					/>
					{estabelecimentos.length > 0 && (
						<RiSearchLine className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
					)}
				</div>
			</PopoverTrigger>
			{estabelecimentos.length > 0 && hasSuggestions ? (
				<PopoverContent
					className="p-0"
					style={width ? { width } : undefined}
					align="start"
					onOpenAutoFocus={(e) => e.preventDefault()}
				>
					<Command shouldFilter={false}>
						<CommandList className="max-h-[300px] overflow-y-auto">
							<CommandGroup className="p-1">
								{filteredEstabelecimentos.map((item, index) => (
									<CommandItem
										key={item}
										value={item}
										onSelect={() => handleSelect(item)}
										className={`cursor-pointer ${index === 0 ? "bg-accent" : ""}`}
									>
										<span
											className={`truncate flex-1 ${value === item ? "font-medium" : ""}`}
										>
											{item}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			) : null}
		</Popover>
	);
}
