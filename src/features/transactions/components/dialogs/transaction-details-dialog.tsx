"use client";

import Image from "next/image";
import {
	type ComponentType,
	type CSSProperties,
	useEffect,
	useState,
} from "react";
import { fetchTransactionByIdClient } from "@/features/transactions/lib/transactions-api-client";
import {
	currencyFormatter,
	formatCondition,
	formatPeriod,
	getPayerDisplayName,
} from "@/features/transactions/lib/formatting-helpers";
import { EstablishmentLogo } from "@/shared/components/entity-avatar";
import { TransactionTypeBadge } from "@/shared/components/transaction-type-badge";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Separator } from "@/shared/components/ui/separator";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { getAvatarSrc } from "@/shared/lib/payers/utils";
import { getCategoryColorFromName } from "@/shared/utils/category-colors";
import { formatDate, parseLocalDateString } from "@/shared/utils/date";
import { getIconComponent, getPaymentMethodIcon } from "@/shared/utils/icons";
import { AttachmentSection } from "../attachments/attachment-section";
import { InstallmentSeriesList } from "../shared/installment-series-list";
import { InstallmentTimeline } from "../shared/installment-timeline";
import type { TransactionItem } from "../types";

interface TransactionDetailsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	transaction: TransactionItem | null;
	onEdit?: (transaction: TransactionItem) => void;
}

export function TransactionDetailsDialog({
	open,
	onOpenChange,
	transaction,
	onEdit,
}: TransactionDetailsDialogProps) {
	const [attachmentCount, setAttachmentCount] = useState<number | null>(null);
	const [resolvedTransaction, setResolvedTransaction] =
		useState<TransactionItem | null>(null);
	const [isLoadingDetails, setIsLoadingDetails] = useState(false);

	useEffect(() => {
		setAttachmentCount(null);
	}, [transaction?.id]);

	useEffect(() => {
		if (!open || !transaction?.id) {
			setResolvedTransaction(null);
			setIsLoadingDetails(false);
			return;
		}

		let cancelled = false;
		setIsLoadingDetails(true);

		void fetchTransactionByIdClient(transaction.id)
			.then((full) => {
				if (cancelled) return;
				setResolvedTransaction(full);
			})
			.catch(() => {
				if (cancelled) return;
				setResolvedTransaction(null);
			})
			.finally(() => {
				if (!cancelled) setIsLoadingDetails(false);
			});

		return () => {
			cancelled = true;
		};
	}, [open, transaction?.id]);

	if (!transaction) return null;

	const listMissingRelations =
		!transaction.pagadorName &&
		!transaction.contaName &&
		!transaction.cartaoName &&
		!transaction.categoriaName;

	const details = resolvedTransaction ?? transaction;
	const awaitingRelationDetails =
		isLoadingDetails || (open && listMissingRelations && !resolvedTransaction);

	const isInstallment =
		details.condition?.toLowerCase() === "parcelado" &&
		details.currentInstallment &&
		details.installmentCount;

	const valorParcela = Math.abs(details.amount);
	const totalParcelas = details.installmentCount ?? 1;
	const parcelaAtual = details.currentInstallment ?? 1;
	const valorTotal = isInstallment
		? valorParcela * totalParcelas
		: valorParcela;
	const valorRestante = isInstallment
		? valorParcela * (totalParcelas - parcelaAtual)
		: 0;

	const isBoleto = details.paymentMethod === "Boleto";

	const handleEdit = () => {
		onOpenChange(false);
		onEdit?.(details);
	};

	/** Abre a edição de outra parcela da mesma série, direto pela lista. */
	const handleEditOccurrence = (transactionId: string) => {
		if (!onEdit) return;

		if (transactionId === details.id) {
			handleEdit();
			return;
		}

		void fetchTransactionByIdClient(transactionId).then((full) => {
			if (!full) return;
			onOpenChange(false);
			onEdit(full);
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="min-w-0 overflow-x-hidden sm:max-w-xl">
				<DialogHeader className="text-left">
					<div className="flex min-w-0 items-start gap-2">
						<EstablishmentLogo size={40} name={details.name} />
						<div className="min-w-0 flex-1">
							<DialogTitle className="text-balance break-words leading-snug">
								{details.name}
							</DialogTitle>
							<DialogDescription className="mt-1">
								{formatDate(details.purchaseDate)}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="min-w-0 max-h-[60vh] overflow-x-hidden overflow-y-auto text-sm">
					<div className="min-w-0 space-y-4">
						<section className="rounded-lg border p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="text-xs uppercase tracking-wide text-muted-foreground">
										Total
									</p>
									<p className="mt-1 text-2xl font-semibold">
										{currencyFormatter.format(valorTotal)}
									</p>
								</div>
								<Badge
									variant={details.isSettled ? "secondary" : "info"}
									className={
										details.isSettled ? "text-success bg-success/10" : undefined
									}
								>
									{details.isSettled ? "Pago" : "Em aberto"}
								</Badge>
							</div>
							<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								<TransactionTypeBadge
									kind={
										details.categoriaName === "Saldo inicial"
											? "Saldo inicial"
											: details.transactionType
									}
								/>
								<span>{formatCondition(details.condition)}</span>
							</div>
						</section>

						<section className="space-y-2">
							<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Detalhes
							</h3>
							<ul className="min-w-0 grid gap-2 rounded-lg border p-3">
								<DetailRow
									label="ID"
									value={details.id}
									valueClassName="font-mono"
								/>

								<DetailRow
									label="Período"
									value={formatPeriod(details.period)}
								/>

								<li className="flex items-center justify-between">
									<span className="text-muted-foreground">
										Forma de Pagamento
									</span>
									<span className="flex items-center gap-1.5">
										{getPaymentMethodIcon(details.paymentMethod)}
										<span>{details.paymentMethod}</span>
									</span>
								</li>

								<li className="min-w-0 flex items-center justify-between gap-3">
									<span className="text-muted-foreground">
										{details.cartaoName ? "Cartão" : "Conta"}
									</span>
									{(() => {
										if (awaitingRelationDetails) {
											return (
												<span className="min-w-0 truncate text-muted-foreground">
													Carregando...
												</span>
											);
										}
										const accountLabel =
											details.cartaoName ?? details.contaName;
										if (!accountLabel) {
											return <span className="min-w-0 truncate">—</span>;
										}
										const logoSrc = resolveLogoSrc(
											details.cartaoLogo ?? details.contaLogo,
										);
										return (
											<span className="inline-flex min-w-0 items-center gap-2">
												{logoSrc && (
													<Image
														src={logoSrc}
														alt={`Logo de ${accountLabel}`}
														width={20}
														height={20}
														className="shrink-0 rounded-full"
													/>
												)}
												<span className="min-w-0 truncate">{accountLabel}</span>
											</span>
										);
									})()}
								</li>

								<li className="min-w-0 flex items-center justify-between gap-3">
									<span className="text-muted-foreground">Categoria</span>
									{(() => {
										if (awaitingRelationDetails) {
											return (
												<span className="min-w-0 truncate text-muted-foreground">
													Carregando...
												</span>
											);
										}
										if (!details.categoriaName) {
											return <span className="min-w-0 truncate">—</span>;
										}
										const IconComponent = details.categoriaIcon
											? (getIconComponent(
													details.categoriaIcon,
												) as ComponentType<{
													className?: string;
													style?: CSSProperties;
												}> | null)
											: null;
										const color = getCategoryColorFromName(
											details.categoriaName,
										);
										return (
											<span className="inline-flex min-w-0 items-center gap-1.5">
												{IconComponent ? (
													<IconComponent
														className="size-3.5 shrink-0"
														style={{ color }}
													/>
												) : null}
												<span className="min-w-0 truncate">
													{details.categoriaName}
												</span>
											</span>
										);
									})()}
								</li>

								<li className="min-w-0 flex items-center justify-between gap-3">
									<span className="text-muted-foreground">Responsável</span>
									{(() => {
										if (awaitingRelationDetails) {
											return (
												<span className="min-w-0 truncate text-muted-foreground">
													Carregando...
												</span>
											);
										}
										const label = details.pagadorName?.trim() || "—";
										if (label === "—") {
											return <span className="min-w-0 truncate">—</span>;
										}
										const displayName = getPayerDisplayName(
											details.pagadorName,
										);
										const avatarSrc = getAvatarSrc(details.pagadorAvatar);
										const initial = displayName.charAt(0).toUpperCase() || "?";
										return (
											<span className="inline-flex min-w-0 items-center gap-2">
												<Avatar className="size-5">
													<AvatarImage
														src={avatarSrc}
														alt={`Avatar de ${label}`}
													/>
													<AvatarFallback className="text-[10px] font-medium uppercase">
														{initial}
													</AvatarFallback>
												</Avatar>
												<span className="min-w-0 truncate">{label}</span>
											</span>
										);
									})()}
								</li>

								{isBoleto && details.dueDate && (
									<DetailRow
										label="Vencimento"
										value={formatDate(details.dueDate)}
									/>
								)}

								{details.isDivided && (
									<li className="flex items-center justify-between">
										<span className="text-muted-foreground">Divisão</span>
										<Badge variant="outline">Dividido</Badge>
									</li>
								)}
							</ul>
						</section>

						<section className="space-y-2">
							<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Valores
							</h3>
							<ul className="min-w-0 grid gap-2 rounded-lg border p-3">
								{isInstallment && (
									<li className="mb-1">
										<InstallmentTimeline
											purchaseDate={parseLocalDateString(details.purchaseDate)}
											currentInstallment={parcelaAtual}
											totalInstallments={totalParcelas}
											period={details.period}
										/>
									</li>
								)}

								<DetailRow
									label={isInstallment ? "Valor da Parcela" : "Valor"}
									value={currencyFormatter.format(valorParcela)}
								/>

								{isInstallment && (
									<DetailRow
										label="Valor Restante"
										value={currencyFormatter.format(valorRestante)}
									/>
								)}

								{details.condition === "Recorrente" ? (
									<DetailRow
										label="Recorrência"
										value={
											details.recurrenceCount
												? `${details.recurrenceCount} meses`
												: "Sem prazo definido"
										}
									/>
								) : null}
							</ul>
						</section>

						{isInstallment && details.seriesId ? (
							<section className="space-y-2">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Parcelas
								</h3>
								<InstallmentSeriesList
									seriesId={details.seriesId}
									currentTransactionId={details.id}
									installmentCount={totalParcelas}
									onEditOccurrence={
										onEdit && !details.readonly
											? handleEditOccurrence
											: undefined
									}
								/>
							</section>
						) : null}

						{details.note ? (
							<section className="space-y-2">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Notas
								</h3>
								<div className="rounded-lg border p-3 text-foreground">
									{details.note}
								</div>
							</section>
						) : null}

						{attachmentCount !== 0 && (
							<section className="space-y-2">
								<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Anexos
								</h3>
								<div className="min-w-0">
									<AttachmentSection
										transactionId={details.id}
										readonly
										onLoaded={setAttachmentCount}
									/>
								</div>
							</section>
						)}
					</div>
				</div>

				<Separator />

				<DialogFooter>
					<DialogClose asChild>
						<Button type="button" variant="outline">
							Fechar
						</Button>
					</DialogClose>
					{onEdit && !details.readonly && (
						<Button onClick={handleEdit}>Alterar</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface DetailRowProps {
	label: string;
	value: string;
	valueClassName?: string;
}

function DetailRow({ label, value, valueClassName }: DetailRowProps) {
	return (
		<li className="min-w-0 flex items-center justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span className={`min-w-0 truncate ${valueClassName ?? ""}`}>
				{value}
			</span>
		</li>
	);
}
