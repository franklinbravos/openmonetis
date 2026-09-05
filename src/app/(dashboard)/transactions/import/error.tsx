"use client";

import { RiErrorWarningFill, RiRefreshLine } from "@remixicon/react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";

export default function ImportError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	const isChunkLoadError =
		error.name === "ChunkLoadError" ||
		error.message.includes("Failed to load chunk");

	useEffect(() => {
		if (!isChunkLoadError) return;

		const reloadKey = "openmonetis:chunk-reload";
		if (sessionStorage.getItem(reloadKey) === "1") return;

		sessionStorage.setItem(reloadKey, "1");
		const url = new URL(window.location.href);
		url.searchParams.set("_chunk", String(Date.now()));
		window.location.replace(url.toString());
	}, [isChunkLoadError]);

	const handleReload = () => {
		const url = new URL(window.location.href);
		url.searchParams.set("_chunk", String(Date.now()));
		window.location.replace(url.toString());
	};

	return (
		<div className="flex flex-col gap-6">
			<Empty className="max-w-lg border border-dashed">
				<EmptyHeader>
					<EmptyMedia variant="icon" className="bg-destructive/10 size-16">
						<RiErrorWarningFill className="size-8 text-destructive" />
					</EmptyMedia>
					<EmptyTitle>
						{isChunkLoadError
							? "Não foi possível carregar a revisão"
							: "Erro na importação"}
					</EmptyTitle>
					<EmptyDescription>
						{isChunkLoadError ? (
							<>
								Isso costuma acontecer após reiniciar o servidor de
								desenvolvimento ou atualizar o app. Recarregue a página com{" "}
								<strong>Cmd+Shift+R</strong> (Mac) ou <strong>Ctrl+Shift+R</strong>{" "}
								(Windows/Linux).
							</>
						) : (
							"Ocorreu um problema ao abrir a revisão da importação. Tente novamente."
						)}
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Button type="button" onClick={handleReload}>
							<RiRefreshLine className="size-4" aria-hidden />
							Recarregar página
						</Button>
						<Button type="button" variant="outline" onClick={() => reset()}>
							Tentar de novo
						</Button>
						<Button type="button" variant="outline" asChild>
							<Link href="/transactions/import">Voltar ao upload</Link>
						</Button>
					</div>
				</EmptyContent>
			</Empty>
		</div>
	);
}
