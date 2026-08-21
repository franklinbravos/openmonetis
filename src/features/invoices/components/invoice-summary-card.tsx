"use client";

import {
	RiCheckboxCircleLine,
	RiEditLine,
	RiEqualizerLine,
	RiFileExcel2Line,
} from "@remixicon/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	updateInvoicePaymentStatusAction,
	updatePaymentDateAction,
} from "@/features/invoices/actions";
import type { InvoiceReconciliationTransaction } from "@/features/invoices/lib/invoice-reconciliation";
import { resolveInvoicePaymentTiming } from "@/features/invoices/lib/payment-timing";
import type { InvoicePaymentEntry } from "@/features/invoices/queries";
import { fetchTransactionByIdAction } from "@/features/transactions/actions/fetch-by-id";
import type { TransactionDialogOptions } from "@/features/transactions/actions/fetch-dialog-options";
import { fetchTransactionDialogOptionsAction } from "@/features/transactions/actions/fetch-dialog-options";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
import type { TransactionItem } from "@/features/transactions/components/types";
import StatusDot from "@/shared/components/feedback/status-dot";
import MoneyValues from "@/shared/components/money-values";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Spinner } from "@/shared/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { resolveCardBrandAsset } from "@/shared/lib/cards/brand-assets";
import { invoiceSourceTotalKindLabel } from "@/shared/lib/import/invoice-source-total";
import { roundMoney } from "@/shared/lib/import/invoice-total";
import type { InvoiceSourceTotalKind } from "@/shared/lib/import/types";
import {
	INVOICE_PAYMENT_STATUS,
	INVOICE_STATUS_BADGE_VARIANT,
	INVOICE_STATUS_LABEL,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly, formatDateOnlyLabel } from "@/shared/utils/date";
import { formatFinancialDateLabel } from "@/shared/utils/financial-dates";
import { displayPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";
import { AdjustInvoiceDialog } from "./adjust-invoice-dialog";
import { EditPaymentDateDialog } from "./edit-payment-date-dialog";
import { InvoiceImportHistoryButton } from "./invoice-import-history-button";
import { InvoiceViewSourceButton } from "./invoice-view-source-button";

type PaymentAccountOption = {
	value: string;
	label: string;
	logo?: string | null;
};

type InvoiceReconciliationSummary = {
	sourceTotal: number;
	sourceKind: InvoiceSourceTotalKind;
	sourceOverride: boolean;
	delta: number;
	sourceRounding?: number;
	sourceFileName?: string | null;
	extraTransactions: InvoiceReconciliationTransaction[];
};

type InvoiceSummaryCardProps = {
	cardId: string;
	period: string;
	cardBrand: string | null;
	cardStatus: string | null;
	closingDay: string;
	dueDay: string;
	totalAmount: number;
	limitAmount: number | null;
	invoiceStatus: InvoicePaymentStatus;
	paymentDate: Date | null;
	/**
	 * Pagamentos registrados para esta fatura.
	 *
	 * Pode haver mais de um no mês — antecipação para liberar limite, ou uma
	 * parte na data e o resto depois. Mostrar só um esconderia o resto e o valor
	 * exibido não fecharia com o que saiu da conta.
	 */
	payments?: InvoicePaymentEntry[];
	defaultPaymentAccountId: string | null;
	paymentAccountOptions: PaymentAccountOption[];
	hasImportHistory?: boolean;
	hasImportAttachment?: boolean;
	reconciliation?: InvoiceReconciliationSummary | null;
	/**
	 * Valor exibido como total da fatura: o do arquivo quando a soma dos
	 * lançamentos só diverge por arredondamento. As demais contas — cota do
	 * pagador, ajuste, conferência — seguem usando `totalAmount`.
	 */
	displayTotalAmount?: number;
};

const actionLabelByStatus: Record<InvoicePaymentStatus, string> = {
	[INVOICE_PAYMENT_STATUS.PENDING]: "Marcar como paga",
	[INVOICE_PAYMENT_STATUS.PAID]: "Desfazer pagamento",
	// Parcial ainda tem saldo em aberto: a ação útil é quitar o resto.
	[INVOICE_PAYMENT_STATUS.PARTIAL]: "Marcar como paga",
};

const actionVariantByStatus: Record<
	InvoicePaymentStatus,
	"default" | "outline"
> = {
	[INVOICE_PAYMENT_STATUS.PENDING]: "outline",
	[INVOICE_PAYMENT_STATUS.PAID]: "outline",
	[INVOICE_PAYMENT_STATUS.PARTIAL]: "outline",
};

const actionButtonClassName =
	"h-auto min-h-8 w-full min-w-0 px-2 py-1.5 text-[11px] leading-tight sm:text-xs";

const pendingPaymentButtonClassName = cn(
	actionButtonClassName,
	"border-primary bg-background text-primary hover:bg-primary/5 hover:text-primary",
);

const formatDay = (value: string) => value.padStart(2, "0");

const getCardStatusDotColor = (status: string | null) => {
	if (!status) return "bg-gray-400";
	const s = status.toLowerCase();
	return s === "ativo" || s === "active" ? "bg-success" : "bg-gray-400";
};

export function InvoiceSummaryCard({
	cardId,
	period,
	cardBrand,
	cardStatus,
	closingDay,
	dueDay,
	totalAmount,
	limitAmount,
	invoiceStatus,
	paymentDate: initialPaymentDate,
	payments = [],
	defaultPaymentAccountId,
	paymentAccountOptions,
	hasImportHistory = false,
	hasImportAttachment = false,
	reconciliation = null,
	displayTotalAmount,
}: InvoiceSummaryCardProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [paymentToEdit, setPaymentToEdit] = useState<TransactionItem | null>(
		null,
	);
	const [paymentDialogOptions, setPaymentDialogOptions] =
		useState<TransactionDialogOptions | null>(null);
	const [loadingPaymentId, setLoadingPaymentId] = useState<string | null>(null);
	const [paymentDate, setPaymentDate] = useState<Date>(
		initialPaymentDate ?? new Date(),
	);
	const [paymentAccountId, setPaymentAccountId] = useState<string>(
		defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
	);
	const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

	useEffect(() => {
		setPaymentDate(initialPaymentDate ?? new Date());
	}, [initialPaymentDate]);

	useEffect(() => {
		setPaymentAccountId(
			defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
		);
	}, [defaultPaymentAccountId, paymentAccountOptions]);

	const brandAsset = resolveCardBrandAsset(cardBrand);
	const isPaid = invoiceStatus === INVOICE_PAYMENT_STATUS.PAID;
	/**
	 * Parte da fatura foi paga e o resto virou cobrança do mês seguinte. Tem
	 * pagamento, tem data e tem anexo como qualquer fatura quitada — o que não
	 * tem é a quitação, e é só isso que a difere na tela.
	 */
	const isPartial = invoiceStatus === INVOICE_PAYMENT_STATUS.PARTIAL;
	const hasPayment = isPaid || isPartial;
	const importHref = `/transactions/import?cartao=${encodeURIComponent(cardId)}&periodo=${encodeURIComponent(period)}`;
	const registeredAbsTotal = Math.abs(totalAmount);
	const heroTotal = Math.abs(displayTotalAmount ?? totalAmount);
	const hasSourceReconciliation = reconciliation?.sourceTotal != null;
	const reconciliationDelta = reconciliation?.delta ?? null;
	const sourceRounding = reconciliation?.sourceRounding ?? 0;
	const hasReconciliationMismatch =
		reconciliationDelta != null && Math.abs(reconciliationDelta) > 0.01;
	/**
	 * Fatura conferida: existe arquivo atrelado e o cadastro fecha com ele. É o
	 * sinal que diz ao usuário que o fechamento está fechado de verdade, em vez
	 * de ele precisar abrir a conferência e comparar os números na mão.
	 */
	const isReconciled = hasSourceReconciliation && !hasReconciliationMismatch;
	/**
	 * Valor efetivamente cobrado pelo banco. Só vale mostrar em separado quando
	 * difere do que a fatura exibe — senão é a mesma informação duas vezes.
	 */
	const chargedTotal = reconciliation?.sourceTotal ?? null;
	const showChargedTotal =
		chargedTotal != null && Math.abs(chargedTotal - heroTotal) > 0.001;
	const extraTransactions =
		reconciliation?.extraTransactions.filter(
			(transaction) => transaction.group === "extra",
		) ?? [];
	const paymentTiming =
		hasPayment && initialPaymentDate
			? resolveInvoicePaymentTiming(initialPaymentDate, period, dueDay)
			: null;
	const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
	/**
	 * O que sobrou da fatura e entrou na seguinte como "valor pendente do mês
	 * anterior". Sem esse número a tela mostra uma fatura de seis mil com um
	 * pagamento de mil e nenhuma explicação para a diferença.
	 */
	const rolledOverAmount = isPartial ? roundMoney(heroTotal - paidTotal) : 0;
	const accountLabelById = new Map(
		paymentAccountOptions.map((option) => [option.value, option.label]),
	);

	const targetStatus = isPaid
		? INVOICE_PAYMENT_STATUS.PENDING
		: INVOICE_PAYMENT_STATUS.PAID;

	const handleAction = (accountId?: string) => {
		startTransition(async () => {
			const result = await updateInvoicePaymentStatusAction({
				cardId,
				period,
				status: targetStatus,
				paymentDate:
					targetStatus === INVOICE_PAYMENT_STATUS.PAID
						? paymentDate.toISOString().split("T")[0]
						: undefined,
				paymentAccountId:
					targetStatus === INVOICE_PAYMENT_STATUS.PAID ? accountId : undefined,
			});

			if (result.success) {
				toast.success(result.message);
				setPaymentDialogOpen(false);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	const handlePaymentConfirm = () => {
		if (!paymentAccountId) {
			toast.error("Selecione uma conta para pagar a fatura.");
			return;
		}

		handleAction(paymentAccountId);
	};

	/**
	 * O pagamento da fatura é um lançamento como qualquer outro, na conta que foi
	 * debitada. Editar daqui abre o mesmo diálogo da tela de lançamentos — valor,
	 * data e conta —, então o extrato da conta reflete a correção sem uma segunda
	 * viagem do usuário até lá.
	 */
	const handleEditPayment = (paymentId: string) => {
		setLoadingPaymentId(paymentId);
		startTransition(async () => {
			const [transaction, options] = await Promise.all([
				fetchTransactionByIdAction(paymentId),
				fetchTransactionDialogOptionsAction(),
			]);
			setLoadingPaymentId(null);
			if (!transaction) {
				toast.error("Lançamento do pagamento não encontrado.");
				return;
			}
			setPaymentDialogOptions(options);
			setPaymentToEdit(transaction);
		});
	};

	const handleDateChange = (newDate: Date) => {
		setPaymentDate(newDate);
		startTransition(async () => {
			const result = await updatePaymentDateAction({
				cardId,
				period,
				paymentDate: newDate.toISOString().split("T")[0] ?? "",
			});

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	const showViewInvoice = hasPayment && hasImportAttachment;
	const actionColumnCount =
		2 + Number(hasImportHistory) + Number(showViewInvoice);

	return (
		<Card className="gap-0 py-0 space-y-2">
			<CardContent className="px-4 py-4 sm:px-5 sm:py-5">
				<div className="flex flex-col gap-4">
					{/* Valor da fatura (hero) */}
					<div className="space-y-3">
						<p className="text-sm text-muted-foreground">
							Valor da fatura: {displayPeriod(period)}
						</p>
						<div className="flex items-center gap-2">
							<MoneyValues
								amount={heroTotal}
								className={cn(
									"text-3xl leading-none tracking-tighter sm:text-2xl",
									isPaid ? "text-success" : "text-foreground",
								)}
							/>
							<AdjustInvoiceDialog
								cardId={cardId}
								period={period}
								currentTotal={totalAmount}
								suggestedTargetAmount={reconciliation?.sourceTotal ?? null}
								trigger={
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="text-primary hover:text-primary"
										aria-label="Ajustar fatura"
									>
										<RiEqualizerLine className="size-4" />
									</Button>
								}
							/>
						</div>
						{showChargedTotal ? (
							<p className="text-muted-foreground text-xs">
								Cobrado pelo banco no arquivo:{" "}
								<span className="font-medium tabular-nums text-foreground">
									{formatCurrency(chargedTotal)}
								</span>
							</p>
						) : null}
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								variant={INVOICE_STATUS_BADGE_VARIANT[invoiceStatus]}
								className="text-xs"
							>
								{INVOICE_STATUS_LABEL[invoiceStatus]}
							</Badge>
							{isReconciled ? (
								<Badge
									variant="outline"
									className="gap-1 border-emerald-500/40 text-emerald-700 text-xs dark:text-emerald-400"
									title={`Confere com ${reconciliation?.sourceFileName ?? "o arquivo importado"}`}
								>
									<RiCheckboxCircleLine className="size-3.5" aria-hidden />
									Conferida com o arquivo
								</Badge>
							) : null}
							{cardStatus ? (
								<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<StatusDot color={getCardStatusDotColor(cardStatus)} />
									<span>{cardStatus}</span>
								</div>
							) : null}
							{paymentTiming ? (
								<div className="flex flex-wrap items-center gap-1">
									<InvoicePaymentDateMeta timing={paymentTiming} />
									<EditPaymentDateDialog
										trigger={
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												className="size-6 text-muted-foreground hover:text-foreground"
												aria-label="Editar data de pagamento"
											>
												<RiEditLine className="size-3.5" />
											</Button>
										}
										currentDate={paymentDate}
										onDateChange={handleDateChange}
									/>
								</div>
							) : null}
						</div>
					</div>

					{payments.length > 0 ? (
						<InvoicePaymentsPanel
							payments={payments}
							paidTotal={paidTotal}
							pendingAmount={rolledOverAmount}
							accountLabelById={accountLabelById}
							loadingPaymentId={loadingPaymentId}
							onEditPayment={handleEditPayment}
						/>
					) : null}

					{hasSourceReconciliation && reconciliation ? (
						<div
							className={cn(
								"space-y-3 rounded-lg border px-3 py-3 sm:px-4",
								hasReconciliationMismatch
									? "border-destructive/30 bg-destructive/5"
									: "border-emerald-500/30 bg-emerald-500/5",
							)}
						>
							<div className="flex flex-wrap items-center gap-2">
								<p className="font-medium text-sm">Conferência com o arquivo</p>
								<Badge variant="outline" className="font-normal text-xs">
									{invoiceSourceTotalKindLabel(reconciliation.sourceKind)}
								</Badge>
								{reconciliation.sourceOverride ? (
									<Badge variant="secondary" className="font-normal text-xs">
										Importado com diferença
									</Badge>
								) : null}
							</div>
							{/* Fechando, os três números viram uma linha: o cabeçalho da
							    fatura é lido de relance, e um grid de três colunas com
							    rótulos empilhados ocupava espaço demais para dizer "está
							    tudo certo". Divergindo, o detalhe volta. */}
							<dl
								className={cn(
									"text-sm",
									hasReconciliationMismatch
										? "grid gap-2 sm:grid-cols-3"
										: "flex flex-wrap items-baseline gap-x-4 gap-y-1",
								)}
							>
								<div
									className={cn(
										!hasReconciliationMismatch && "flex items-baseline gap-1.5",
									)}
								>
									<dt className="text-muted-foreground text-xs">
										Total do arquivo
									</dt>
									<dd className="font-medium tabular-nums">
										{formatCurrency(reconciliation.sourceTotal)}
									</dd>
								</div>
								<div
									className={cn(
										!hasReconciliationMismatch && "flex items-baseline gap-1.5",
									)}
								>
									<dt className="text-muted-foreground text-xs">
										Total cadastrado
									</dt>
									<dd className="font-medium tabular-nums">
										{formatCurrency(registeredAbsTotal)}
									</dd>
								</div>
								<div
									className={cn(
										!hasReconciliationMismatch && "flex items-baseline gap-1.5",
									)}
								>
									<dt className="text-muted-foreground text-xs">Diferença</dt>
									<dd
										className={cn(
											"font-semibold tabular-nums",
											hasReconciliationMismatch
												? "text-destructive"
												: "text-emerald-700 dark:text-emerald-300",
										)}
									>
										{reconciliationDelta != null && reconciliationDelta > 0
											? "+"
											: reconciliationDelta != null && reconciliationDelta < 0
												? "−"
												: ""}
										{formatCurrency(Math.abs(reconciliationDelta ?? 0))}
									</dd>
								</div>
							</dl>

							{/* O arredondamento do banco só merece explicação quando algo
							    não fecha; conferido, ele é ruído. */}
							{sourceRounding !== 0 && hasReconciliationMismatch ? (
								<p className="text-muted-foreground text-xs leading-relaxed">
									O arquivo declara {formatCurrency(reconciliation.sourceTotal)}{" "}
									e suas próprias linhas somam{" "}
									{formatCurrency(reconciliation.sourceTotal - sourceRounding)}{" "}
									— o banco arredonda parcelas com fração de centavo. A
									conferência usa a soma das linhas.
								</p>
							) : null}

							{hasReconciliationMismatch && extraTransactions.length > 0 ? (
								<div className="space-y-2">
									<p className="text-muted-foreground text-xs">
										Lançamentos a mais no OpenMonetis (
										{extraTransactions.length})
									</p>
									<p className="text-muted-foreground text-[11px] leading-relaxed">
										Cadastrados aqui e ausentes do arquivo importado.
									</p>
									<ul className="space-y-1">
										{extraTransactions.slice(0, 6).map((transaction) => (
											<li
												key={transaction.id}
												className="rounded-md border border-border/50 bg-background/70 px-2 py-1 text-xs"
											>
												<span className="font-medium">{transaction.name}</span>
												{" · "}
												{formatCurrency(Math.abs(transaction.amount))}
											</li>
										))}
									</ul>
									{extraTransactions.length > 6 ? (
										<p className="text-muted-foreground text-xs">
											+{extraTransactions.length - 6} outro(s)
										</p>
									) : null}
								</div>
							) : null}

							{hasReconciliationMismatch ? (
								<div className="flex flex-wrap gap-2">
									<Button type="button" variant="outline" size="sm" asChild>
										<Link href={importHref}>Retomar revisão</Link>
									</Button>
									<AdjustInvoiceDialog
										cardId={cardId}
										period={period}
										currentTotal={totalAmount}
										suggestedTargetAmount={reconciliation.sourceTotal}
										trigger={
											<Button type="button" size="sm" variant="secondary">
												Ajustar fatura
											</Button>
										}
									/>
								</div>
							) : null}
						</div>
					) : null}

					{/* Linha 3 — metadados do cartão */}
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<MetaItem label="Vencimento">
							<span className="text-sm font-medium text-foreground">
								Dia {formatDay(dueDay)}
							</span>
						</MetaItem>

						<MetaItem label="Fechamento">
							<span className="text-sm font-medium text-foreground">
								Dia {formatDay(closingDay)}
							</span>
						</MetaItem>

						{typeof limitAmount === "number" ? (
							<MetaItem label="Limite total">
								<span className="text-sm font-medium text-foreground">
									{formatCurrency(limitAmount)}
								</span>
							</MetaItem>
						) : null}

						{cardBrand ? (
							<MetaItem label="Bandeira">
								<div className="flex items-center gap-1.5">
									{brandAsset ? (
										<Image
											src={brandAsset}
											alt={cardBrand}
											width={24}
											height={24}
											className="h-4 w-auto shrink-0"
										/>
									) : null}
									<span className="text-sm font-medium text-foreground truncate">
										{cardBrand}
									</span>
								</div>
							</MetaItem>
						) : null}
					</div>

					{/* Linha 4 — ações */}
					<div
						className={cn(
							"grid w-full gap-1.5 rounded-md border border-dashed bg-muted/30 p-2",
							actionColumnCount === 4
								? "grid-cols-2 sm:grid-cols-4"
								: actionColumnCount === 3
									? "grid-cols-3"
									: "grid-cols-2",
						)}
					>
						{hasImportHistory ? (
							<InvoiceImportHistoryButton
								cardId={cardId}
								invoicePeriod={period}
								className="w-full min-w-0"
							/>
						) : null}
						{showViewInvoice ? (
							<InvoiceViewSourceButton
								cardId={cardId}
								invoicePeriod={period}
								className="w-full min-w-0"
							/>
						) : null}
						<Button
							asChild
							type="button"
							size="sm"
							variant="outline"
							className="h-auto min-h-8 w-full min-w-0 px-2 py-1.5 text-[11px] leading-tight sm:text-xs"
						>
							<Link
								href={importHref}
								className="inline-flex items-center justify-center gap-1 text-center"
							>
								<RiFileExcel2Line className="size-3.5 shrink-0" aria-hidden />
								Importar fatura
							</Link>
						</Button>
						{isPaid ? (
							<Button
								type="button"
								size="sm"
								variant={actionVariantByStatus[invoiceStatus]}
								disabled={isPending}
								onClick={() => handleAction()}
								className={actionButtonClassName}
							>
								{isPending ? "Salvando..." : actionLabelByStatus[invoiceStatus]}
							</Button>
						) : (
							<PayInvoiceDialog
								open={paymentDialogOpen}
								onOpenChange={setPaymentDialogOpen}
								isPending={isPending}
								paymentDate={paymentDate}
								onPaymentDateChange={setPaymentDate}
								accountId={paymentAccountId}
								onAccountChange={setPaymentAccountId}
								accountOptions={paymentAccountOptions}
								onConfirm={handlePaymentConfirm}
								trigger={
									<Button
										type="button"
										size="sm"
										variant={actionVariantByStatus[invoiceStatus]}
										disabled={isPending}
										className={pendingPaymentButtonClassName}
									>
										{isPending
											? "Salvando..."
											: actionLabelByStatus[invoiceStatus]}
									</Button>
								}
							/>
						)}
					</div>
				</div>
			</CardContent>

			{paymentDialogOptions && paymentToEdit ? (
				<TransactionDialog
					mode="update"
					open
					onOpenChange={(open) => {
						if (open) return;
						setPaymentToEdit(null);
						setPaymentDialogOptions(null);
						// A ação de lançamentos revalida /accounts, não /cards: sem isto a
						// fatura seguiria mostrando o valor antigo do pagamento.
						router.refresh();
					}}
					transaction={paymentToEdit}
					payerOptions={paymentDialogOptions.payerOptions}
					splitPayerOptions={paymentDialogOptions.splitPayerOptions}
					defaultPayerId={paymentDialogOptions.defaultPayerId}
					accountOptions={paymentDialogOptions.accountOptions}
					cardOptions={paymentDialogOptions.cardOptions}
					categoryOptions={paymentDialogOptions.categoryOptions}
					estabelecimentos={paymentDialogOptions.estabelecimentos}
				/>
			) : null}
		</Card>
	);
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="rounded-md border border-border/60 px-3 py-2">
			<span className="block text-sm font-medium text-muted-foreground">
				{label}
			</span>
			<div className="mt-1">{children}</div>
		</div>
	);
}

/**
 * Quanto foi pago desta fatura, quanto ficou pendente e cada pagamento feito.
 *
 * O total pago é a informação principal — e não estava em lugar nenhum quando o
 * mês teve um pagamento só: ele aparecia solto na linha de status, sem o
 * contraponto do que ficou faltando. Aqui os dois números ficam lado a lado, e
 * abaixo deles os lançamentos que compõem o pago: quem paga em vários dias para
 * reduzir juros precisa ver a soma fechar.
 *
 * Cada linha abre o lançamento na conta que foi debitada, porque é lá que uma
 * correção de valor ou data tem efeito — no extrato, não no status da fatura.
 */
function InvoicePaymentsPanel({
	payments,
	paidTotal,
	pendingAmount,
	accountLabelById,
	loadingPaymentId,
	onEditPayment,
}: {
	payments: InvoicePaymentEntry[];
	paidTotal: number;
	/** Saldo que não foi pago e entrou na fatura seguinte. */
	pendingAmount: number;
	accountLabelById: Map<string, string>;
	loadingPaymentId: string | null;
	onEditPayment: (paymentId: string) => void;
}) {
	const hasPending = pendingAmount > 0.01;
	/*
	 * Com um pagamento só e nada pendente, a própria linha é o total — repeti-lo
	 * acima seria o mesmo número duas vezes num cabeçalho que já é cheio.
	 */
	const showTotals = hasPending || payments.length > 1;

	return (
		<div className="space-y-2 rounded-lg border px-3 py-2.5">
			{showTotals ? (
				<div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
					<span className="text-xs">
						<span className="text-muted-foreground">Total pago</span>{" "}
						<span className="font-semibold tabular-nums">
							{formatCurrency(paidTotal)}
						</span>
					</span>
					{hasPending ? (
						<span className="text-xs">
							<span className="text-muted-foreground">Pendente</span>{" "}
							<span className="font-semibold text-amber-600 tabular-nums dark:text-amber-500">
								{formatCurrency(pendingAmount)}
							</span>{" "}
							<span className="text-muted-foreground">
								— rolou para a fatura seguinte, com juros e IOF
							</span>
						</span>
					) : null}
				</div>
			) : null}

			<ul className={cn("divide-y", showTotals && "border-t")}>
				{payments.map((payment) => {
					const accountLabel = payment.accountId
						? accountLabelById.get(payment.accountId)
						: null;
					const isLoading = loadingPaymentId === payment.id;

					return (
						<li key={payment.id}>
							<button
								type="button"
								onClick={() => onEditPayment(payment.id)}
								disabled={isLoading}
								className="-mx-1 flex w-full items-baseline justify-between gap-3 rounded px-1 py-1.5 text-left text-xs transition-colors hover:bg-accent disabled:opacity-60"
							>
								<span className="flex flex-wrap items-baseline gap-x-2">
									<span className="tabular-nums">
										{payment.date
											? formatDateOnly(payment.date, {
													day: "2-digit",
													month: "short",
													year: "numeric",
												})
											: "sem data"}
									</span>
									{accountLabel ? (
										<span className="text-muted-foreground">
											{accountLabel}
										</span>
									) : null}
								</span>
								<span className="flex items-center gap-1.5">
									<span className="font-medium tabular-nums">
										{formatCurrency(payment.amount)}
									</span>
									{isLoading ? (
										<Spinner className="size-3.5 text-muted-foreground" />
									) : (
										<RiEditLine
											className="size-3.5 text-muted-foreground"
											aria-hidden
										/>
									)}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function InvoicePaymentDateMeta({
	timing,
}: {
	timing: NonNullable<ReturnType<typeof resolveInvoicePaymentTiming>>;
}) {
	const paymentLabel =
		formatFinancialDateLabel(timing.paymentDate, "Pago em") ??
		formatDateOnlyLabel(timing.paymentDate);

	if (!paymentLabel) {
		return null;
	}

	const lateLabel =
		timing.lateDays === 1
			? "1 dia após o vencimento"
			: `${timing.lateDays} dias após o vencimento`;

	const weekendAdjustmentHint = timing.dueDateAdjustedForWeekend
		? `O vencimento cai em fim de semana; o prazo considerado foi ${formatDateOnly(
				timing.effectiveDueDate,
				{ day: "2-digit", month: "short", year: "numeric" },
			)}.`
		: null;

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<span className="text-xs text-muted-foreground">{paymentLabel}</span>
			{timing.isLate ? (
				<TooltipProvider delayDuration={200}>
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge
								variant="destructive"
								className="cursor-default text-[10px] uppercase tracking-wide"
							>
								Em atraso
							</Badge>
						</TooltipTrigger>
						<TooltipContent className="max-w-xs text-xs">
							<p>{lateLabel}</p>
							{weekendAdjustmentHint ? (
								<p className="mt-1 text-muted-foreground">
									{weekendAdjustmentHint}
								</p>
							) : null}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			) : null}
		</div>
	);
}

type PayInvoiceDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isPending: boolean;
	paymentDate: Date;
	onPaymentDateChange: (date: Date) => void;
	accountId: string;
	onAccountChange: (accountId: string) => void;
	accountOptions: PaymentAccountOption[];
	onConfirm: () => void;
	trigger: ReactNode;
};

function PayInvoiceDialog({
	open,
	onOpenChange,
	isPending,
	paymentDate,
	onPaymentDateChange,
	accountId,
	onAccountChange,
	accountOptions,
	onConfirm,
	trigger,
}: PayInvoiceDialogProps) {
	const paymentDateValue = paymentDate.toISOString().split("T")[0] ?? "";
	const selectedAccount = accountOptions.find(
		(option) => option.value === accountId,
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Confirmar pagamento</DialogTitle>
					<DialogDescription>
						Escolha a conta de origem e a data em que a fatura foi paga.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="invoice-payment-account">Conta de pagamento</Label>
						<Select
							value={accountId}
							onValueChange={onAccountChange}
							disabled={isPending || accountOptions.length === 0}
						>
							<SelectTrigger id="invoice-payment-account" className="w-full">
								<SelectValue placeholder="Selecione uma conta">
									{selectedAccount ? (
										<AccountCardSelectContent
											label={selectedAccount.label}
											logo={selectedAccount.logo}
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
										/>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="invoice-payment-date">Data do pagamento</Label>
						<DatePicker
							id="invoice-payment-date"
							value={paymentDateValue}
							onChange={(value) => {
								if (value) {
									onPaymentDateChange(new Date(`${value}T00:00:00`));
								}
							}}
							disabled={isPending}
						/>
					</div>
				</div>

				<DialogFooter>
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
						disabled={isPending || accountOptions.length === 0}
					>
						{isPending ? "Confirmando..." : "Confirmar pagamento"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
