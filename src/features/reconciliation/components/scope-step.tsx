"use client";

import { RiBankCard2Line, RiBankLine } from "@remixicon/react";
import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
import type { SelectOption } from "@/features/transactions/components/types";
import { PeriodPicker } from "@/shared/components/period-picker";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";
import { cn } from "@/shared/utils/ui";

export type ReconciliationScopeValue = {
	targetType: "card" | "account";
	targetId: string;
	period: string;
};

type ScopeStepProps = {
	value: ReconciliationScopeValue;
	onChange: (value: ReconciliationScopeValue) => void;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	defaultPeriod: string;
	disabled?: boolean;
};

export function ScopeStep({
	value,
	onChange,
	accountOptions,
	cardOptions,
	defaultPeriod,
	disabled,
}: ScopeStepProps) {
	const targetOptions =
		value.targetType === "card" ? cardOptions : accountOptions;

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<div className="space-y-2 md:col-span-3">
				<Label>Tipo de conciliação</Label>
				<ToggleGroup
					type="single"
					value={value.targetType}
					onValueChange={(nextValue) => {
						if (!nextValue) return;
						const options = nextValue === "card" ? cardOptions : accountOptions;
						onChange({
							targetType: nextValue as "card" | "account",
							targetId: options[0]?.value ?? "",
							period: value.period || defaultPeriod,
						});
					}}
					variant="outline"
					className="justify-start"
					disabled={disabled}
				>
					<ToggleGroupItem value="card" className="gap-2">
						<RiBankCard2Line className="size-4" />
						Fechamento de cartão
					</ToggleGroupItem>
					<ToggleGroupItem value="account" className="gap-2">
						<RiBankLine className="size-4" />
						Extrato de conta
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			<div className="space-y-2">
				<Label htmlFor="reconciliation-target">
					{value.targetType === "card" ? "Cartão" : "Conta"}
				</Label>
				<Select
					value={value.targetId}
					onValueChange={(targetId) => onChange({ ...value, targetId })}
					disabled={disabled || targetOptions.length === 0}
				>
					<SelectTrigger id="reconciliation-target" className="w-full">
						<SelectValue
							placeholder={
								value.targetType === "card"
									? "Selecione o cartão"
									: "Selecione a conta"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{targetOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								<AccountCardSelectContent
									label={option.label}
									logo={option.logo}
									isCartao={value.targetType === "card"}
								/>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<Label>
					{value.targetType === "card" ? "Período da fatura" : "Período"}
				</Label>
				<PeriodPicker
					value={value.period || defaultPeriod}
					onChange={(period) => onChange({ ...value, period })}
					disabled={disabled}
					className="w-full"
				/>
			</div>

			<div
				className={cn(
					"rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-sm",
					"flex items-center",
				)}
			>
				{value.targetType === "card"
					? "Os lançamentos novos usarão sempre o período da fatura selecionado."
					: "A conciliação comparará o extrato com os lançamentos quitados da conta no período."}
			</div>
		</div>
	);
}
