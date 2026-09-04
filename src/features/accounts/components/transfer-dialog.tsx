"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AccountData } from "@/features/accounts/queries";
import type { ActionResult } from "@/shared/lib/types/actions";
import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
import { PeriodPicker } from "@/shared/components/period-picker";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
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
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import { getTodayDateString } from "@/shared/utils/date";

interface TransferDialogProps {
	trigger?: React.ReactNode;
	accounts: AccountData[];
	fromAccountId?: string;
	currentPeriod: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export function TransferDialog({
	trigger,
	accounts,
	fromAccountId,
	currentPeriod,
	open,
	onOpenChange,
}: TransferDialogProps) {
	const router = useRouter();
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const isFromAccountFixed = Boolean(fromAccountId);
	const [selectedFromAccountId, setSelectedFromAccountId] = useState(
		fromAccountId ?? accounts[0]?.id ?? "",
	);

	// Form state
	const [toAccountId, setToAccountId] = useState("");
	const [amount, setAmount] = useState("");
	const [date, setDate] = useState(getTodayDateString());
	const [period, setPeriod] = useState(currentPeriod);

	useEffect(() => {
		if (!dialogOpen) {
			return;
		}

		setErrorMessage(null);
		setToAccountId("");
		setAmount("");
		setDate(getTodayDateString());
		setPeriod(currentPeriod);

		if (fromAccountId) {
			setSelectedFromAccountId(fromAccountId);
			return;
		}

		setSelectedFromAccountId((current) => {
			if (current && accounts.some((account) => account.id === current)) {
				return current;
			}

			return accounts[0]?.id ?? "";
		});
	}, [accounts, currentPeriod, dialogOpen, fromAccountId]);

	// Available destination accounts (exclude source account)
	const availableAccounts = accounts.filter(
		(account) => account.id !== selectedFromAccountId,
	);

	// Source account info
	const fromAccount = accounts.find(
		(account) => account.id === selectedFromAccountId,
	);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		if (!toAccountId) {
			setErrorMessage("Selecione a conta de destino.");
			return;
		}

		if (toAccountId === selectedFromAccountId) {
			setErrorMessage("Selecione uma conta de destino diferente da origem.");
			return;
		}

		if (!amount || parseFloat(amount.replace(",", ".")) <= 0) {
			setErrorMessage("Informe um valor válido maior que zero.");
			return;
		}

		setIsSubmitting(true);
		try {
			const response = await fetch(
				`${window.location.origin}/api/accounts/transfer`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						fromAccountId: selectedFromAccountId,
						toAccountId,
						amount,
						date,
						period,
					}),
				},
			);

			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				throw new Error("Não foi possível registrar a transferência.");
			}

			const result = (await response.json()) as ActionResult;

			if (!response.ok && !result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			if (result.success) {
				toast.success(result.message);
				setDialogOpen(false);
				router.refresh();
				setToAccountId("");
				setAmount("");
				setDate(getTodayDateString());
				setPeriod(currentPeriod);
				return;
			}

			setErrorMessage(result.error);
			toast.error(result.error);
		} catch {
			const message =
				"Não foi possível registrar a transferência. Tente novamente.";
			setErrorMessage(message);
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Transferir entre contas</DialogTitle>
					<DialogDescription>
						Registre uma transferência de valores entre suas contas.
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-5" onSubmit={handleSubmit}>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="transfer-date">Data da transferência</Label>
							<DatePicker
								id="transfer-date"
								value={date}
								onChange={setDate}
								required
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="transfer-period">Período</Label>
							<PeriodPicker
								value={period}
								onChange={setPeriod}
								className="w-full"
							/>
						</div>

						<div className="flex flex-col gap-2 sm:col-span-2">
							<Label htmlFor="transfer-amount">Valor</Label>
							<CurrencyInput
								id="transfer-amount"
								value={amount}
								onValueChange={setAmount}
								placeholder="R$ 0,00"
								required
							/>
						</div>

						<div className="flex flex-col gap-2 sm:col-span-2">
							<Label htmlFor="from-account">Conta de origem</Label>
							{isFromAccountFixed ? (
								<Select value={selectedFromAccountId} disabled>
									<SelectTrigger id="from-account" className="w-full">
										<SelectValue>
											{fromAccount && (
												<AccountCardSelectContent
													label={fromAccount.name}
													logo={fromAccount.logo}
													isCartao={false}
												/>
											)}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{fromAccount && (
											<SelectItem value={fromAccount.id}>
												<AccountCardSelectContent
													label={fromAccount.name}
													logo={fromAccount.logo}
													isCartao={false}
												/>
											</SelectItem>
										)}
									</SelectContent>
								</Select>
							) : accounts.length === 0 ? (
								<div className="rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
									Cadastre ao menos uma conta para realizar transferências.
								</div>
							) : (
								<Select
									value={selectedFromAccountId}
									onValueChange={(value) => {
										setSelectedFromAccountId(value);
										if (value === toAccountId) {
											setToAccountId("");
										}
									}}
								>
									<SelectTrigger id="from-account" className="w-full">
										<SelectValue placeholder="Selecione a conta de origem">
											{fromAccount ? (
												<AccountCardSelectContent
													label={fromAccount.name}
													logo={fromAccount.logo}
													isCartao={false}
												/>
											) : null}
										</SelectValue>
									</SelectTrigger>
									<SelectContent className="w-full">
										{accounts.map((account) => (
											<SelectItem key={account.id} value={account.id}>
												<AccountCardSelectContent
													label={account.name}
													logo={account.logo}
													isCartao={false}
												/>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						</div>

						<div className="flex flex-col gap-2 sm:col-span-2">
							<Label htmlFor="to-account">Conta de destino</Label>
							{availableAccounts.length === 0 ? (
								<div className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
									É necessário ter mais de uma conta cadastrada para realizar
									transferências.
								</div>
							) : (
								<Select value={toAccountId} onValueChange={setToAccountId}>
									<SelectTrigger id="to-account" className="w-full">
										<SelectValue placeholder="Selecione a conta de destino">
											{toAccountId &&
												(() => {
													const selectedAccount = availableAccounts.find(
														(acc) => acc.id === toAccountId,
													);
													return selectedAccount ? (
														<AccountCardSelectContent
															label={selectedAccount.name}
															logo={selectedAccount.logo}
															isCartao={false}
														/>
													) : null;
												})()}
										</SelectValue>
									</SelectTrigger>
									<SelectContent className="w-full">
										{availableAccounts.map((account) => (
											<SelectItem key={account.id} value={account.id}>
												<AccountCardSelectContent
													label={account.name}
													logo={account.logo}
													isCartao={false}
												/>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						</div>
					</div>

					{errorMessage && (
						<p className="text-sm text-destructive">{errorMessage}</p>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancelar
						</Button>
						<Button
							type="submit"
							disabled={
								isSubmitting ||
								accounts.length < 2 ||
								!selectedFromAccountId ||
								availableAccounts.length === 0
							}
						>
							{isSubmitting ? "Processando..." : "Confirmar transferência"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
