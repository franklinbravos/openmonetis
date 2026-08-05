"use client";

import { useEffect, useState } from "react";
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
import { CARD_IMPORT_PDF_PASSWORD_RULES } from "@/shared/lib/cards/import-pdf-password";

type SavePasswordRule =
	| typeof CARD_IMPORT_PDF_PASSWORD_RULES.fixed
	| typeof CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6
	| typeof CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6;

type ImportPdfPasswordDialogProps = {
	open: boolean;
	fileName?: string | null;
	error?: string | null;
	isPending?: boolean;
	linkedCardId?: string | null;
	onOpenChange: (open: boolean) => void;
	onSubmit: (
		password: string,
		options?: { saveToCard?: boolean; saveRule?: SavePasswordRule },
	) => void;
};

export function ImportPdfPasswordDialog({
	open,
	fileName = null,
	error = null,
	isPending = false,
	linkedCardId = null,
	onOpenChange,
	onSubmit,
}: ImportPdfPasswordDialogProps) {
	const [password, setPassword] = useState("");
	const [saveToCard, setSaveToCard] = useState(Boolean(linkedCardId));
	const [saveRule, setSaveRule] = useState<SavePasswordRule>(
		CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6,
	);

	useEffect(() => {
		if (!open) {
			setPassword("");
			setSaveToCard(Boolean(linkedCardId));
			setSaveRule(CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6);
		}
	}, [open, linkedCardId]);

	const handleSubmit = () => {
		const normalizedPassword = password.trim();
		if (!normalizedPassword || isPending) return;
		onSubmit(normalizedPassword, {
			saveToCard: linkedCardId ? saveToCard : false,
			saveRule,
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>PDF protegido por senha</DialogTitle>
					<DialogDescription>
						{fileName
							? `Digite a senha para abrir "${fileName}".`
							: "Digite a senha para abrir o PDF selecionado."}
						<span className="mt-2 block text-xs">
							No Inter Microbusiness, use os 6 primeiros números do CNPJ (ex.:
							12.345.678/0001-99 → 123456). Em cartão PF, a senha costuma ser os
							6 primeiros dígitos do CPF.
						</span>
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="import-pdf-password">Senha, CPF ou CNPJ</Label>
						<Input
							id="import-pdf-password"
							type="password"
							autoComplete="off"
							value={password}
							disabled={isPending}
							aria-invalid={Boolean(error)}
							onChange={(event) => setPassword(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									handleSubmit();
								}
							}}
						/>
						{error ? (
							<p className="text-destructive text-sm">{error}</p>
						) : null}
					</div>

					{linkedCardId ? (
						<div className="space-y-3 rounded-lg border border-dashed p-3">
							<div className="flex items-start gap-2">
								<Checkbox
									id="import-pdf-save-to-card"
									checked={saveToCard}
									disabled={isPending}
									onCheckedChange={(checked) =>
										setSaveToCard(checked === true)
									}
								/>
								<div className="space-y-1">
									<Label
										htmlFor="import-pdf-save-to-card"
										className="font-normal"
									>
										Salvar neste cartão para próximas importações
									</Label>
									<p className="text-muted-foreground text-xs">
										O valor fica criptografado e vinculado ao cartão.
									</p>
								</div>
							</div>

							{saveToCard ? (
								<div className="space-y-2">
									<Label htmlFor="import-pdf-save-rule">Regra salva</Label>
									<Select
										value={saveRule}
										onValueChange={(value) =>
											setSaveRule(value as SavePasswordRule)
										}
										disabled={isPending}
									>
										<SelectTrigger id="import-pdf-save-rule" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem
												value={CARD_IMPORT_PDF_PASSWORD_RULES.cnpj_first_6}
											>
												6 primeiros dígitos do CNPJ
											</SelectItem>
											<SelectItem
												value={CARD_IMPORT_PDF_PASSWORD_RULES.cpf_first_6}
											>
												6 primeiros dígitos do CPF
											</SelectItem>
											<SelectItem value={CARD_IMPORT_PDF_PASSWORD_RULES.fixed}>
												Senha fixa
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							) : null}
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						disabled={isPending || !password.trim()}
						onClick={handleSubmit}
					>
						{isPending ? "Abrindo..." : "Abrir PDF"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
