"use client";

import { useEffect, useState } from "react";
import { fetchAccountFormOptionsAction } from "@/features/accounts/actions";
import { useReleaseBodyPointerEventsLock } from "@/shared/hooks/use-body-pointer-events-lock";
import type { CreatedAccount } from "./account-dialog";
import { AccountDialog } from "./account-dialog";

export type { CreatedAccount } from "./account-dialog";

interface CreateAccountInlineDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (account: CreatedAccount) => void;
	/** Tipo de conta pré-selecionado na criação (ex.: "Dinheiro"). */
	defaultAccountType?: string;
}

/**
 * Wrapper do AccountDialog para criação inline de contas (ex.: dentro do
 * diálogo de lançamentos, quando ainda não há contas cadastradas).
 * Carrega as opções de logo sob demanda ao abrir o diálogo.
 */
export function CreateAccountInlineDialog({
	open,
	onOpenChange,
	onCreated,
	defaultAccountType,
}: CreateAccountInlineDialogProps) {
	const [logoOptions, setLogoOptions] = useState<string[]>([]);

	// Também é aberto de dentro de um select, com o mesmo risco de travamento.
	useReleaseBodyPointerEventsLock(open);

	useEffect(() => {
		if (!open) {
			return;
		}

		let cancelled = false;

		fetchAccountFormOptionsAction()
			.then((result) => {
				if (!cancelled) {
					setLogoOptions(result.logoOptions);
				}
			})
			.catch(() => {
				// Mantém o diálogo utilizável mesmo se os logos não carregarem.
			});

		return () => {
			cancelled = true;
		};
	}, [open]);

	return (
		<AccountDialog
			mode="create"
			open={open}
			onOpenChange={onOpenChange}
			logoOptions={logoOptions}
			onCreated={onCreated}
			defaultAccountType={defaultAccountType}
		/>
	);
}
