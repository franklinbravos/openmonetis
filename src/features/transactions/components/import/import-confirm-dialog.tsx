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
