"use client";

import {
	RiAddFill,
	RiCheckboxBlankCircleLine,
	RiCheckboxCircleFill,
} from "@remixicon/react";
import { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { SelectCreateAction } from "@/shared/components/ui/select-create-action";
import { cn } from "@/shared/utils/ui";
import {
	AccountCardSelectContent,
	PaymentMethodSelectContent,
} from "../../select-items";
import { PaymentSchedulingSection } from "./payment-scheduling-section";
import type { PaymentMethodSectionProps } from "./transaction-dialog-types";

function SelectFieldHeader({
	htmlFor,
	label,
	actionLabel,
	onAction,
}: {
	htmlFor: string;
	label: string;
	actionLabel?: string;
	onAction?: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<Label htmlFor={htmlFor}>{label}</Label>
			{onAction ? (
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
					aria-label={actionLabel}
					onClick={onAction}
				>
					<RiAddFill className="size-4" />
				</Button>
			) : null}
		</div>
	);
}

export function PaymentMethodSection({
	formState,
	onFieldChange,
	accountOptions,
	cardOptions,
	isUpdateMode,
	isSeriesBulkEdit = false,
	canConvertToSeries = false,
	showSettledToggle,
	onCreateAccount,
	onCreateCard,
}: PaymentMethodSectionProps) {
	const isCartaoSelected = formState.paymentMethod === "Cartão de crédito";
	const showContaSelect = [
		"Pix",
		"Dinheiro",
		"Boleto",
		"Cartão de débito",
		"Pré-Pago | VR/VA",
		"Transferência bancária",
	].includes(formState.paymentMethod);

	const filteredContaOptions =
		formState.paymentMethod === "Pré-Pago | VR/VA"
			? accountOptions.filter(
					(option) => option.accountType === "Pré-Pago | VR/VA",
				)
			: formState.paymentMethod === "Dinheiro"
				? accountOptions.filter((option) => option.accountType === "Dinheiro")
				: accountOptions;

	const contaCreateTypeHint =
		formState.paymentMethod === "Pré-Pago | VR/VA" ||
		formState.paymentMethod === "Dinheiro"
			? formState.paymentMethod
			: undefined;

	const hasSecondaryColumn = isCartaoSelected || showContaSelect;
	const showPaymentMethodField = !isUpdateMode || isSeriesBulkEdit;
	const showSchedulingSection =
		!isUpdateMode || isSeriesBulkEdit || canConvertToSeries;
	const schedulingRecurringOnly =
		isUpdateMode && canConvertToSeries && !isSeriesBulkEdit;

	return (
		<div className="space-y-3">
			<div className="flex w-full flex-col gap-2 md:flex-row">
				{showPaymentMethodField ? (
					<div
						className={cn(
							"w-full space-y-1",
							hasSecondaryColumn ? "md:w-1/2" : "md:w-full",
						)}
					>
						<Label htmlFor="paymentMethod">Forma de pagamento</Label>
						<Select
							value={formState.paymentMethod}
							onValueChange={(value) => onFieldChange("paymentMethod", value)}
						>
							<SelectTrigger id="paymentMethod" className="w-full">
								<SelectValue placeholder="Selecione" className="w-full">
									{formState.paymentMethod && (
										<PaymentMethodSelectContent
											label={formState.paymentMethod}
										/>
									)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{PAYMENT_METHODS.map((method) => (
									<SelectItem key={method} value={method}>
										<PaymentMethodSelectContent label={method} />
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				) : null}

				{isCartaoSelected ? (
					<div
						className={cn(
							"w-full space-y-1",
							showPaymentMethodField ? "md:w-1/2" : "md:w-full",
						)}
					>
						<SelectFieldHeader
							htmlFor="cartao"
							label="Cartão"
							actionLabel="Adicionar cartão"
							onAction={onCreateCard}
						/>
						<Select
							value={formState.cardId ?? ""}
							onValueChange={(value) => onFieldChange("cardId", value)}
						>
							<SelectTrigger id="cartao" className="w-full">
								<SelectValue placeholder="Selecione">
									{formState.cardId &&
										(() => {
											const selectedOption = cardOptions.find(
												(opt) => opt.value === formState.cardId,
											);
											return selectedOption ? (
												<AccountCardSelectContent
													label={selectedOption.label}
													logo={selectedOption.logo}
													isCartao={true}
												/>
											) : null;
										})()}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{cardOptions.length === 0 ? (
									<div className="px-2 py-4 text-center text-sm text-muted-foreground">
										Nenhum cartão cadastrado
									</div>
								) : (
									cardOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											<AccountCardSelectContent
												label={option.label}
												logo={option.logo}
												isCartao={true}
											/>
										</SelectItem>
									))
								)}
								{onCreateCard ? (
									<SelectCreateAction
										label="Adicionar cartão"
										onClick={onCreateCard}
									/>
								) : null}
							</SelectContent>
						</Select>
					</div>
				) : null}

				{!isCartaoSelected && showContaSelect ? (
					<div
						className={cn(
							"w-full space-y-1",
							showPaymentMethodField ? "md:w-1/2" : "md:w-full",
						)}
					>
						<SelectFieldHeader
							htmlFor="conta"
							label="Conta"
							actionLabel="Adicionar conta"
							onAction={
								onCreateAccount
									? () => onCreateAccount(contaCreateTypeHint)
									: undefined
							}
						/>
						<Select
							value={formState.accountId ?? ""}
							onValueChange={(value) => onFieldChange("accountId", value)}
						>
							<SelectTrigger id="conta" className="w-full">
								<SelectValue placeholder="Selecione">
									{formState.accountId &&
										(() => {
											const selectedOption = filteredContaOptions.find(
												(opt) => opt.value === formState.accountId,
											);
											return selectedOption ? (
												<AccountCardSelectContent
													label={selectedOption.label}
													logo={selectedOption.logo}
													isCartao={false}
												/>
											) : null;
										})()}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{filteredContaOptions.length === 0 ? (
									<div className="px-2 py-4 text-center text-sm text-muted-foreground">
										Nenhuma conta cadastrada
									</div>
								) : (
									filteredContaOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											<AccountCardSelectContent
												label={option.label}
												logo={option.logo}
												isCartao={false}
											/>
										</SelectItem>
									))
								)}
								{onCreateAccount ? (
									<SelectCreateAction
										label="Adicionar conta"
										onClick={() => onCreateAccount(contaCreateTypeHint)}
									/>
								) : null}
							</SelectContent>
						</Select>
					</div>
				) : null}
			</div>

			{showSettledToggle ? (
				<button
					type="button"
					onClick={() => onFieldChange("isSettled", !formState.isSettled)}
					aria-label={
						formState.isSettled ? "Desfazer pagamento" : "Marcar como pago"
					}
					aria-pressed={Boolean(formState.isSettled)}
					className={cn(
						"flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
						formState.isSettled
							? "border-success/20 bg-success/5 hover:bg-success/10"
							: "border-border bg-transparent hover:bg-muted/40",
					)}
				>
					<div>
						<p className="text-sm text-foreground text-left">
							Marcar como pago
						</p>
						<p className="text-xs text-muted-foreground text-left">
							Indica que o valor já foi pago.
						</p>
					</div>
					<span
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
							formState.isSettled
								? "bg-success/10 text-success"
								: "text-muted-foreground",
						)}
					>
						{formState.isSettled ? (
							<RiCheckboxCircleFill className="size-4" />
						) : (
							<RiCheckboxBlankCircleLine className="size-4" />
						)}
					</span>
				</button>
			) : null}

			{showSchedulingSection ? (
				<PaymentSchedulingSection
					formState={formState}
					onFieldChange={onFieldChange}
					recurringOnly={schedulingRecurringOnly}
					showRecurrenceDuration={schedulingRecurringOnly}
				/>
			) : null}
		</div>
	);
}
