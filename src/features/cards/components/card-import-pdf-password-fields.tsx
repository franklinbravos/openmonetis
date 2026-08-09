"use client";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	CARD_IMPORT_PDF_PASSWORD_RULE_OPTIONS,
	CARD_IMPORT_PDF_PASSWORD_RULES,
	type CardImportPdfPasswordRule,
	getCardImportPdfPasswordSecretLabel,
	getCardImportPdfPasswordSecretPlaceholder,
} from "@/shared/lib/cards/import-pdf-password";

type CardImportPdfPasswordFieldsProps = {
	rule: CardImportPdfPasswordRule;
	secret: string;
	hasStoredSecret?: boolean;
	onRuleChange: (rule: CardImportPdfPasswordRule) => void;
	onSecretChange: (secret: string) => void;
};

export function CardImportPdfPasswordFields({
	rule,
	secret,
	hasStoredSecret = false,
	onRuleChange,
	onSecretChange,
}: CardImportPdfPasswordFieldsProps) {
	return (
		<div className="flex flex-col gap-4">
			<div className="space-y-1">
				<p className="font-medium text-sm">Importação de fatura (PDF)</p>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Configure a senha usada automaticamente ao importar PDFs protegidos
					deste cartão. Você também pode salvar a senha ao importar uma fatura
					pela primeira vez.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="card-import-pdf-rule">Regra da senha</Label>
				<Select
					value={rule}
					onValueChange={(value) =>
						onRuleChange(value as CardImportPdfPasswordRule)
					}
				>
					<SelectTrigger id="card-import-pdf-rule" className="w-full">
						<SelectValue placeholder="Selecione a regra" />
					</SelectTrigger>
					<SelectContent>
						{CARD_IMPORT_PDF_PASSWORD_RULE_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-muted-foreground text-xs">
					{
						CARD_IMPORT_PDF_PASSWORD_RULE_OPTIONS.find(
							(option) => option.value === rule,
						)?.description
					}
				</p>
			</div>

			{rule !== CARD_IMPORT_PDF_PASSWORD_RULES.none ? (
				<div className="flex flex-col gap-2">
					<Label htmlFor="card-import-pdf-secret">
						{getCardImportPdfPasswordSecretLabel(rule)}
					</Label>
					<Input
						id="card-import-pdf-secret"
						type={
							rule === CARD_IMPORT_PDF_PASSWORD_RULES.fixed
								? "password"
								: "text"
						}
						autoComplete="off"
						value={secret}
						onChange={(event) => onSecretChange(event.target.value)}
						placeholder={getCardImportPdfPasswordSecretPlaceholder(
							rule,
							hasStoredSecret,
						)}
					/>
				</div>
			) : null}
		</div>
	);
}
