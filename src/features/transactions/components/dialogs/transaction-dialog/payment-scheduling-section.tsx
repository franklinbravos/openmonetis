"use client";

import {
	RiCheckboxBlankCircleLine,
	RiCheckboxCircleFill,
	RiRepeatLine,
	RiStackLine,
} from "@remixicon/react";
import type { ReactNode } from "react";
import type { InstallmentAmountMode } from "@/features/transactions/lib/constants";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";
import type { PaymentMethodSectionProps } from "./transaction-dialog-types";

type SchedulingToggleProps = {
	title: string;
	description: string;
	active: boolean;
	onToggle: () => void;
	ariaLabel: string;
	icon: ReactNode;
	activeClassName: string;
	children?: ReactNode;
};

function SchedulingToggleCard({
	title,
	description,
	active,
	onToggle,
	ariaLabel,
	icon,
	activeClassName,
	children,
}: SchedulingToggleProps) {
	return (
		<div
			className={cn(
				"rounded-lg border transition-colors",
				active ? activeClassName : "border-border bg-transparent",
			)}
		>
			<button
				type="button"
				onClick={onToggle}
				aria-label={ariaLabel}
				aria-pressed={active}
				className={cn(
					"flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
					active
						? "hover:bg-current/5"
						: "hover:bg-muted/40",
				)}
			>
				<div className="flex min-w-0 items-start gap-2.5">
					<span
						className={cn(
							"mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
							active
								? "border-current/20 bg-current/10 text-current"
								: "border-border bg-muted/40 text-muted-foreground",
						)}
					>
						{icon}
					</span>
					<div className="min-w-0 text-left">
						<p className="text-sm text-foreground">{title}</p>
						<p className="text-xs text-muted-foreground">{description}</p>
					</div>
				</div>
				<span
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
						active
							? "bg-current/10 text-current"
							: "text-muted-foreground",
					)}
				>
					{active ? (
						<RiCheckboxCircleFill className="size-4" />
					) : (
						<RiCheckboxBlankCircleLine className="size-4" />
					)}
				</span>
			</button>
			{active && children ? (
				<div className="space-y-3 border-t border-border/60 px-3 py-3">
					{children}
				</div>
			) : null}
		</div>
	);
}

function InstallmentModeOption({
	label,
	description,
	selected,
	onSelect,
}: {
	label: string;
	description: string;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
				selected
					? "border-primary/30 bg-primary/5"
					: "border-border hover:bg-muted/40",
			)}
		>
			<span
				className={cn(
					"mt-0.5 size-3.5 shrink-0 rounded-full border",
					selected ? "border-primary bg-primary" : "border-muted-foreground/40",
				)}
				aria-hidden
			/>
			<span className="min-w-0">
				<span className="block text-sm text-foreground">{label}</span>
				<span className="block text-xs text-muted-foreground">
					{description}
				</span>
			</span>
		</button>
	);
}

export function PaymentSchedulingSection({
	formState,
	onFieldChange,
	recurringOnly = false,
	showRecurrenceDuration = false,
}: Pick<PaymentMethodSectionProps, "formState" | "onFieldChange"> & {
	recurringOnly?: boolean;
	showRecurrenceDuration?: boolean;
}) {
	const isRecurring = formState.condition === "Recorrente";
	const isInstallment = formState.condition === "Parcelado";
	const parsedAmount = Number(formState.amount);
	const amount =
		Number.isNaN(parsedAmount) || parsedAmount <= 0 ? null : parsedAmount;
	const installmentCount = Number(formState.installmentCount);

	const getInstallmentSummary = (count: number) => {
		if (!amount) return `${count}x`;

		if (formState.installmentAmountMode === "fixed") {
			return `${count}x de R$ ${formatCurrency(amount)} · total R$ ${formatCurrency(amount * count)}`;
		}

		return `${count}x de R$ ${formatCurrency(amount / count)}`;
	};

	const installmentSummary =
		isInstallment &&
		formState.installmentCount &&
		!Number.isNaN(installmentCount) &&
		installmentCount > 0
			? getInstallmentSummary(installmentCount)
			: null;

	const openRecurrenceValue = "__open__";
	const recurrenceSelectValue =
		formState.recurrenceCount || openRecurrenceValue;

	const setSchedulingMode = (mode: "none" | "recorrente" | "parcelado") => {
		if (mode === "none") {
			onFieldChange("condition", "À vista");
			return;
		}

		if (mode === "recorrente") {
			onFieldChange("condition", "Recorrente");
			onFieldChange("recurrenceCount", "");
			return;
		}

		onFieldChange("condition", "Parcelado");
		if (!formState.installmentCount) {
			onFieldChange("installmentCount", "2");
		}
	};

	const setInstallmentAmountMode = (mode: InstallmentAmountMode) => {
		onFieldChange("installmentAmountMode", mode);
	};

	return (
		<div className="space-y-2">
			<SchedulingToggleCard
				title="Pagamento recorrente"
				description={
					showRecurrenceDuration
						? "Repete mensalmente. Deixe sem prazo para aluguel e contas fixas."
						: "Repete mensalmente. Você não precisa definir prazo agora."
				}
				active={isRecurring}
				onToggle={() => setSchedulingMode(isRecurring ? "none" : "recorrente")}
				ariaLabel={
					isRecurring
						? "Desativar pagamento recorrente"
						: "Ativar pagamento recorrente"
				}
				icon={<RiRepeatLine className="size-4" aria-hidden />}
				activeClassName="border-primary/20 bg-primary/5"
			>
				{showRecurrenceDuration ? (
					<div className="space-y-1">
						<Label htmlFor="recurrenceCount">Duração</Label>
						<Select
							value={recurrenceSelectValue}
							onValueChange={(value) =>
								onFieldChange(
									"recurrenceCount",
									value === openRecurrenceValue ? "" : value,
								)
							}
						>
							<SelectTrigger id="recurrenceCount" className="w-full">
								<SelectValue placeholder="Selecione">
									{formState.recurrenceCount
										? `${formState.recurrenceCount} meses`
										: "Sem prazo definido"}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={openRecurrenceValue}>
									Sem prazo definido
								</SelectItem>
								{[...Array(59)].map((_, index) => {
									const count = index + 2;
									return (
										<SelectItem key={count} value={String(count)}>
											{count} meses
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							{formState.recurrenceCount
								? "Total de meses da série, incluindo este lançamento."
								: "Novos meses serão criados automaticamente conforme você navegar."}
						</p>
					</div>
				) : null}
			</SchedulingToggleCard>

			{recurringOnly ? null : (
			<SchedulingToggleCard
				title="Parcelamento"
				description="Divide o valor em parcelas ou repete o mesmo valor por parcela."
				active={isInstallment}
				onToggle={() => setSchedulingMode(isInstallment ? "none" : "parcelado")}
				ariaLabel={
					isInstallment ? "Desativar parcelamento" : "Ativar parcelamento"
				}
				icon={<RiStackLine className="size-4" aria-hidden />}
				activeClassName="border-info/25 bg-info/5"
			>
				<div className="space-y-1">
					<Label htmlFor="installmentCount">Quantidade de parcelas</Label>
					<Select
						value={formState.installmentCount}
						onValueChange={(value) => onFieldChange("installmentCount", value)}
					>
						<SelectTrigger id="installmentCount" className="w-full">
							<SelectValue placeholder="Selecione">
								{installmentSummary}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{[...Array(23)].map((_, index) => {
								const count = index + 2;
								return (
									<SelectItem key={count} value={String(count)}>
										{getInstallmentSummary(count)}
									</SelectItem>
								);
							})}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<p className="text-xs font-medium text-foreground">
						Como usar o valor
					</p>
					<InstallmentModeOption
						label="Dividir o valor total"
						description="O valor informado acima será repartido entre as parcelas."
						selected={formState.installmentAmountMode === "total"}
						onSelect={() => setInstallmentAmountMode("total")}
					/>
					<InstallmentModeOption
						label="Valor fixo por parcela"
						description="Cada parcela terá exatamente o valor informado acima."
						selected={formState.installmentAmountMode === "fixed"}
						onSelect={() => setInstallmentAmountMode("fixed")}
					/>
				</div>
			</SchedulingToggleCard>
			)}
		</div>
	);
}
