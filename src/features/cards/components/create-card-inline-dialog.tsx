"use client";

import { useEffect, useState } from "react";
import { fetchCardFormOptionsAction } from "@/features/cards/actions";
import { CardDialog, type CreatedCard } from "./card-dialog";

export type { CreatedCard } from "./card-dialog";

interface CreateCardInlineDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (card: CreatedCard) => void;
}

/**
 * Wrapper do CardDialog para criação inline de cartões (ex.: dentro do
 * diálogo de lançamentos). Carrega logos e contas sob demanda ao abrir.
 */
export function CreateCardInlineDialog({
	open,
	onOpenChange,
	onCreated,
}: CreateCardInlineDialogProps) {
	const [logoOptions, setLogoOptions] = useState<string[]>([]);
	const [accounts, setAccounts] = useState<
		Array<{ id: string; name: string; logo: string | null }>
	>([]);

	useEffect(() => {
		if (!open) {
			return;
		}

		let cancelled = false;

		fetchCardFormOptionsAction()
			.then((result) => {
				if (!cancelled) {
					setLogoOptions(result.logoOptions);
					setAccounts(result.accounts);
				}
			})
			.catch(() => {
				// Mantém o diálogo utilizável mesmo se as opções não carregarem.
			});

		return () => {
			cancelled = true;
		};
	}, [open]);

	return (
		<CardDialog
			mode="create"
			open={open}
			onOpenChange={onOpenChange}
			logoOptions={logoOptions}
			accounts={accounts}
			onCreated={onCreated}
		/>
	);
}
