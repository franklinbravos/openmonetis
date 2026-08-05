"use client";

import { RiSettings4Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateCardImportPdfPasswordSettingsAction } from "@/features/cards/actions/import-pdf-password-action";
import { CardImportPdfPasswordFields } from "@/features/cards/components/card-import-pdf-password-fields";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
	CARD_IMPORT_PDF_PASSWORD_RULES,
	type CardImportPdfPasswordRule,
	isCardImportPdfPasswordRule,
} from "@/shared/lib/cards/import-pdf-password";

type CardImportDefaultsDialogProps = {
	cardId: string;
	cardName: string;
	importPdfPasswordRule: CardImportPdfPasswordRule;
	hasStoredImportPdfPasswordSecret?: boolean;
};

export function CardImportDefaultsDialog({
	cardId,
	cardName,
	importPdfPasswordRule,
	hasStoredImportPdfPasswordSecret = false,
}: CardImportDefaultsDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [rule, setRule] = useState<CardImportPdfPasswordRule>(importPdfPasswordRule);
	const [secret, setSecret] = useState("");

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (nextOpen) {
			setRule(importPdfPasswordRule);
			setSecret("");
		}
	};

	const handleSave = () => {
		startTransition(async () => {
			const result = await updateCardImportPdfPasswordSettingsAction({
				cardId,
				rule,
				secret: secret.trim() ? secret : undefined,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message ?? "Configurações salvas.");
			setOpen(false);
			router.refresh();
		});
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="text-muted-foreground hover:text-foreground"
					aria-label={`Configurações de importação de ${cardName}`}
				>
					<RiSettings4Line className="size-5" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Dados padrão de importação</DialogTitle>
					<DialogDescription>
						Configure como o OpenMonetis deve abrir PDFs protegidos do cartão{" "}
						<span className="font-medium text-foreground">{cardName}</span>.
					</DialogDescription>
				</DialogHeader>

				<CardImportPdfPasswordFields
					rule={isCardImportPdfPasswordRule(rule) ? rule : CARD_IMPORT_PDF_PASSWORD_RULES.none}
					secret={secret}
					hasStoredSecret={hasStoredImportPdfPasswordSecret}
					onRuleChange={setRule}
					onSecretChange={setSecret}
				/>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={handleSave} disabled={isPending}>
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
