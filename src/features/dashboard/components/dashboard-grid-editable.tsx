"use client";

import {
	closestCorners,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
	RiCheckLine,
	RiCloseLine,
	RiDragMove2Line,
	RiEyeOffLine,
	RiSettings4Line,
} from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { SortableWidget } from "@/features/dashboard/components/widgets/sortable-widget";
import { WidgetSettingsDialog } from "@/features/dashboard/components/widgets/widget-settings-dialog";
import type { DashboardData } from "@/features/dashboard/fetch-dashboard-data";
import {
	resetWidgetPreferences,
	updateWidgetPreferences,
	type WidgetPreferences,
} from "@/features/dashboard/widget-registry/widget-actions";
import {
	type DashboardWidgetQuickActionOptions,
	type WidgetConfig,
	widgetsConfig,
} from "@/features/dashboard/widget-registry/widget-config";
import { Button } from "@/shared/components/ui/button";
import { ExpandableWidgetCard } from "@/shared/components/widgets/expandable-widget-card";

type DashboardGridEditableProps = {
	data: DashboardData;
	period: string;
	initialPreferences: WidgetPreferences | null;
	quickActionOptions: DashboardWidgetQuickActionOptions;
};

const DEFAULT_WIDGET_ORDER = widgetsConfig.map((widget) => widget.id);

export function DashboardGridEditable({
	data,
	period,
	initialPreferences,
	quickActionOptions,
}: DashboardGridEditableProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [isPending, startTransition] = useTransition();

	// Initialize widget order and hidden state
	const [widgetOrder, setWidgetOrder] = useState<string[]>(
		initialPreferences?.order ?? DEFAULT_WIDGET_ORDER,
	);
	const [hiddenWidgets, setHiddenWidgets] = useState<string[]>(
		initialPreferences?.hidden ?? [],
	);
	const [myAccountsShowExcluded, setMyAccountsShowExcluded] = useState(
		initialPreferences?.myAccountsShowExcluded ?? true,
	);

	// Keep track of original state for cancel
	const [originalOrder, setOriginalOrder] = useState(widgetOrder);
	const [originalHidden, setOriginalHidden] = useState(hiddenWidgets);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Get ordered and visible widgets
	const orderedWidgets = useMemo(() => {
		// Create a map for quick lookup
		const widgetMap = new Map(widgetsConfig.map((w) => [w.id, w]));

		// Get widgets in order, filtering out hidden ones
		const ordered: WidgetConfig[] = [];
		for (const id of widgetOrder) {
			const widget = widgetMap.get(id);
			if (widget && !hiddenWidgets.includes(id)) {
				ordered.push(widget);
			}
		}

		// Add any new widgets that might not be in the order yet
		for (const widget of widgetsConfig) {
			if (
				!widgetOrder.includes(widget.id) &&
				!hiddenWidgets.includes(widget.id)
			) {
				ordered.push(widget);
			}
		}

		return ordered;
	}, [widgetOrder, hiddenWidgets]);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			setWidgetOrder((items) => {
				const oldIndex = items.indexOf(active.id as string);
				const newIndex = items.indexOf(over.id as string);
				return arrayMove(items, oldIndex, newIndex);
			});
		}
	};

	const handleToggleWidget = (widgetId: string) => {
		const newHidden = hiddenWidgets.includes(widgetId)
			? hiddenWidgets.filter((id) => id !== widgetId)
			: [...hiddenWidgets, widgetId];

		setHiddenWidgets(newHidden);
	};

	const handleHideWidget = (widgetId: string) => {
		setHiddenWidgets((prev) => [...prev, widgetId]);
	};

	const handleStartEditing = () => {
		setOriginalOrder(widgetOrder);
		setOriginalHidden(hiddenWidgets);
		setIsEditing(true);
	};

	const handleCancelEditing = () => {
		setWidgetOrder(originalOrder);
		setHiddenWidgets(originalHidden);
		setIsEditing(false);
	};

	const handleSave = () => {
		startTransition(async () => {
			const result = await updateWidgetPreferences({
				order: widgetOrder,
				hidden: hiddenWidgets,
			});

			if (result.success) {
				toast.success("Preferências salvas!");
				setIsEditing(false);
			} else {
				toast.error(result.error ?? "Erro ao salvar");
			}
		});
	};

	const handleReset = () => {
		startTransition(async () => {
			const result = await resetWidgetPreferences();

			if (result.success) {
				setWidgetOrder(DEFAULT_WIDGET_ORDER);
				setHiddenWidgets([]);
				setMyAccountsShowExcluded(true);
				setOriginalOrder(DEFAULT_WIDGET_ORDER);
				setOriginalHidden([]);
				toast.success("Preferências restauradas!");
			} else {
				toast.error(result.error ?? "Erro ao restaurar");
			}
		});
	};

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center justify-end gap-2">
				{isEditing ? (
					<>
						<WidgetSettingsDialog
							hiddenWidgets={hiddenWidgets}
							onToggleWidget={handleToggleWidget}
							onReset={handleReset}
							triggerLabel="Visibilidade"
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={handleCancelEditing}
							disabled={isPending}
							className="gap-2"
						>
							<RiCloseLine className="size-4" />
							Cancelar
						</Button>
						<Button
							size="sm"
							onClick={handleSave}
							disabled={isPending}
							className="gap-2"
						>
							<RiCheckLine className="size-4" />
							Salvar
						</Button>
					</>
				) : (
					<Button
						variant="outline"
						size="sm"
						onClick={handleStartEditing}
						className="w-full gap-2 sm:w-auto"
					>
						<RiSettings4Line className="size-4" />
						Personalizar
					</Button>
				)}
			</div>

			{/* Grid */}
			<DndContext
				sensors={sensors}
				collisionDetection={closestCorners}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={orderedWidgets.map((w) => w.id)}
					strategy={rectSortingStrategy}
				>
					<section className="grid grid-cols-1 gap-3 @4xl/main:grid-cols-2 @6xl/main:grid-cols-3">
						{orderedWidgets.map((widget) => (
							<SortableWidget
								key={widget.id}
								id={widget.id}
								isEditing={isEditing}
							>
								<div className="relative">
									{isEditing && (
										<div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[1.5px] rounded-lg border border-dashed border-primary flex items-center justify-center">
											<div className="flex flex-col items-center gap-2">
												<RiDragMove2Line className="size-8 text-primary" />
												<span className="text-xs font-medium">
													Arraste para mover
												</span>
												<Button
													variant="destructive"
													size="sm"
													onClick={(e) => {
														e.stopPropagation();
														handleHideWidget(widget.id);
													}}
													className="gap-1 mt-2"
												>
													<RiEyeOffLine className="size-4" />
													Ocultar
												</Button>
											</div>
										</div>
									)}
									<ExpandableWidgetCard
										title={widget.title}
										subtitle={widget.subtitle}
										icon={widget.icon}
										action={widget.action}
									>
										{widget.component({
											data,
											period,
											widgetPreferences: {
												order: widgetOrder,
												hidden: hiddenWidgets,
												myAccountsShowExcluded,
											},
											quickActionOptions,
											onMyAccountsShowExcludedChange: setMyAccountsShowExcluded,
										})}
									</ExpandableWidgetCard>
								</div>
							</SortableWidget>
						))}
					</section>
				</SortableContext>
			</DndContext>

			{/* Hidden widgets indicator */}
			{hiddenWidgets.length > 0 && !isEditing && (
				<p className="text-center text-sm text-muted-foreground">
					{hiddenWidgets.length} widget(s) oculto(s) •{" "}
					<button
						onClick={handleReset}
						className="text-primary hover:underline"
					>
						Restaurar todos
					</button>
				</p>
			)}
		</div>
	);
}
