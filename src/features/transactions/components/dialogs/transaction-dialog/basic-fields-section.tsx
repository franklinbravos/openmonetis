"use client";

import { RiCalculatorLine } from "@remixicon/react";
import { CalculatorDialogButton } from "@/shared/components/calculator/calculator-dialog";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { DatePicker } from "@/shared/components/ui/date-picker";
import { Label } from "@/shared/components/ui/label";
import { shouldShowBoletoPaymentDate } from "@/features/transactions/lib/form-helpers";
import { EstablishmentInput } from "../../shared/establishment-input";
import { InlinePeriodPicker } from "./inline-period-picker";
import type { BasicFieldsSectionProps } from "./transaction-dialog-types";

export function BasicFieldsSection({
	formState,
	onFieldChange,
	estabelecimentos,
}: Omit<BasicFieldsSectionProps, "monthOptions">) {
	const showInvoicePeriodPicker =
		formState.paymentMethod === "Cartão de crédito" && Boolean(formState.cardId);
	const isCreditCard = formState.paymentMethod === "Cartão de crédito";
	const isBoleto = formState.paymentMethod === "Boleto";
	const showBillDates = !isCreditCard;
	const showPaymentDate =
		showBillDates &&
		(isBoleto
			? shouldShowBoletoPaymentDate(
					formState.paymentMethod,
					formState.isSettled,
				)
			: Boolean(formState.isSettled));
	const paymentDateValue = isBoleto
		? formState.boletoPaymentDate
		: formState.purchaseDate;
	const paymentDateField = isBoleto ? "boletoPaymentDate" : "purchaseDate";

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<Label htmlFor="name">Descrição</Label>
				<EstablishmentInput
					id="name"
					value={formState.name}
					onChange={(value) => onFieldChange("name", value)}
					estabelecimentos={estabelecimentos}
					placeholder="Ex.: Restaurante do Zé"
					maxLength={60}
					required
				/>
			</div>

			{showBillDates ? (
				<div className="flex w-full flex-col gap-2 md:flex-row">
					<div className="w-full space-y-1 md:w-1/2">
						<Label htmlFor="dueDate">Data de vencimento</Label>
						<DatePicker
							id="dueDate"
							nested
							value={formState.dueDate}
							onChange={(value) => onFieldChange("dueDate", value)}
							placeholder="Vencimento original"
							required={isBoleto}
						/>
					</div>
					{showPaymentDate ? (
						<div className="w-full space-y-1 md:w-1/2">
							<Label htmlFor={paymentDateField}>Data de pagamento</Label>
							<DatePicker
								id={paymentDateField}
								nested
								value={paymentDateValue}
								onChange={(value) => onFieldChange(paymentDateField, value)}
								placeholder="Data em que foi pago"
								required
							/>
						</div>
					) : null}
				</div>
			) : (
				<div className="flex w-full flex-col gap-2 md:flex-row">
					<div className="w-full space-y-1 md:w-1/2">
						<Label htmlFor="purchaseDate">Data</Label>
						<DatePicker
							id="purchaseDate"
							nested
							value={formState.purchaseDate}
							onChange={(value) => onFieldChange("purchaseDate", value)}
							placeholder="Data"
							required
						/>
						{showInvoicePeriodPicker ? (
							<InlinePeriodPicker
								period={formState.period}
								onPeriodChange={(value) => onFieldChange("period", value)}
							/>
						) : null}
					</div>

					<div className="w-full space-y-1 md:w-1/2">
						<Label htmlFor="amount">Valor</Label>
						<div className="relative">
							<CurrencyInput
								id="amount"
								value={formState.amount}
								onValueChange={(value) => onFieldChange("amount", value)}
								placeholder="R$ 0,00"
								required
								className="pr-10"
							/>
							<CalculatorDialogButton
								variant="ghost"
								size="icon-sm"
								className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
								onSelectValue={(value) => onFieldChange("amount", value)}
							>
								<RiCalculatorLine className="h-4 w-4 text-muted-foreground" />
							</CalculatorDialogButton>
						</div>
					</div>
				</div>
			)}

			{showBillDates ? (
				<div className="space-y-1">
					<Label htmlFor="amount">Valor</Label>
					<div className="relative">
						<CurrencyInput
							id="amount"
							value={formState.amount}
							onValueChange={(value) => onFieldChange("amount", value)}
							placeholder="R$ 0,00"
							required
							className="pr-10"
						/>
						<CalculatorDialogButton
							variant="ghost"
							size="icon-sm"
							className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
							onSelectValue={(value) => onFieldChange("amount", value)}
						>
							<RiCalculatorLine className="h-4 w-4 text-muted-foreground" />
						</CalculatorDialogButton>
					</div>
				</div>
			) : null}
		</div>
	);
}
