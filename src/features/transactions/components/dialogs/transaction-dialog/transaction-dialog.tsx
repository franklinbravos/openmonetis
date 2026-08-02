"use client";
import { RiArrowDropDownLine } from "@remixicon/react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	CreateAccountInlineDialog,
	type CreatedAccount,
} from "@/features/accounts/components/create-account-inline-dialog";
import {
	CreateCardInlineDialog,
	type CreatedCard,
} from "@/features/cards/components/create-card-inline-dialog";
import {
	CreateCategoryInlineDialog,
	type CreatedCategory,
} from "@/features/categories/components/create-category-inline-dialog";
import type { Category } from "@/features/categories/components/types";
import {
	createTransactionAction,
	updateTransactionAction,
} from "@/features/transactions/actions";
import {
	confirmAttachmentUploadAction,
	detachTransactionAttachmentAction,
	getPresignedUploadUrlAction,
} from "@/features/transactions/actions/attachments";
import { groupAndSortCategories } from "@/features/transactions/lib/category-helpers";
import {
	applyFieldDependencies,
	buildTransactionInitialState,
	deriveCreditCardPeriod,
	getSelectedPayerIds,
	normalizeSplitStateForSubmit,
} from "@/features/transactions/lib/form-helpers";
import { useAppPreferences } from "@/shared/components/providers/app-preferences-provider";
import { Button } from "@/shared/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
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
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import type { CategoryType } from "@/shared/lib/categories/constants";
import { AttachmentFilePicker } from "../../attachments/attachment-file-picker";
import { AttachmentSection } from "../../attachments/attachment-section";
import type { SelectOption } from "../../types";
import { BasicFieldsSection } from "./basic-fields-section";
import { BoletoFieldsSection } from "./boleto-fields-section";
import { CategorySection } from "./category-section";
import { ConditionSection } from "./condition-section";
import { NoteSection } from "./note-section";
import { PayerSection } from "./payer-section";
import { PaymentMethodSection } from "./payment-method-section";
import type {
	FormState,
	TransactionDialogProps,
} from "./transaction-dialog-types";
import { TransactionSummaryCard } from "./transaction-summary-card";

function mergeSelectOptions(
	base: SelectOption[],
	extra: SelectOption[],
): SelectOption[] {
	const seen = new Set(base.map((option) => option.value));
	const merged = [...base];

	for (const option of extra) {
		if (seen.has(option.value)) {
			continue;
		}

		seen.add(option.value);
		merged.push(option);
	}

	return merged;
}

function transactionTypeToCategoryType(transactionType: string): CategoryType {
	return transactionType.toLowerCase() === "receita" ? "receita" : "despesa";
}

function mapSelectOptionsToCategories(options: SelectOption[]): Category[] {
	return options.map((option) => ({
		id: option.value,
		name: option.label,
		type: option.group === "receita" ? "receita" : "despesa",
		icon: option.icon ?? null,
		parentId: option.parentId ?? null,
	}));
}

export function TransactionDialog({
	mode,
	trigger,
	open,
	onOpenChange,
	payerOptions,
	splitPayerOptions,
	defaultPayerId,
	accountOptions,
	cardOptions,
	categoryOptions,
	estabelecimentos,
	transaction,
	defaultPeriod,
	defaultAccountId,
	defaultCardId,
	defaultPaymentMethod,
	defaultPurchaseDate,
	defaultName,
	defaultAmount,
	lockCardSelection,
	lockPaymentMethod,
	isImporting,
	defaultTransactionType,
	forceShowTransactionType,
	onSuccess,
	maxSizeMb,
	onBulkEditRequest,
	onSplitEditRequest,
}: TransactionDialogProps) {
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);

	const [formState, setFormState] = useState<FormState>(() =>
		buildTransactionInitialState(transaction, defaultPayerId, defaultPeriod, {
			defaultAccountId,
			defaultCardId,
			defaultPaymentMethod,
			defaultPurchaseDate,
			defaultName,
			defaultAmount,
			defaultTransactionType,
			isImporting,
		}),
	);
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [pendingDetachIds, setPendingDetachIds] = useState<string[]>([]);
	const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
	const [extrasOpen, setExtrasOpen] = useState(false);
	const [extraAccountOptions, setExtraAccountOptions] = useState<
		SelectOption[]
	>([]);
	const [extraCardOptions, setExtraCardOptions] = useState<SelectOption[]>([]);
	const [extraCategoryOptions, setExtraCategoryOptions] = useState<
		SelectOption[]
	>([]);
	const [accountCreateOpen, setAccountCreateOpen] = useState(false);
	const [cardCreateOpen, setCardCreateOpen] = useState(false);
	const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
	const [accountCreateTypeHint, setAccountCreateTypeHint] = useState<
		string | undefined
	>(undefined);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const { showTransactionSummary } = useAppPreferences();

	useEffect(() => {
		if (dialogOpen) {
			const initial = buildTransactionInitialState(
				transaction,
				defaultPayerId,
				defaultPeriod,
				{
					defaultAccountId,
					defaultCardId,
					defaultPaymentMethod,
					defaultPurchaseDate,
					defaultName,
					defaultAmount,
					defaultTransactionType,
					isImporting,
				},
			);

			// Derive credit card period on open when cardId is pre-filled (create only)
			if (
				mode !== "update" &&
				initial.paymentMethod === "Cartão de crédito" &&
				initial.cardId &&
				initial.purchaseDate
			) {
				const card = cardOptions.find((opt) => opt.value === initial.cardId);
				if (card?.closingDay) {
					initial.period = deriveCreditCardPeriod(
						initial.purchaseDate,
						card.closingDay,
						card.dueDay,
					);
				}
			}

			setFormState(initial);
			setErrorMessage(null);
			setPendingFiles([]);
			setPendingDetachIds([]);
			setPendingUploadFiles([]);
			setExtrasOpen(initial.condition !== "À vista");
			setExtraAccountOptions([]);
			setExtraCardOptions([]);
			setExtraCategoryOptions([]);
		}
	}, [
		dialogOpen,
		transaction,
		defaultPayerId,
		defaultPeriod,
		defaultAccountId,
		defaultCardId,
		defaultPaymentMethod,
		defaultPurchaseDate,
		defaultName,
		defaultAmount,
		defaultTransactionType,
		isImporting,
		cardOptions,
		mode,
	]);

	useEffect(() => {
		setExtraAccountOptions((prev) =>
			prev.filter(
				(option) =>
					!accountOptions.some(
						(baseOption) => baseOption.value === option.value,
					),
			),
		);
	}, [accountOptions]);

	useEffect(() => {
		setExtraCardOptions((prev) =>
			prev.filter(
				(option) =>
					!cardOptions.some((baseOption) => baseOption.value === option.value),
			),
		);
	}, [cardOptions]);

	useEffect(() => {
		setExtraCategoryOptions((prev) =>
			prev.filter(
				(option) =>
					!categoryOptions.some(
						(baseOption) => baseOption.value === option.value,
					),
			),
		);
	}, [categoryOptions]);

	const mergedCategoryOptions = useMemo(
		() => mergeSelectOptions(categoryOptions, extraCategoryOptions),
		[categoryOptions, extraCategoryOptions],
	);

	const allCategoriesForDialog = useMemo(
		() => mapSelectOptionsToCategories(mergedCategoryOptions),
		[mergedCategoryOptions],
	);

	const categoryGroups = useMemo(() => {
		const filtered = mergedCategoryOptions.filter(
			(option) =>
				option.group?.toLowerCase() === formState.transactionType.toLowerCase(),
		);
		return groupAndSortCategories(filtered);
	}, [mergedCategoryOptions, formState.transactionType]);

	type CreateTransactionInput = Parameters<typeof createTransactionAction>[0];
	type UpdateTransactionInput = Parameters<typeof updateTransactionAction>[0];

	const totalAmount = useMemo(() => {
		const parsed = Number.parseFloat(formState.amount);
		return Number.isNaN(parsed) ? 0 : Math.abs(parsed);
	}, [formState.amount]);

	const mergedAccountOptions = useMemo(
		() => mergeSelectOptions(accountOptions, extraAccountOptions),
		[accountOptions, extraAccountOptions],
	);

	const mergedCardOptions = useMemo(
		() => mergeSelectOptions(cardOptions, extraCardOptions),
		[cardOptions, extraCardOptions],
	);

	function getCardInfo(cardId: string | undefined) {
		if (!cardId) return null;
		const card = mergedCardOptions.find((opt) => opt.value === cardId);
		if (!card) return null;
		return {
			closingDay: card.closingDay ?? null,
			dueDay: card.dueDay ?? null,
		};
	}

	function handleFieldChange<Key extends keyof FormState>(
		key: Key,
		value: FormState[Key],
	) {
		setFormState((prev) => {
			const effectiveCardId =
				key === "cardId" ? (value as string) : prev.cardId;
			const cardInfo = getCardInfo(effectiveCardId);

			const dependencies = applyFieldDependencies(key, value, prev, cardInfo);

			return {
				...prev,
				[key]: value,
				...dependencies,
			};
		});
	}

	function handleAccountCreated(account: CreatedAccount) {
		setExtraAccountOptions((prev) =>
			prev.some((option) => option.value === account.id)
				? prev
				: [
						...prev,
						{
							value: account.id,
							label: account.name,
							logo: account.logo,
							accountType: account.accountType,
						},
					],
		);

		handleFieldChange("accountId", account.id);
		setAccountCreateOpen(false);
	}

	function handleCardCreated(card: CreatedCard) {
		setExtraCardOptions((prev) =>
			prev.some((option) => option.value === card.id)
				? prev
				: [
						...prev,
						{
							value: card.id,
							label: card.name,
							logo: card.logo,
							closingDay: card.closingDay,
							dueDay: card.dueDay,
						},
					],
		);

		handleFieldChange("cardId", card.id);
		setCardCreateOpen(false);
	}

	function handleCategoryCreated(category: CreatedCategory) {
		const parentOption = mergedCategoryOptions.find(
			(option) => option.value === category.parentId,
		);
		const categoryPath = parentOption
			? `${parentOption.categoryPath ?? parentOption.label} › ${category.name}`
			: category.name;
		const categoryDepth = (parentOption?.categoryDepth ?? -1) + 1;

		setExtraCategoryOptions((prev) =>
			prev.some((option) => option.value === category.id)
				? prev
				: [
						...prev,
						{
							value: category.id,
							label: category.name,
							group: category.type,
							icon: category.icon,
							parentId: category.parentId,
							categoryPath,
							categoryDepth,
						},
					],
		);

		handleFieldChange("categoryId", category.id);
		setCategoryCreateOpen(false);
	}

	function handleExtrasOpenChange(nextOpen: boolean) {
		setExtrasOpen(nextOpen);

		if (nextOpen) {
			requestAnimationFrame(() => {
				const scrollContainer = scrollContainerRef.current;
				if (!scrollContainer) return;

				scrollContainer.scrollTo({
					top: scrollContainer.scrollHeight,
					behavior: "smooth",
				});
			});
		}
	}

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		if (!formState.purchaseDate) {
			const message = "Informe a data da transação.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (!formState.name.trim()) {
			const message = "Informe a descrição do lançamento.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (formState.isSplit && getSelectedPayerIds(formState).length < 2) {
			const message =
				"Adicione pelo menos duas pessoas para dividir o lançamento.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		const amountValue = Number(formState.amount);
		if (Number.isNaN(amountValue)) {
			const message = "Informe um valor válido.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		const sanitizedAmount = Math.abs(amountValue);
		const submitState = normalizeSplitStateForSubmit(
			formState,
			sanitizedAmount,
		);
		const normalizedSplitShares = submitState.isSplit
			? [
					{
						payerId: submitState.payerId ?? "",
						amount: Number.parseFloat(submitState.primarySplitAmount) || 0,
					},
					...submitState.splitShares.map((share) => ({
						payerId: share.payerId,
						amount: Number.parseFloat(share.amount) || 0,
					})),
				]
			: undefined;

		if (!formState.categoryId) {
			const message = "Selecione uma categoria.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (formState.paymentMethod === "Cartão de crédito") {
			if (!formState.cardId) {
				const message = "Selecione o cartão.";
				setErrorMessage(message);
				toast.error(message);
				return;
			}
		} else if (!formState.accountId) {
			const message = "Selecione a conta.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		const payload: CreateTransactionInput = {
			purchaseDate: formState.purchaseDate,
			period: formState.period,
			name: formState.name.trim(),
			transactionType:
				formState.transactionType as CreateTransactionInput["transactionType"],
			amount: sanitizedAmount,
			condition: formState.condition as CreateTransactionInput["condition"],
			paymentMethod:
				formState.paymentMethod as CreateTransactionInput["paymentMethod"],
			payerId: submitState.payerId ?? null,
			splitShares: normalizedSplitShares,
			isSplit: submitState.isSplit,
			primarySplitAmount: submitState.isSplit
				? Number.parseFloat(submitState.primarySplitAmount) || undefined
				: undefined,
			secondarySplitAmount: submitState.isSplit
				? Number.parseFloat(submitState.secondarySplitAmount) || undefined
				: undefined,
			accountId: formState.accountId ?? null,
			cardId: formState.cardId ?? null,
			categoryId: formState.categoryId ?? null,
			note: formState.note.trim() || null,
			isSettled:
				formState.paymentMethod === "Cartão de crédito"
					? null
					: Boolean(formState.isSettled),
			installmentCount:
				formState.condition === "Parcelado" && formState.installmentCount
					? Number(formState.installmentCount)
					: undefined,
			startInstallment:
				mode === "create" &&
				formState.condition === "Parcelado" &&
				formState.startInstallment
					? Number(formState.startInstallment)
					: undefined,
			recurrenceCount:
				formState.condition === "Recorrente" && formState.recurrenceCount
					? Number(formState.recurrenceCount)
					: undefined,
			dueDate:
				formState.paymentMethod === "Boleto" && formState.dueDate
					? formState.dueDate
					: undefined,
			boletoPaymentDate:
				mode === "update" &&
				formState.paymentMethod === "Boleto" &&
				formState.boletoPaymentDate
					? formState.boletoPaymentDate
					: undefined,
			importFromTransactionId:
				mode === "create" && isImporting && transaction?.id
					? transaction.id
					: undefined,
		};

		startTransition(async () => {
			if (mode === "create") {
				const result = await createTransactionAction(payload);

				if (result.success) {
					if (pendingFiles.length > 0 && result.data?.ids?.length) {
						const firstId = result.data.ids[0];
						const isNewSeries =
							formState.condition === "Parcelado" ||
							formState.condition === "Recorrente";
						for (const file of pendingFiles) {
							const presign = await getPresignedUploadUrlAction({
								fileName: file.name,
								mimeType: file.type,
								fileSize: file.size,
								transactionId: firstId,
							});
							if (presign.success) {
								await fetch(presign.presignedUrl, {
									method: "PUT",
									body: file,
									headers: { "Content-Type": file.type },
								});
								await confirmAttachmentUploadAction({
									uploadToken: presign.uploadToken,
									scope: isNewSeries ? "all" : "current",
								});
							}
						}
					}
					toast.success(result.message);
					onSuccess?.();
					setDialogOpen(false);
					return;
				}

				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			const hasSeriesId = Boolean(transaction?.seriesId);
			const hasSplitPair = Boolean(
				transaction?.isDivided &&
					transaction?.splitGroupId &&
					!transaction?.seriesId,
			);

			if (hasSeriesId && onBulkEditRequest) {
				// Para lançamentos em série, passa os arquivos para a página confirmar
				// o upload após o escopo ser escolhido (sem upload antecipado ao S3)
				onBulkEditRequest({
					id: transaction?.id ?? "",
					purchaseDate: formState.purchaseDate,
					period: formState.period,
					name: formState.name.trim(),
					categoryId: formState.categoryId,
					note: formState.note.trim() || "",
					payerId: formState.payerId,
					accountId: formState.accountId,
					cardId: formState.cardId,
					amount: sanitizedAmount,
					dueDate:
						formState.paymentMethod === "Boleto"
							? formState.dueDate || null
							: null,
					boletoPaymentDate:
						mode === "update" && formState.paymentMethod === "Boleto"
							? formState.boletoPaymentDate || null
							: null,
					isSettled:
						formState.paymentMethod === "Cartão de crédito"
							? null
							: Boolean(formState.isSettled),
					pendingDetachIds,
					pendingUploadFiles,
				});
				return;
			}

			if (hasSplitPair && onSplitEditRequest) {
				onSplitEditRequest({
					id: transaction?.id ?? "",
					purchaseDate: formState.purchaseDate,
					period: formState.period,
					name: formState.name.trim(),
					transactionType: formState.transactionType,
					amount: sanitizedAmount,
					condition: formState.condition,
					paymentMethod: formState.paymentMethod,
					categoryId: formState.categoryId,
					note: formState.note.trim() || "",
					payerId: formState.payerId,
					accountId: formState.accountId,
					cardId: formState.cardId,
					isSettled:
						formState.paymentMethod === "Cartão de crédito"
							? null
							: Boolean(formState.isSettled),
					dueDate:
						formState.paymentMethod === "Boleto"
							? formState.dueDate || null
							: null,
					boletoPaymentDate:
						mode === "update" && formState.paymentMethod === "Boleto"
							? formState.boletoPaymentDate || null
							: null,
					pendingDetachIds,
					pendingUploadFiles,
				});
				return;
			}

			// Atualização normal para lançamentos únicos
			const updatePayload: UpdateTransactionInput = {
				id: transaction?.id ?? "",
				...payload,
			};

			const result = await updateTransactionAction(updatePayload);

			if (result.success) {
				for (const attachmentId of pendingDetachIds) {
					await detachTransactionAttachmentAction({
						attachmentId,
						transactionId: transaction?.id ?? "",
					});
				}
				for (const file of pendingUploadFiles) {
					const presign = await getPresignedUploadUrlAction({
						fileName: file.name,
						mimeType: file.type,
						fileSize: file.size,
						transactionId: transaction?.id ?? "",
					});
					if (presign.success) {
						await fetch(presign.presignedUrl, {
							method: "PUT",
							body: file,
							headers: { "Content-Type": file.type },
						});
						await confirmAttachmentUploadAction({
							uploadToken: presign.uploadToken,
							scope: "current",
						});
					}
				}
				toast.success(result.message);
				onSuccess?.();
				setDialogOpen(false);
				return;
			}

			setErrorMessage(result.error);
			toast.error(result.error);
		});
	};

	const isCopyMode = mode === "create" && Boolean(transaction) && !isImporting;
	const isImportMode = mode === "create" && Boolean(transaction) && isImporting;
	const isNewWithType =
		mode === "create" && !transaction && defaultTransactionType;

	const title =
		mode === "create"
			? isImportMode
				? "Importar para Minha Conta"
				: isCopyMode
					? "Copiar lançamento"
					: isNewWithType
						? defaultTransactionType === "Despesa"
							? "Nova Despesa"
							: "Nova Receita"
						: "Novo lançamento"
			: "Atualizar lançamento";
	const description =
		mode === "create"
			? isImportMode
				? "Importando lançamento de outro usuário. Ajuste a categoria, pessoa e cartão/conta antes de salvar."
				: isCopyMode
					? "Os dados do lançamento foram copiados. Revise e ajuste conforme necessário antes de salvar."
					: isNewWithType
						? `Informe os dados abaixo para registrar ${defaultTransactionType === "Despesa" ? "uma nova despesa" : "uma nova receita"}.`
						: "Informe os dados abaixo para registrar um novo lançamento."
			: "Atualize as informações do lançamento selecionado.";
	const submitLabel = mode === "create" ? "Salvar" : "Atualizar";

	const showInstallments = formState.condition === "Parcelado";
	const showRecurrence = formState.condition === "Recorrente";
	const showDueDate = formState.paymentMethod === "Boleto";
	const showPaymentDate = mode === "update" && showDueDate;
	const showSettledToggle = formState.paymentMethod !== "Cartão de crédito";
	const isUpdateMode = mode === "update";
	const disablePaymentMethod = Boolean(lockPaymentMethod && mode === "create");
	const disableCardSelect = Boolean(lockCardSelection && mode === "create");

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="flex max-h-[90vh] min-w-0 flex-col overflow-hidden p-4 sm:p-10">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
					onSubmit={handleSubmit}
					noValidate
				>
					<div
						ref={scrollContainerRef}
						className="-mx-1 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-1"
					>
						{/* Detalhes */}
						<div className="space-y-3">
							<BasicFieldsSection
								formState={formState}
								onFieldChange={handleFieldChange}
								estabelecimentos={estabelecimentos}
							/>

							<CategorySection
								formState={formState}
								onFieldChange={handleFieldChange}
								categoryOptions={mergedCategoryOptions}
								categoryGroups={categoryGroups}
								isUpdateMode={isUpdateMode}
								hideTransactionType={
									Boolean(isNewWithType) && !forceShowTransactionType
								}
								onCreateCategory={() => setCategoryCreateOpen(true)}
							/>
						</div>

						<div className="border-t border-border/40 my-3" />

						{/* Pessoa */}
						<PayerSection
							formState={formState}
							onFieldChange={handleFieldChange}
							payerOptions={payerOptions}
							splitPayerOptions={splitPayerOptions}
							totalAmount={totalAmount}
						/>

						<div className="border-t border-border/40 my-3" />

						{/* Pagamento */}
						<div className="space-y-3">
							<PaymentMethodSection
								formState={formState}
								onFieldChange={handleFieldChange}
								accountOptions={mergedAccountOptions}
								cardOptions={mergedCardOptions}
								isUpdateMode={isUpdateMode}
								disablePaymentMethod={disablePaymentMethod}
								disableCardSelect={disableCardSelect}
								showSettledToggle={showSettledToggle}
								onCreateAccount={(hint) => {
									setAccountCreateTypeHint(hint);
									setAccountCreateOpen(true);
								}}
								onCreateCard={() => setCardCreateOpen(true)}
							/>

							{showDueDate ? (
								<BoletoFieldsSection
									formState={formState}
									onFieldChange={handleFieldChange}
									showPaymentDate={showPaymentDate}
								/>
							) : null}
						</div>

						{/* Extras */}
						{isUpdateMode ? (
							<>
								<div className="border-t border-border/40 my-3" />
								<div className="space-y-3">
									<NoteSection
										formState={formState}
										onFieldChange={handleFieldChange}
									/>
									<div className="space-y-2">
										<Label className="text-xs font-medium leading-none">
											Anexos
										</Label>
										<AttachmentSection
											transactionId={transaction?.id ?? ""}
											maxSizeMb={maxSizeMb}
											pendingDetachIds={pendingDetachIds}
											onPendingDetach={(id) =>
												setPendingDetachIds((prev) => [...prev, id])
											}
											onUndoPendingDetach={(id) =>
												setPendingDetachIds((prev) =>
													prev.filter((x) => x !== id),
												)
											}
											pendingUploadFiles={pendingUploadFiles}
											onPendingUpload={(file) =>
												setPendingUploadFiles((prev) => [...prev, file])
											}
											onCancelPendingUpload={(file) =>
												setPendingUploadFiles((prev) =>
													prev.filter((f) => f !== file),
												)
											}
										/>
									</div>
								</div>
							</>
						) : (
							<Collapsible
								open={extrasOpen}
								onOpenChange={handleExtrasOpenChange}
								className="min-w-0"
							>
								<CollapsibleTrigger className="flex w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer [&[data-state=open]>svg]:rotate-180 mt-4">
									<RiArrowDropDownLine
										className="text-primary size-4 transition-transform duration-200"
										aria-hidden
									/>
									Condições, anotações e anexos
								</CollapsibleTrigger>
								<CollapsibleContent className="min-w-0 overflow-hidden space-y-3 pt-3">
									<ConditionSection
										formState={formState}
										onFieldChange={handleFieldChange}
										showInstallments={showInstallments}
										showRecurrence={showRecurrence}
									/>
									<NoteSection
										formState={formState}
										onFieldChange={handleFieldChange}
									/>
									{isImportMode && transaction?.id && (
										<div className="space-y-2">
											<Label className="text-xs font-medium leading-none">
												Anexos que serão copiados
											</Label>
											<AttachmentSection
												transactionId={transaction.id}
												readonly
											/>
										</div>
									)}
									<AttachmentFilePicker
										files={pendingFiles}
										onAdd={(file) => setPendingFiles((prev) => [...prev, file])}
										onRemove={(file) =>
											setPendingFiles((prev) => prev.filter((f) => f !== file))
										}
										maxSizeMb={maxSizeMb}
									/>
								</CollapsibleContent>
							</Collapsible>
						)}

						{showTransactionSummary ? (
							<div className="mt-3">
								<TransactionSummaryCard
									formState={formState}
									payerOptions={payerOptions}
									accountOptions={mergedAccountOptions}
									cardOptions={mergedCardOptions}
									categoryOptions={categoryOptions}
								/>
							</div>
						) : null}
					</div>

					{errorMessage ? (
						<p className="mt-3 text-sm text-destructive">{errorMessage}</p>
					) : null}

					<DialogFooter className="mt-4 shrink-0">
						<Button
							type="button"
							variant="outline"
							onClick={() => setDialogOpen(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : submitLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>

			<CreateAccountInlineDialog
				open={accountCreateOpen}
				onOpenChange={setAccountCreateOpen}
				onCreated={handleAccountCreated}
				defaultAccountType={accountCreateTypeHint}
			/>
			<CreateCardInlineDialog
				open={cardCreateOpen}
				onOpenChange={setCardCreateOpen}
				onCreated={handleCardCreated}
			/>
			<CreateCategoryInlineDialog
				open={categoryCreateOpen}
				onOpenChange={setCategoryCreateOpen}
				onCreated={handleCategoryCreated}
				allCategories={allCategoriesForDialog}
				defaultType={transactionTypeToCategoryType(formState.transactionType)}
			/>
		</Dialog>
	);
}
