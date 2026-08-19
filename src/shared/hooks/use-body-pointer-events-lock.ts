"use client";

import { useEffect, useRef } from "react";

/**
 * Enquanto um modal está aberto, o Radix trava os cliques do resto da página com
 * `pointer-events: none` no `body` e devolve na saída. Quando o diálogo é aberto
 * de dentro de um select e esse select desmonta junto com o fechamento — criar
 * categoria na revisão da importação, por exemplo, que reordena a lista e troca
 * as linhas —, a limpeza dele nunca roda: a tela inteira fica sem clique e não
 * há overlay visível para denunciar o motivo.
 */

const OPEN_MODAL_SELECTOR = [
	'[role="dialog"][data-state="open"]',
	'[role="alertdialog"][data-state="open"]',
	'[role="menu"][data-state="open"]',
	'[role="listbox"][data-state="open"]',
].join(", ");

function hasOpenModal(): boolean {
	return Boolean(document.querySelector(OPEN_MODAL_SELECTOR));
}

/** Devolve os cliques ao `body` se nenhum modal ainda estiver aberto. */
export function releaseBodyPointerEventsLock(): boolean {
	if (typeof document === "undefined") return false;
	if (document.body.style.pointerEvents !== "none") return false;
	if (hasOpenModal()) return false;

	document.body.style.removeProperty("pointer-events");
	return true;
}

/**
 * Libera o travamento órfão quando `open` passa de aberto para fechado. Espera o
 * Radix terminar de desmontar o conteúdo antes de decidir, para não atropelar um
 * modal que continua legitimamente aberto por baixo.
 */
export function useReleaseBodyPointerEventsLock(open: boolean): void {
	const wasOpen = useRef(open);

	useEffect(() => {
		const justClosed = wasOpen.current && !open;
		wasOpen.current = open;
		if (!justClosed) return;

		const timer = window.setTimeout(() => {
			releaseBodyPointerEventsLock();
		}, 350);

		return () => window.clearTimeout(timer);
	}, [open]);
}
