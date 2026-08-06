"use client";

import { RiArrowDownSLine } from "@remixicon/react";
import { useState } from "react";
import { CategorySearchSelect } from "@/features/transactions/components/dialogs/transaction-dialog/category-search-select";
import {
	AccountCardSelectContent,
	PayerSelectContent,
} from "@/features/transactions/components/select-items";
import type { SelectOption } from "@/features/transactions/components/types";
import { groupAndSortCategories } from "@/features/transactions/lib/category-helpers";
import { PeriodPicker } from "@/shared/components/period-picker";
import { Button } from "@/shared/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { DatePicker } from "@/shared/components/ui/date-picker";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/utils";

type AccountCardValue = `card:${string}` | `account:${string}`;

export function encodeAccountCard(
	type: "card" | "account",
	id: string,
): AccountCardValue {
	return `${type}:${id}` as AccountCardValue;
}

export function decodeAccountCard(value: string): {
	type: "card" | "account";
	id: string;
} | null {
	if (value.startsWith("card:")) return { type: "card", id: value.slice(5) };
	if (value.startsWith("account:"))
		return { type: "account", id: value.slice(8) };
	return null;
}

interface GlobalFieldsProps {
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	accountCardValue: string | null;
	payerId: string | null;
	invoicePeriod: string | null;
	isPaidInvoiceImport?: boolean;
	paymentAccountId?: string | null;
	paymentDate?: string;
	onAccountCardChange: (value: string | null) => void;
	onPayerChange: (value: string | null) => void;
	onInvoicePeriodChange: (value: string | null) => void;
	onPaymentAccountChange?: (value: string | null) => void;
	onPaymentDateChange?: (value: string) => void;
	onBulkCategoryChange: (categoryId: string) => void;
	onCreateCategory?: () => void;
}

export function GlobalFields({
	accountOptions,
	cardOptions,
	payerOptions,
	categoryOptions,
	accountCardValue,
	payerId,
	invoicePeriod,
	isPaidInvoiceImport = false,
	paymentAccountId = null,
	paymentDate = "",
	onAccountCardChange,
	onPayerChange,
	onInvoicePeriodChange,
	onPaymentAccountChange,
	onPaymentDateChange,
	onBulkCategoryChange,
	onCreateCategory,
}: GlobalFieldsProps) {
	const [mobileOpen, setMobileOpen] = useState(false);
	const isCard = accountCardValue?.startsWith("card:") ?? false;
	const categoryGroups = groupAndSortCategories(categoryOptions);
	const selectedPaymentAccount = accountOptions.find(
		(option) => option.value === paymentAccountId,
	);

	const fieldsGrid = (
		<div className="grid w-full grid-cols-1 items-end justify-start gap-3 sm:grid-cols-[repeat(2,minmax(0,14rem))] lg:grid-cols-[16rem_14rem_18rem_14rem]">
			<div className="flex min-w-0 flex-col gap-1.5">
				<Label>Conta / Cartão</Label>
				<Select
					value={accountCardValue ?? ""}
					onValueChange={(v) => onAccountCardChange(v || null)}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Selecionar conta ou cartão…" />
					</SelectTrigger>
					<SelectContent>
						{cardOptions.length > 0 && (
							<SelectGroup>
								<SelectLabel>Cartões</SelectLabel>
								{cardOptions.map((opt) => (
									<SelectItem key={opt.value} value={`card:${opt.value}`}>
										<AccountCardSelectContent
											label={opt.label}
											logo={opt.logo}
											isCartao
										/>
									</SelectItem>
								))}
							</SelectGroup>
						)}
						{cardOptions.length > 0 && accountOptions.length > 0 && (
							<SelectSeparator />
						)}
						{accountOptions.length > 0 && (
							<SelectGroup>
								<SelectLabel>Contas</SelectLabel>
								{accountOptions.map((opt) => (
									<SelectItem key={opt.value} value={`account:${opt.value}`}>
										<AccountCardSelectContent
											label={opt.label}
											logo={opt.logo}
											isCartao={false}
										/>
									</SelectItem>
								))}
							</SelectGroup>
						)}
					</SelectContent>
				</Select>
			</div>

			<div className="flex min-w-0 flex-col gap-1.5">
				<Label>Pessoa</Label>
				<Select
					value={payerId ?? ""}
					onValueChange={(v) => onPayerChange(v || null)}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Aplicar pessoa…" />
					</SelectTrigger>
					<SelectContent>
						{payerOptions.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								<PayerSelectContent
									label={opt.label}
									avatarUrl={opt.avatarUrl}
								/>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex min-w-0 flex-col gap-1.5">
				<Label>Categoria</Label>
				<CategorySearchSelect
					value=""
					onValueChange={onBulkCategoryChange}
					categoryGroups={categoryGroups}
					categoryOptions={categoryOptions}
					placeholder="Aplicar a todas selecionadas…"
					onCreateCategory={onCreateCategory}
				/>
			</div>

			{isCard && (
				<div className="flex min-w-0 flex-col gap-1.5">
					<Label>Fatura</Label>
					<PeriodPicker
						value={invoicePeriod ?? ""}
						onChange={(v) => onInvoicePeriodChange(v || null)}
						placeholder="Selecionar fatura…"
					/>
				</div>
			)}

			{isPaidInvoiceImport && (
				<>
					<div className="flex min-w-0 flex-col gap-1.5">
						<Label>Conta de pagamento</Label>
						<Select
							value={paymentAccountId ?? ""}
							onValueChange={(value) =>
								onPaymentAccountChange?.(value || null)
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Selecionar conta…">
									{selectedPaymentAccount ? (
										<AccountCardSelectContent
											label={selectedPaymentAccount.label}
											logo={selectedPaymentAccount.logo}
											isCartao={false}
										/>
									) : null}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{accountOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<AccountCardSelectContent
											label={option.label}
											logo={option.logo}
											isCartao={false}
										/>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex min-w-0 flex-col gap-1.5">
						<Label>Data do pagamento</Label>
						<DatePicker
							value={paymentDate}
							onChange={(value) => {
								if (value) onPaymentDateChange?.(value);
							}}
						/>
					</div>
				</>
			)}
		</div>
	);

	return (
		<div className="flex flex-col gap-2">
			{/* Desktop: sempre visível */}
			<div className="hidden md:flex md:flex-col md:gap-2">
				<p className="text-muted-foreground text-sm">
					Aplicado aos lançamentos selecionados.
				</p>
				{fieldsGrid}
			</div>

			{/* Mobile: recolhido por padrão */}
			<Collapsible
				open={mobileOpen}
				onOpenChange={setMobileOpen}
				className="md:hidden"
			>
				<CollapsibleTrigger asChild>
					<Button
						type="button"
						variant="outline"
						className="h-10 w-full justify-between px-3 font-normal"
					>
						<span>Ajustes em lote</span>
						<RiArrowDownSLine
							className={cn(
								"size-4 shrink-0 text-muted-foreground transition-transform",
								mobileOpen && "rotate-180",
							)}
							aria-hidden
						/>
					</Button>
				</CollapsibleTrigger>
				<CollapsibleContent className="pt-3">
					<p className="mb-3 text-muted-foreground text-sm">
						Aplicado aos lançamentos selecionados.
					</p>
					{fieldsGrid}
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}
