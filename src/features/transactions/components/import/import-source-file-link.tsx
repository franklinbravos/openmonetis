"use client";

import { RiExternalLinkLine } from "@remixicon/react";
import { useEffect, useState } from "react";

/**
 * Abre o arquivo que está sendo conferido, em outra aba.
 *
 * O arquivo já está no navegador — é o mesmo que foi lido para montar a revisão,
 * tanto no upload quanto no reprocessamento —, então o link sai de um object URL
 * e não de uma volta ao servidor. Consultar o PDF ao lado dos números é o que
 * permite decidir uma divergência sem sair da tela.
 */
export function ImportSourceFileLink({ file }: { file: File }) {
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		const objectUrl = URL.createObjectURL(file);
		setUrl(objectUrl);
		// Revogar ao trocar de arquivo: object URL vive até o fim da aba.
		return () => {
			URL.revokeObjectURL(objectUrl);
			setUrl(null);
		};
	}, [file]);

	if (!url) return null;

	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 font-normal text-primary text-xs transition-colors hover:bg-accent"
			title={file.name}
		>
			<RiExternalLinkLine className="size-3 shrink-0" aria-hidden />
			Abrir arquivo
		</a>
	);
}
