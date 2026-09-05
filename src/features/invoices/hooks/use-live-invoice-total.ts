"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef } from "react";
import { fetchInvoiceTotalClient } from "@/features/invoices/lib/invoices-api-client";
import { createClient } from "@/shared/lib/supabase/client";

type UseLiveInvoiceTotalOptions = {
	cardId: string;
	period: string;
	financialDataOwnerId: string;
	viewerUserId: string;
	enabled?: boolean;
	onTotalChange: (totalAmount: number) => void;
};

type InvoiceTransactionRow = {
	cartao_id?: string | null;
	card_id?: string | null;
	cardId?: string | null;
	periodo?: string | null;
	period?: string | null;
};

function readInvoiceRow(row: InvoiceTransactionRow | undefined) {
	return {
		cardId: row?.cartao_id ?? row?.card_id ?? row?.cardId ?? null,
		period: row?.periodo ?? row?.period ?? null,
	};
}

function affectsInvoicePeriod(
	payload: RealtimePostgresChangesPayload<InvoiceTransactionRow>,
	cardId: string,
	period: string,
) {
	if (payload.eventType === "DELETE") {
		const deleted = readInvoiceRow(payload.old);
		return deleted.cardId === cardId && deleted.period === period;
	}

	const next = readInvoiceRow(payload.new);
	const previous = readInvoiceRow(payload.old);

	return (
		(next.cardId === cardId && next.period === period) ||
		(previous.cardId === cardId && previous.period === period)
	);
}

export function useLiveInvoiceTotal({
	cardId,
	period,
	financialDataOwnerId,
	viewerUserId,
	enabled = true,
	onTotalChange,
}: UseLiveInvoiceTotalOptions) {
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestRef = useRef(0);

	const refetchTotal = useCallback(async () => {
		const requestId = requestRef.current + 1;
		requestRef.current = requestId;

		const result = await fetchInvoiceTotalClient({ cardId, period });
		if (!result.success || requestId !== requestRef.current) {
			return;
		}

		onTotalChange(result.data?.totalAmount ?? 0);
	}, [cardId, onTotalChange, period]);

	const scheduleRefetch = useCallback(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		debounceRef.current = setTimeout(() => {
			void refetchTotal();
		}, 120);
	}, [refetchTotal]);

	useEffect(() => {
		if (!enabled || viewerUserId !== financialDataOwnerId) {
			return;
		}

		const supabase = createClient();
		const channel = supabase
			.channel(`invoice-total:${financialDataOwnerId}:${cardId}:${period}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "lancamentos",
					filter: `user_id=eq.${financialDataOwnerId}`,
				},
				(payload) => {
					if (
						!affectsInvoicePeriod(
							payload as RealtimePostgresChangesPayload<InvoiceTransactionRow>,
							cardId,
							period,
						)
					) {
						return;
					}

					scheduleRefetch();
				},
			)
			.subscribe();

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}

			void supabase.removeChannel(channel);
		};
	}, [
		cardId,
		enabled,
		financialDataOwnerId,
		period,
		scheduleRefetch,
		viewerUserId,
	]);

	return { refetchTotal };
}
