"use client";

import { RiSearchLine } from "@remixicon/react";
import { useMemo, useState } from "react";
import { CategoryIcon } from "@/features/categories/components/category-icon";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { CATEGORY_ICON_GROUPS } from "@/shared/lib/categories/icons";
import {
	formatRemixIconLabel,
	getAllRemixLineIconNames,
	resolveIconName,
} from "@/shared/utils/icons";
import { cn } from "@/shared/utils/ui";

interface CategoryPickerDialogProps {
	open: boolean;
	value: string;
	onOpenChange: (open: boolean) => void;
	onSelect: (icon: string) => void;
}

const FULL_CATALOG_PAGE_SIZE = 96;

type PickerIconOption = {
	label: string;
	value: string;
};

function normalizeSearchValue(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim();
}

function matchesIconSearch(
	option: PickerIconOption,
	query: string,
	groupLabel?: string,
): boolean {
	if (!query) return true;

	const normalizedQuery = normalizeSearchValue(query);
	const iconLabel = normalizeSearchValue(option.label);
	const iconValue = normalizeSearchValue(
		option.value.replace(/^Ri/, "").replace(/Line$/, ""),
	);
	const group = groupLabel ? normalizeSearchValue(groupLabel) : "";

	return (
		iconLabel.includes(normalizedQuery) ||
		iconValue.includes(normalizedQuery) ||
		group.includes(normalizedQuery)
	);
}

function IconPickerButton({
	option,
	selected,
	onSelect,
}: {
	option: PickerIconOption;
	selected: boolean;
	onSelect: (icon: string) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onSelect(option.value)}
			onPointerDown={(event) => event.stopPropagation()}
			aria-label={option.label}
			aria-pressed={selected}
			title={option.label}
			className={cn(
				"flex size-10 items-center justify-center rounded-lg border transition-all hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				selected
					? "border-primary bg-primary/10 text-primary"
					: "border-border text-muted-foreground hover:text-primary",
			)}
		>
			<CategoryIcon name={option.value} className="size-5" />
		</button>
	);
}

export function CategoryPickerDialog({
	open,
	value,
	onOpenChange,
	onSelect,
}: CategoryPickerDialogProps) {
	const [search, setSearch] = useState("");
	const [showFullCatalog, setShowFullCatalog] = useState(false);
	const [fullCatalogLimit, setFullCatalogLimit] = useState(
		FULL_CATALOG_PAGE_SIZE,
	);

	const resolvedValue = value ? resolveIconName(value) : "";

	const handleOpenChange = (isOpen: boolean) => {
		if (!isOpen) {
			setSearch("");
			setShowFullCatalog(false);
			setFullCatalogLimit(FULL_CATALOG_PAGE_SIZE);
		}
		onOpenChange(isOpen);
	};

	const filteredGroups = useMemo(() => {
		const query = search.trim();
		if (!query) return CATEGORY_ICON_GROUPS;

		return CATEGORY_ICON_GROUPS.flatMap((group) => {
			const icons = group.icons.filter((icon) =>
				matchesIconSearch(icon, query, group.label),
			);
			return icons.length > 0 ? [{ ...group, icons }] : [];
		});
	}, [search]);

	const curatedMatches = useMemo(
		() =>
			filteredGroups.reduce((total, group) => total + group.icons.length, 0),
		[filteredGroups],
	);

	const fullCatalogMatches = useMemo(() => {
		const query = search.trim();
		if (!showFullCatalog && (!query || curatedMatches > 0)) {
			return [] as PickerIconOption[];
		}

		return getAllRemixLineIconNames()
			.map((iconName) => ({
				value: iconName,
				label: formatRemixIconLabel(iconName),
			}))
			.filter((icon) => matchesIconSearch(icon, query));
	}, [curatedMatches, search, showFullCatalog]);

	const visibleFullCatalog = fullCatalogMatches.slice(0, fullCatalogLimit);
	const hasMoreFullCatalog = fullCatalogMatches.length > fullCatalogLimit;

	const handleSelect = (icon: string) => {
		onSelect(icon);
		handleOpenChange(false);
	};

	const showCuratedGroups = !showFullCatalog || search.trim().length === 0;
	const showFullCatalogGrid =
		showFullCatalog || (search.trim().length > 0 && curatedMatches === 0);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Escolher ícone</DialogTitle>
					<DialogDescription>
						Pesquise por nome ou explore o catálogo completo do Remix Icon.
					</DialogDescription>
				</DialogHeader>

				<div className="relative">
					<RiSearchLine
						className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden
					/>
					<Input
						type="search"
						placeholder="Pesquisar por nome ou tema (ex.: nuvem, bebê, carro)..."
						value={search}
						onChange={(event) => {
							setSearch(event.target.value);
							setFullCatalogLimit(FULL_CATALOG_PAGE_SIZE);
						}}
						className="h-9 pl-8 text-sm"
						autoFocus
					/>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
					<span>
						{showFullCatalogGrid
							? `${fullCatalogMatches.length} ícone${fullCatalogMatches.length !== 1 ? "s" : ""} no catálogo`
							: `${curatedMatches} ícone${curatedMatches !== 1 ? "s" : ""} sugerido${curatedMatches !== 1 ? "s" : ""}`}
					</span>
					<Button
						type="button"
						variant="link"
						size="sm"
						className="h-auto px-0 text-xs"
						onClick={() => {
							setShowFullCatalog((current) => !current);
							setFullCatalogLimit(FULL_CATALOG_PAGE_SIZE);
						}}
					>
						{showFullCatalog
							? "Mostrar apenas sugeridos"
							: "Ver catálogo completo"}
					</Button>
				</div>

				{showCuratedGroups && curatedMatches > 0 ? (
					<div className="flex max-h-96 flex-col gap-4 overflow-y-auto pr-1">
						{filteredGroups.map((group) => (
							<div key={group.label}>
								<p className="mb-2 text-xs text-muted-foreground">
									{group.label}
								</p>
								<div className="grid grid-cols-8 gap-1.5">
									{group.icons.map((option) => (
										<IconPickerButton
											key={option.value}
											option={option}
											selected={resolvedValue === resolveIconName(option.value)}
											onSelect={handleSelect}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				) : null}

				{showFullCatalogGrid ? (
					<div className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
						{visibleFullCatalog.length === 0 ? (
							<p className="py-4 text-center text-sm text-muted-foreground">
								Nenhum ícone encontrado para &ldquo;{search}&rdquo;
							</p>
						) : (
							<div className="grid grid-cols-8 gap-1.5">
								{visibleFullCatalog.map((option) => (
									<IconPickerButton
										key={option.value}
										option={option}
										selected={resolvedValue === option.value}
										onSelect={handleSelect}
									/>
								))}
							</div>
						)}

						{hasMoreFullCatalog ? (
							<div className="flex justify-center pb-1">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										setFullCatalogLimit(
											(current) => current + FULL_CATALOG_PAGE_SIZE,
										)
									}
								>
									Carregar mais ícones (
									{fullCatalogMatches.length - fullCatalogLimit} restantes)
								</Button>
							</div>
						) : null}
					</div>
				) : null}

				{!showFullCatalogGrid && curatedMatches === 0 ? (
					<p className="py-4 text-center text-sm text-muted-foreground">
						Nenhum ícone sugerido para &ldquo;{search}&rdquo;. Tente o catálogo
						completo.
					</p>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
