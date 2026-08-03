"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ReconciliationLine } from "@/db/schema";
import { createReconciliationSessionAction } from "@/features/reconciliation/actions/create-session";
import { fetchReconciliationSessionAction } from "@/features/reconciliation/actions/fetch-session";
import {
	type ReconciliationScopeValue,
	ScopeStep,
} from "@/features/reconciliation/components/scope-step";
import { SessionPreview } from "@/features/reconciliation/components/session-preview";
import { UploadZone } from "@/features/transactions/components/import/upload-zone";
import type { SelectOption } from "@/features/transactions/components/types";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import type { ImportStatement } from "@/shared/lib/import/types";

type ReconciliationPageProps = {
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	defaultPeriod: string;
};

type CreatedSession = {
	sessionId: string;
	sourceFileName: string;
	statementTotal: number;
	lines: ReconciliationLine[];
};

export function ReconciliationPage({
	accountOptions,
	cardOptions,
	defaultPeriod,
}: ReconciliationPageProps) {
	const [isPending, startTransition] = useTransition();
	const [scope, setScope] = useState<ReconciliationScopeValue>(() => ({
		targetType: cardOptions.length > 0 ? "card" : "account",
		targetId: cardOptions[0]?.value ?? accountOptions[0]?.value ?? "",
		period: defaultPeriod,
	}));
	const [parsedStatement, setParsedStatement] =
		useState<ImportStatement | null>(null);
	const [sourceMeta, setSourceMeta] = useState<{
		fileName: string;
		sourceType: "ofx" | "xls";
	} | null>(null);
	const [createdSession, setCreatedSession] = useState<CreatedSession | null>(
		null,
	);

	const canUpload = Boolean(scope.targetId && scope.period);

	const targetLabel = useMemo(() => {
		const options = scope.targetType === "card" ? cardOptions : accountOptions;
		return options.find((option) => option.value === scope.targetId)?.label;
	}, [accountOptions, cardOptions, scope.targetId, scope.targetType]);

	const handleParsed = (statement: ImportStatement, fileName: string) => {
		const sourceType = /\.(ofx|qfx)$/i.test(fileName) ? "ofx" : "xls";
		setParsedStatement(statement);
		setSourceMeta({ fileName, sourceType });
		setCreatedSession(null);
	};

	const handleCreateSession = () => {
		if (!parsedStatement || !sourceMeta || !canUpload) {
			return;
		}

		startTransition(async () => {
			const result = await createReconciliationSessionAction({
				targetType: scope.targetType,
				targetId: scope.targetId,
				period: scope.period,
				sourceFileName: sourceMeta.fileName,
				sourceType: sourceMeta.sourceType,
				statementSource: parsedStatement.source,
				statementAccountNumber: parsedStatement.accountNumber,
				statementPeriodFrom: parsedStatement.period?.from ?? null,
				statementPeriodTo: parsedStatement.period?.to ?? null,
				lines: parsedStatement.transactions.map((transaction) => ({
					externalId: transaction.externalId,
					date: transaction.date,
					amount: transaction.amount,
					description: transaction.description,
					transactionType: transaction.transactionType,
				})),
			});

			if (!result.success || !result.data) {
				toast.error(result.success ? "Resposta inválida." : result.error);
				return;
			}

			const sessionResult = await fetchReconciliationSessionAction(
				result.data.sessionId,
			);
			if (!sessionResult.success || !sessionResult.data) {
				toast.error(
					sessionResult.success
						? "Sessão não encontrada."
						: sessionResult.error,
				);
				return;
			}

			const session = sessionResult.data;

			setCreatedSession({
				sessionId: session.id,
				sourceFileName: session.sourceFileName,
				statementTotal: Number(session.statementTotal),
				lines: session.lines,
			});
			toast.success("Extrato carregado para conciliação.");
		});
	};

	const handleReset = () => {
		setParsedStatement(null);
		setSourceMeta(null);
		setCreatedSession(null);
	};

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">Conciliação</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Feche faturas de cartão e concilie extratos bancários comparando com
					os lançamentos já cadastrados.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>1. Escopo</CardTitle>
					<CardDescription>
						Escolha o cartão ou a conta e o período que deseja conciliar.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ScopeStep
						value={scope}
						onChange={setScope}
						accountOptions={accountOptions}
						cardOptions={cardOptions}
						defaultPeriod={defaultPeriod}
						disabled={isPending}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>2. Upload do extrato</CardTitle>
					<CardDescription>
						{targetLabel
							? `Carregue o arquivo de ${targetLabel} para o período ${scope.period}.`
							: "Selecione o escopo antes de enviar o arquivo."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{canUpload ? (
						<UploadZone
							onParsed={(statement, fileName) => {
								handleParsed(statement, fileName);
							}}
						/>
					) : (
						<p className="text-muted-foreground text-sm">
							Selecione um cartão ou conta para habilitar o upload.
						</p>
					)}

					{parsedStatement && sourceMeta && !createdSession ? (
						<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
							<div className="text-sm">
								<p className="font-medium">{sourceMeta.fileName}</p>
								<p className="text-muted-foreground">
									{parsedStatement.transactions.length} linhas prontas para
									conciliação
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={handleReset}
									disabled={isPending}
								>
									Trocar arquivo
								</Button>
								<Button
									type="button"
									onClick={handleCreateSession}
									disabled={isPending}
								>
									{isPending ? "Carregando..." : "Iniciar conciliação"}
								</Button>
							</div>
						</div>
					) : null}
				</CardContent>
			</Card>

			{createdSession ? (
				<Card>
					<CardHeader>
						<CardTitle>3. Extrato carregado</CardTitle>
						<CardDescription>
							Sessão criada com sucesso. A análise automática e as sugestões de
							ajuste chegam na próxima fase.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<SessionPreview
							lines={createdSession.lines}
							statementTotal={createdSession.statementTotal}
							sourceFileName={createdSession.sourceFileName}
						/>
						<div className="flex justify-end">
							<Button type="button" variant="outline" onClick={handleReset}>
								Nova conciliação
							</Button>
						</div>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
