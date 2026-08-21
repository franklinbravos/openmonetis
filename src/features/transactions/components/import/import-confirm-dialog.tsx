"use client";

import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
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
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";

export type ImportInvoicePaymentPrompt = {
	/** Vencimento da fatura, sugerido como data do pagamento. */
	dueDate: string | null;
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
export type ImportPreviousInvoicePrompt = {
	previousPeriodLabel: string;
	previousTotal: number;
	paidAmount: number;
	carriedOver: number;
	/** Débito hoje registrado, quando difere do que foi realmente pago. */
	registeredPaymentAmount: number | null;
	/** `true` quando a fatura anterior ficou parcialmente paga. */
	isPartial: boolean;
	/** A evidência do arquivo fecha com o total cadastrado da anterior? */
	reconciles: boolean;
	confirmed: boolean;
	onConfirmedChange: (confirmed: boolean) => void;
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
					) : nothingToConfirm ? (
						<p className="text-muted-foreground text-sm leading-relaxed">
							A fatura já está conferida com o arquivo: nada a importar, remover
							ou corrigir. Marque abaixo se ela já foi paga para registrar a
							baixa e fechar o mês.
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
					{excludedCount > 0 ? (
						<SummaryRow
							label="Excluídos do arquivo"
							value={excludedCount}
							tone="destructive"
							prefix="-"
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

				{hasInvoiceTotalMismatch && onInvoiceTotalOverrideChange ? (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
						<p className="text-destructive text-sm">
							O total projetado difere em{" "}
							{formatCurrency(Math.abs(invoiceTotalDelta))} do total do arquivo.
						</p>
						<div className="mt-3 flex items-start gap-2">
							<Checkbox
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
							"space-y-3 rounded-md border p-3",
							previousInvoice.reconciles
								? "border-emerald-500/40 bg-emerald-500/5"
								: "border-amber-500/40 bg-amber-500/5",
						)}
					>
						<p className="font-medium text-sm">
							{previousInvoice.isPartial
								? `A fatura de ${previousInvoice.previousPeriodLabel} foi paga em parte`
								: `Pagamento da fatura de ${previousInvoice.previousPeriodLabel}`}
						</p>

						<dl className="grid gap-2 text-sm sm:grid-cols-3">
							<div>
								<dt className="text-muted-foreground text-xs">Total</dt>
								<dd className="tabular-nums">
									{formatCurrency(previousInvoice.previousTotal)}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs">Pago</dt>
								<dd className="font-medium text-emerald-600 tabular-nums">
									{formatCurrency(previousInvoice.paidAmount)}
								</dd>
							</div>
							{previousInvoice.carriedOver > 0 ? (
								<div>
									<dt className="text-muted-foreground text-xs">
										Rolou para cá
									</dt>
									<dd className="font-medium tabular-nums">
										{formatCurrency(previousInvoice.carriedOver)}
									</dd>
								</div>
							) : null}
						</dl>

						<div className="flex items-start gap-2">
							<Checkbox
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
								Confirmar o pagamento de {previousInvoice.previousPeriodLabel}
							</Label>
						</div>

						{previousInvoice.reconciles ? null : (
							<p className="text-xs leading-relaxed text-amber-700 dark:text-amber-500">
								O arquivo diz que se pagou{" "}
								{formatCurrency(previousInvoice.paidAmount)}, mas a fatura de{" "}
								{previousInvoice.previousPeriodLabel} soma{" "}
								{formatCurrency(previousInvoice.previousTotal)} no cadastro.
								Vale conferir aquele mês antes de confirmar — pode faltar
								lançamento ou haver valor errado.
							</p>
						)}

						<p className="text-muted-foreground text-xs leading-relaxed">
							{previousInvoice.confirmed
								? `A fatura passa a constar como ${
										previousInvoice.isPartial ? "paga parcialmente" : "paga"
									}${
										previousInvoice.registeredPaymentAmount != null &&
										Math.abs(
											previousInvoice.registeredPaymentAmount -
												previousInvoice.paidAmount,
										) > 0.01
											? `, e o débito na conta é corrigido de ${formatCurrency(
													previousInvoice.registeredPaymentAmount,
												)} para ${formatCurrency(previousInvoice.paidAmount)}`
											: ""
									}.`
								: "Sem confirmar, a fatura anterior fica como está e você pode ajustá-la depois na tela dela."}
						</p>
					</div>
				) : null}

				{invoicePayment ? (
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
