"use client";

import {
	RiDownload2Line,
	RiExternalLinkLine,
	RiInboxLine,
	RiNotification3Line,
	RiQrCodeLine,
	RiShieldCheckLine,
} from "@remixicon/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApiTokensForm } from "./api-tokens-form";

interface ApiToken {
	id: string;
	name: string;
	tokenPrefix: string;
	lastUsedAt: Date | null;
	lastUsedIp: string | null;
	createdAt: Date;
	expiresAt: Date | null;
	revokedAt: Date | null;
}

interface CompanionTabProps {
	tokens: ApiToken[];
}

const companionReleasesUrl =
	"https://github.com/felipegcoutinho/openmonetis-companion/releases";

const steps: {
	icon: typeof RiDownload2Line;
	title: string;
	description: ReactNode;
}[] = [
	{
		icon: RiDownload2Line,
		title: "Instale o APK",
		description: (
			<>
				Baixe a última versão em{" "}
				<a
					href={companionReleasesUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-0.5 text-primary hover:underline"
				>
					Releases
					<RiExternalLinkLine className="h-3 w-3" />
				</a>
				. Requer Android 12+. Se o sistema pedir, habilite instalação de fontes
				desconhecidas.
			</>
		),
	},
	{
		icon: RiQrCodeLine,
		title: "Crie o token",
		description: (
			<>
				Clique em <strong className="font-medium">Novo Token</strong> abaixo, dê
				um nome ao celular e copie o código — ele{" "}
				<strong className="font-medium">só aparece uma vez</strong>.
			</>
		),
	},
	{
		icon: RiNotification3Line,
		title: "Configure o Companion",
		description: (
			<>
				No app: informe a <strong className="font-medium">URL pública</strong>{" "}
				do seu OpenMonetis (HTTPS acessível do celular, ex.: domínio no
				Coolify), cole o token, toque em{" "}
				<strong className="font-medium">Conectar</strong> e ative o acesso às
				notificações quando solicitado.
			</>
		),
	},
	{
		icon: RiShieldCheckLine,
		title: "Selecione os bancos",
		description: (
			<>
				Em <strong className="font-medium">Apps monitorados</strong>, marque os
				bancos que você usa. As notificações viram pré-lançamentos na{" "}
				<Link href="/inbox" className="text-primary hover:underline">
					Caixa de entrada
				</Link>{" "}
				para você revisar e aprovar.
			</>
		),
	},
];

export function CompanionTab({ tokens }: CompanionTabProps) {
	return (
		<div className="space-y-6">
			{/* Steps */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{steps.map((step, index) => (
					<div
						key={step.title}
						className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3"
					>
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
							<step.icon className="h-4 w-4" />
						</div>
						<div className="min-w-0 space-y-1">
							<p className="text-sm font-medium leading-tight">
								{index + 1}. {step.title}
							</p>
							<p className="text-xs leading-relaxed text-muted-foreground">
								{step.description}
							</p>
						</div>
					</div>
				))}
			</div>

			<p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
				<RiInboxLine className="mt-0.5 h-4 w-4 shrink-0" />
				<span>
					O celular precisa alcançar seu servidor pela internet.{" "}
					<code className="rounded bg-muted px-1 py-0.5">localhost</code> não
					funciona — use o domínio público onde o OpenMonetis está hospedado.
				</span>
			</p>

			{/* Devices */}
			<ApiTokensForm tokens={tokens} />
		</div>
	);
}
