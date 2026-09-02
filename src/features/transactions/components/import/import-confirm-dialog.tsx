"use client";

import { RiCheckboxCircleLine, RiCloseCircleLine } from "@remixicon/react";
import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

export type ImportInvoicePaymentPrompt = {
	/** Vencimento da fatura, sugerido como data do pagamento. */
	dueDate: string | null;
	/**
	 * Pagamento já registrado desta fatura, quando existe.
	 *
	 * Reprocessar um arquivo já processado é o caso comum. Perguntar "esta fatura
	 * já foi paga?" nessa situação ignora o que já foi feito e convida a
	 * registrar o pagamento duas vezes.
	 */
	alreadyPaid?: {
		date: string | null;
		amount: number | null;
		/** Reabre o pagamento para corrigir a data ou desfazê-lo. */
		reopened: boolean;
		onReopenedChange: (reopened: boolean) => void;
	} | null;
	paid: boolean;
	onPaidChange: (paid: boolean) => void;
	paymentDate: string;
	onPaymentDateChange: (date: string) => void;
	accountOptions: Array<{ value: string; label: string; logo?: string | null }>;
	accountId: string | null;
	onAccountChange: (accountId: string) => void;
};

/**
 * Liquidação da fatura anterior, apurada pelo arquivo desta.
 *
 * Fica atrás de uma confirmação porque reescreve o registro de um mês já
 * fechado: o status da fatura anterior e o valor do débito na conta.
 */
export type ImportPreviousInvoiceCheck = {
	label: string;
	value: string;
	ok: boolean;
	detail?: string;
	note?: string;
};

/**
 * Conferência da fatura anterior no último passo.
 *
 * Quando nada muda — status já correto e débito no valor certo — não há
 * confirmação a pedir: o bloco só mostra que está tudo certo.
 */
export type ImportPreviousInvoicePrompt = {
	previousPeriodLabel: string;
	checks: ImportPreviousInvoiceCheck[];
	allOk: boolean;
	/** A importação mudaria algo na fatura anterior. */
	hasChanges: boolean;
	/**
	 * O que muda ao confirmar, uma linha por item.
	 *
	 * Uma frase só deixava dúvida sobre a data: a conferência apontava a
	 * divergência e o resumo falava apenas do valor.
	 */
	changeLines: string[];
	confirmed: boolean;
	onConfirmedChange: (confirmed: boolean) => void;
};

/**
 * Atualização dos limites do cartão, confirmada no último passo.
 *
 * O bloco da revisão fica longe do botão que aplica. Repetir aqui o que muda
 * evita clicar em confirmar sem saber que o limite também será alterado.
 */
export type ImportCardLimitsPrompt = {
	changeLines: string[];
	confirmed: boolean;
	onConfirmedChange: (confirmed: boolean) => void;
};

/**
 * Abate desta fatura pago antes do vencimento, confirmado no último passo.
 *
 * Tem toggle próprio porque é um lançamento novo na conta corrente — coisa
 * diferente de corrigir o registro do mês passado, que tem o seu.
 */
export type ImportInvoiceAmortizationPrompt = {
	changeLines: string[];
	confirmed: boolean;
	onConfirmedChange: (confirmed: boolean) => void;
};

/** Conferência de saldo do extrato de conta (PDF com bloco de saldos). */
export type ImportAccountBalancePrompt = {
	openingBalance: number;
	closingBalance: number;
	adjustmentAmount: number;
	adjustmentDate: string;
	yieldAmount: number;
	yieldDate: string | null;
	relocatedAdjustmentCount: number;
	statementMonthNetFromFile: number;
	statementMonthNetInCadastro: number;
	projectedClosingBalance: number;
	closingMatches: boolean;
};

type ImportConfirmDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	importCount: number;
	verifiedCount: number;
	replacedCount: number;
	excludedCount: number;
	removalCount?: number;
	installmentBackfillCount: number;
	amountCorrectionCount?: number;
	isPaidInvoiceImport?: boolean;
	isPending: boolean;
	invoiceTotalDelta?: number | null;
	invoiceTotalOverrideConfirmed?: boolean;
	onInvoiceTotalOverrideChange?: (confirmed: boolean) => void;
	canConfirm?: boolean;
	/** Nada a importar, remover ou corrigir: só o pagamento justifica confirmar. */
	nothingToConfirm?: boolean;
	invoicePayment?: ImportInvoicePaymentPrompt | null;
	previousInvoice?: ImportPreviousInvoicePrompt | null;
	cardLimits?: ImportCardLimitsPrompt | null;
	invoiceAmortization?: ImportInvoiceAmortizationPrompt | null;
	accountBalance?: ImportAccountBalancePrompt | null;
	onConfirm: () => void;
};

export function ImportConfirmDialog({
	open,
	onOpenChange,
	importCount,
	verifiedCount,
	replacedCount,
	excludedCount,
	removalCount = 0,
	installmentBackfillCount,
	amountCorrectionCount = 0,
	isPaidInvoiceImport = false,
	isPending,
	invoiceTotalDelta = null,
	invoiceTotalOverrideConfirmed = false,
	onInvoiceTotalOverrideChange,
	canConfirm = true,
	nothingToConfirm = false,
	invoicePayment = null,
	previousInvoice = null,
	cardLimits = null,
	invoiceAmortization = null,
	accountBalance = null,
	onConfirm,
}: ImportConfirmDialogProps) {
	const editedCount = replacedCount + installmentBackfillCount;
	const selectedPaymentAccount = invoicePayment?.accountOptions.find(
		(option) => option.value === invoicePayment.accountId,
	);
	const hasInvoiceTotalMismatch =
		invoiceTotalDelta != null && Math.abs(invoiceTotalDelta) > 0.01;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isPaidInvoiceImport
							? "Confirmar pagamento da fatura"
							: "Confirmar importação"}
					</DialogTitle>
					<DialogDescription>
						{isPaidInvoiceImport
							? importCount > 0
								? "Os lançamentos serão importados e a fatura será marcada como paga."
								: "Os lançamentos já estão importados. A fatura será marcada como paga."
							: "Revise o resumo abaixo antes de concluir a importação."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 rounded-md border bg-muted/20 p-4 text-sm">
					{importCount > 0 ? (
						<SummaryRow
							label="Serão importados"
							value={importCount}
							tone="success"
							prefix="+"
							emphasis
						/>
					) : isPaidInvoiceImport ? (
						<p className="text-muted-foreground text-sm leading-relaxed">
							Nenhum lançamento novo será importado.
						</p>
					) : accountBalance ? (
						<p className="text-muted-foreground text-sm leading-relaxed">
							Nenhum lançamento novo. O saldo da conta será ajustado conforme o
							extrato.
						</p>
					) : nothingToConfirm ? (
						<p className="text-muted-foreground text-sm leading-relaxed">
							{invoicePayment?.alreadyPaid
								? "A fatura já está conferida com o arquivo e já está paga: nada a importar, remover ou corrigir."
								: "A fatura já está conferida com o arquivo: nada a importar, remover ou corrigir. Marque abaixo se ela já foi paga para registrar a baixa e fechar o mês."}
						</p>
					) : null}
					{verifiedCount > 0 ? (
						<SummaryRow label="Conferidos" value={verifiedCount} tone="info" />
					) : null}
					{editedCount > 0 ? (
						<SummaryRow label="Serão editados" value={editedCount} />
					) : null}
					{amountCorrectionCount > 0 ? (
						<SummaryRow
							label="Valores corrigidos"
							value={amountCorrectionCount}
							tone="info"
						/>
					) : null}
					{/* Ignorar não é destruir: o arquivo fica intacto e nada sai do
					    cadastro. O vermelho e o sinal de menos ficam para "serão
					    removidos", que é o único que apaga lançamento. */}
					{excludedCount > 0 ? (
						<SummaryRow
							label="Serão ignorados do arquivo"
							value={excludedCount}
						/>
					) : null}
					{removalCount > 0 ? (
						<SummaryRow
							label="Serão removidos do cadastro"
							value={removalCount}
							tone="destructive"
							prefix="-"
						/>
					) : null}
					{installmentBackfillCount > 0 ? (
						<p className="text-muted-foreground text-xs leading-relaxed">
							O parcelamento inclui {installmentBackfillCount} lançamento
							{installmentBackfillCount !== 1 ? "s" : ""} em faturas anteriores.
						</p>
					) : null}
					{replacedCount > 0 ? (
						<p className="text-muted-foreground text-xs leading-relaxed">
							{replacedCount} lançamento{replacedCount !== 1 ? "s" : ""} já
							importado{replacedCount !== 1 ? "s" : ""} será
							{replacedCount !== 1 ? "ão" : ""} substituído
							{replacedCount !== 1 ? "s" : ""}.
						</p>
					) : null}
				</div>

				{accountBalance ? (
					<div
						className={cn(
							"space-y-2 rounded-md border p-3",
							accountBalance.closingMatches
								? "border-sky-500/40 bg-sky-500/5"
								: "border-amber-500/40 bg-amber-500/5",
						)}
					>
						<div className="flex flex-wrap items-center gap-2">
							<p className="font-medium text-sm">Saldo da conta</p>
							<span
								className={cn(
									"rounded-full border px-2 py-0.5 text-xs",
									accountBalance.closingMatches
										? "border-sky-500/40 text-sky-700 dark:text-sky-300"
										: "border-amber-500/40 text-amber-700 dark:text-amber-500",
								)}
							>
								{accountBalance.closingMatches
									? "Fecha com o extrato"
									: "Saldo final não fecha"}
							</span>
						</div>

						<ul className="space-y-1.5 text-xs">
							<li className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">
									Saldo inicial (extrato)
								</span>
								<span className="font-medium tabular-nums">
									{formatCurrency(accountBalance.openingBalance)}
								</span>
							</li>
							<li className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">
									Saldo final (extrato)
								</span>
								<span className="font-medium tabular-nums">
									{formatCurrency(accountBalance.closingBalance)}
								</span>
							</li>
							{Math.abs(accountBalance.adjustmentAmount) > 0.01 ? (
								<li className="flex items-start justify-between gap-3 border-border/60 border-t pt-1.5">
									<span className="text-muted-foreground">
										Ajuste de saldo em{" "}
										{formatDateOnly(accountBalance.adjustmentDate) ??
											accountBalance.adjustmentDate}
									</span>
									<span className="text-right font-medium tabular-nums">
										{accountBalance.adjustmentAmount > 0 ? "+" : "−"}
										{formatCurrency(Math.abs(accountBalance.adjustmentAmount))}
										<span className="block font-normal text-[11px] text-muted-foreground">
											{accountBalance.adjustmentAmount > 0
												? "lançado como receita"
												: "lançado como despesa"}
										</span>
									</span>
								</li>
							) : (
								<li className="text-muted-foreground">
									Saldo de abertura já confere — nenhum ajuste necessário.
								</li>
							)}
							{accountBalance.yieldAmount > 0.01 && accountBalance.yieldDate ? (
								<li className="flex items-center justify-between gap-3">
									<span className="text-muted-foreground">
										Rendimento em{" "}
										{formatDateOnly(accountBalance.yieldDate) ??
											accountBalance.yieldDate}
									</span>
									<span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
										+{formatCurrency(accountBalance.yieldAmount)}
									</span>
								</li>
							) : null}
							{accountBalance.relocatedAdjustmentCount > 0 ? (
								<li className="text-muted-foreground">
									{accountBalance.relocatedAdjustmentCount} ajuste
									{accountBalance.relocatedAdjustmentCount !== 1 ? "s" : ""} de
									saldo no mês do extrato será
									{accountBalance.relocatedAdjustmentCount !== 1
										? "ão"
										: ""}{" "}
									movido
									{accountBalance.relocatedAdjustmentCount !== 1 ? "s" : ""} para{" "}
									{formatDateOnly(accountBalance.adjustmentDate) ??
										accountBalance.adjustmentDate}
									.
								</li>
							) : null}
							<li className="flex items-center justify-between gap-3 border-border/60 border-t pt-1.5">
								<span className="text-muted-foreground">
									Líquido do mês (extrato)
								</span>
								<span className="font-medium tabular-nums">
									{formatCurrency(accountBalance.statementMonthNetFromFile)}
								</span>
							</li>
							<li className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">
									Líquido do mês (cadastro)
								</span>
								<span className="font-medium tabular-nums">
									{formatCurrency(accountBalance.statementMonthNetInCadastro)}
								</span>
							</li>
							{!accountBalance.closingMatches ? (
								<li className="border-amber-500/30 border-t pt-1.5 text-amber-800 dark:text-amber-400">
									Projetado após importar:{" "}
									<span className="font-medium tabular-nums">
										{formatCurrency(accountBalance.projectedClosingBalance)}
									</span>
									{" — "}
									diferença de{" "}
									{formatCurrency(
										Math.abs(
											accountBalance.projectedClosingBalance -
												accountBalance.closingBalance,
										),
									)}{" "}
									em relação ao extrato.
									{Math.abs(
										accountBalance.statementMonthNetInCadastro -
											accountBalance.statementMonthNetFromFile,
									) > 0.01 ? (
										<span className="mt-1 block text-[11px] leading-relaxed">
											Os lançamentos no cadastro somam{" "}
											{formatCurrency(
												Math.abs(
													accountBalance.statementMonthNetInCadastro -
														accountBalance.statementMonthNetFromFile,
												),
											)}{" "}
											{accountBalance.statementMonthNetInCadastro >
											accountBalance.statementMonthNetFromFile
												? "a mais"
												: "a menos"}{" "}
											que o extrato neste mês.
										</span>
									) : null}
								</li>
							) : null}
						</ul>
					</div>
				) : null}

				{hasInvoiceTotalMismatch && onInvoiceTotalOverrideChange ? (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
						<p className="text-destructive text-sm">
							O total projetado difere em{" "}
							{formatCurrency(Math.abs(invoiceTotalDelta))} do total do arquivo.
						</p>
						<div className="mt-3 flex items-start gap-2">
							<Switch
								id="invoice-total-override"
								checked={invoiceTotalOverrideConfirmed}
								onCheckedChange={(checked) =>
									onInvoiceTotalOverrideChange(checked === true)
								}
							/>
							<Label
								htmlFor="invoice-total-override"
								className="text-sm leading-snug font-normal"
							>
								Importar mesmo com diferença de{" "}
								{formatCurrency(Math.abs(invoiceTotalDelta))}
							</Label>
						</div>
					</div>
				) : null}

				{previousInvoice ? (
					<div
						className={cn(
							"space-y-2 rounded-md border p-3",
							previousInvoice.allOk
								? "border-emerald-500/40 bg-emerald-500/5"
								: "border-amber-500/40 bg-amber-500/5",
						)}
					>
						<div className="flex flex-wrap items-center gap-2">
							<p className="font-medium text-sm">
								Fatura de {previousInvoice.previousPeriodLabel}
							</p>
							<span
								className={cn(
									"rounded-full border px-2 py-0.5 text-xs",
									previousInvoice.allOk
										? "border-emerald-500/40 text-emerald-700 dark:text-emerald-500"
										: "border-amber-500/40 text-amber-700 dark:text-amber-500",
								)}
							>
								{previousInvoice.allOk ? "Confere" : "Requer atenção"}
							</span>
						</div>

						<ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
							{previousInvoice.checks.map((check) => (
								<li key={check.label} className="flex items-center gap-1">
									{check.ok ? (
										<RiCheckboxCircleLine className="size-3.5 shrink-0 text-emerald-600" />
									) : (
										<RiCloseCircleLine className="size-3.5 shrink-0 text-amber-600" />
									)}
									<span className="text-muted-foreground">{check.label}</span>
									<span className="font-medium tabular-nums">
										{check.value}
									</span>
									{check.detail ? (
										<span className="text-amber-700 dark:text-amber-500">
											({check.detail})
										</span>
									) : check.note ? (
										<span className="text-muted-foreground">
											({check.note})
										</span>
									) : null}
								</li>
							))}
						</ul>

						{previousInvoice.hasChanges ? (
							<>
								<div className="flex items-center gap-2 pt-1">
									<Switch
										id="previous-invoice-settlement"
										checked={previousInvoice.confirmed}
										onCheckedChange={(checked) =>
											previousInvoice.onConfirmedChange(checked === true)
										}
									/>
									<Label
										htmlFor="previous-invoice-settlement"
										className="text-sm font-normal leading-snug"
									>
										Ajustar a fatura de {previousInvoice.previousPeriodLabel}
									</Label>
								</div>

								{previousInvoice.confirmed ? (
									<ul className="space-y-1 pl-5 text-muted-foreground text-xs leading-relaxed">
										{previousInvoice.changeLines.map((line) => (
											<li key={line} className="list-disc">
												{line}
											</li>
										))}
									</ul>
								) : (
									<p className="pl-5 text-muted-foreground text-xs leading-relaxed">
										Sem ajustar, a fatura anterior fica como está.
									</p>
								)}
							</>
						) : null}
					</div>
				) : null}

				{cardLimits && cardLimits.changeLines.length > 0 ? (
					<div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
						<p className="font-medium text-sm">Limites do cartão</p>

						<div className="flex items-center gap-2">
							<Switch
								id="card-limits-confirm"
								checked={cardLimits.confirmed}
								onCheckedChange={(checked) =>
									cardLimits.onConfirmedChange(checked === true)
								}
							/>
							<Label
								htmlFor="card-limits-confirm"
								className="text-sm font-normal leading-snug"
							>
								Atualizar os limites com o que a fatura declara
							</Label>
						</div>

						{cardLimits.confirmed ? (
							<ul className="space-y-1 pl-5 text-muted-foreground text-xs leading-relaxed">
								{cardLimits.changeLines.map((line) => (
									<li key={line} className="list-disc">
										{line}
									</li>
								))}
							</ul>
						) : (
							<p className="pl-5 text-muted-foreground text-xs leading-relaxed">
								Sem atualizar, os limites ficam como estão.
							</p>
						)}
					</div>
				) : null}

				{invoiceAmortization && invoiceAmortization.changeLines.length > 0 ? (
					<div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
						<p className="font-medium text-sm">Pagamento antecipado</p>

						<div className="flex items-center gap-2">
							<Switch
								id="invoice-amortization-confirm"
								checked={invoiceAmortization.confirmed}
								onCheckedChange={(checked) =>
									invoiceAmortization.onConfirmedChange(checked === true)
								}
							/>
							<Label
								htmlFor="invoice-amortization-confirm"
								className="text-sm font-normal leading-snug"
							>
								Registrar o pagamento que abateu esta fatura
							</Label>
						</div>

						{invoiceAmortization.confirmed ? (
							<ul className="space-y-1 pl-5 text-muted-foreground text-xs leading-relaxed">
								{invoiceAmortization.changeLines.map((line) => (
									<li key={line} className="list-disc">
										{line}
									</li>
								))}
							</ul>
						) : (
							<p className="pl-5 text-muted-foreground text-xs leading-relaxed">
								Sem registrar, o pagamento não aparece no extrato da conta.
							</p>
						)}
					</div>
				) : null}

				{invoicePayment?.alreadyPaid ? (
					<div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
						<div className="flex flex-wrap items-center gap-2">
							<RiCheckboxCircleLine className="size-4 shrink-0 text-emerald-600" />
							<p className="font-medium text-sm">Esta fatura já está paga</p>
						</div>
						<ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
							{invoicePayment.alreadyPaid.date ? (
								<li className="flex items-center gap-1.5">
									<span className="text-muted-foreground">Pago em</span>
									<span className="font-medium tabular-nums">
										{formatDateOnly(invoicePayment.alreadyPaid.date) ??
											invoicePayment.alreadyPaid.date}
									</span>
								</li>
							) : null}
							{invoicePayment.alreadyPaid.amount != null ? (
								<li className="flex items-center gap-1.5">
									<span className="text-muted-foreground">Valor</span>
									<span className="font-medium tabular-nums">
										{formatCurrency(invoicePayment.alreadyPaid.amount)}
									</span>
								</li>
							) : null}
						</ul>
						<div className="flex items-center gap-2">
							<Switch
								id="reopen-invoice-payment"
								checked={invoicePayment.alreadyPaid.reopened}
								onCheckedChange={(checked) =>
									invoicePayment.alreadyPaid?.onReopenedChange(checked === true)
								}
							/>
							<Label
								htmlFor="reopen-invoice-payment"
								className="text-xs font-normal leading-snug"
							>
								Corrigir a data ou desfazer o pagamento
							</Label>
						</div>

						{invoicePayment.alreadyPaid.reopened ? null : (
							<p className="text-muted-foreground text-xs leading-relaxed">
								O pagamento não é registrado de novo. Este reprocessamento
								aplica apenas o que mudou nos lançamentos.
							</p>
						)}
					</div>
				) : null}

				{invoicePayment &&
				(!invoicePayment.alreadyPaid || invoicePayment.alreadyPaid.reopened) ? (
					<div className="space-y-3 rounded-md border p-3">
						<p className="font-medium text-sm">Esta fatura já foi paga?</p>
						<div className="grid grid-cols-2 gap-2">
							<Button
								type="button"
								variant={invoicePayment.paid ? "outline" : "default"}
								onClick={() => invoicePayment.onPaidChange(false)}
								disabled={isPending}
							>
								Ainda não foi paga
							</Button>
							<Button
								type="button"
								variant={invoicePayment.paid ? "default" : "outline"}
								onClick={() => invoicePayment.onPaidChange(true)}
								disabled={isPending}
							>
								Já foi paga
							</Button>
						</div>

						{invoicePayment.paid ? (
							<div className="space-y-3">
								<div className="space-y-1.5">
									<Label htmlFor="import-invoice-payment-date">
										Data do pagamento
									</Label>
									<Input
										id="import-invoice-payment-date"
										type="date"
										value={invoicePayment.paymentDate}
										onChange={(event) =>
											invoicePayment.onPaymentDateChange(event.target.value)
										}
										disabled={isPending}
									/>
									<p className="text-muted-foreground text-xs leading-relaxed">
										Esta data será gravada como a data em que a fatura foi paga
										{invoicePayment.dueDate
											? " — vem preenchida com o vencimento."
											: "."}
									</p>
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="import-invoice-payment-account">
										Conta de onde saiu o pagamento
									</Label>
									<Select
										value={invoicePayment.accountId ?? ""}
										onValueChange={invoicePayment.onAccountChange}
										disabled={isPending}
									>
										<SelectTrigger
											id="import-invoice-payment-account"
											className="w-full"
										>
											<SelectValue placeholder="Selecione a conta">
												{selectedPaymentAccount ? (
													<AccountCardSelectContent
														label={selectedPaymentAccount.label}
														logo={selectedPaymentAccount.logo}
													/>
												) : null}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{invoicePayment.accountOptions.map((option) => (
												<SelectItem key={option.value} value={option.value}>
													<AccountCardSelectContent
														label={option.label}
														logo={option.logo}
													/>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						) : (
							<p className="text-muted-foreground text-xs leading-relaxed">
								A fatura fica em aberto. Você pode marcar como paga depois, na
								tela da fatura.
							</p>
						)}
					</div>
				) : null}

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={onConfirm}
						disabled={isPending || !canConfirm}
					>
						{isPending
							? isPaidInvoiceImport
								? "Processando…"
								: "Importando…"
							: isPaidInvoiceImport
								? "Confirmar pagamento"
								: "Confirmar importação"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const summaryToneClassName = {
	default: "text-foreground",
	success: "text-emerald-600 dark:text-emerald-400",
	info: "text-blue-600 dark:text-blue-400",
	destructive: "text-destructive",
} as const;

function SummaryRow({
	label,
	value,
	emphasis = false,
	tone = "default",
	prefix,
}: {
	label: string;
	value: number;
	emphasis?: boolean;
	tone?: keyof typeof summaryToneClassName;
	prefix?: "+" | "-";
}) {
	const countLabel = `${prefix ?? ""}${value} lançamento${value !== 1 ? "s" : ""}`;

	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span
				className={cn(
					emphasis ? "font-semibold" : "font-medium",
					summaryToneClassName[tone],
				)}
			>
				{countLabel}
			</span>
		</div>
	);
}
