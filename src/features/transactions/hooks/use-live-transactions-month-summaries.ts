"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTransactionsMonthSummariesClient } from "@/features/transactions/lib/transactions-api-client";
import type { TransactionsViewMode } from "@/features/transactions/lib/view-mode";
import type { PeriodCarouselMonth } from "@/shared/components/month-picker/period-carousel-types";
import { createClient } from "@/shared/lib/supabase/client";

type UseLiveTransactionsMonthSummariesOptions = {
	initialMonths: PeriodCarouselMonth[];
	viewMode: TransactionsViewMode;
	financialDataOwnerId: string;
	viewerUserId: string;
	enabled?: boolean;
};

export function useLiveTransactionsMonthSummaries({
	initialMonths,
	viewMode,
	financialDataOwnerId,
	viewerUserId,
	enabled = true,
}: UseLiveTransactionsMonthSummariesOptions) {
	const [months, setMonths] = useState(initialMonths);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestRef = useRef(0);

	useEffect(() => {
		setMonths(initialMonths);
	}, [initialMonths]);

	const refetchMonths = useCallback(async () => {
		const requestId = requestRef.current + 1;
		requestRef.current = requestId;

		const result = await fetchTransactionsMonthSummariesClient(viewMode);
		if (!result.success || requestId !== requestRef.current) {
			return;
		}

		setMonths(result.data?.months ?? []);
	}, [viewMode]);

	const scheduleRefetch = useCallback(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		debounceRef.current = setTimeout(() => {
			void refetchMonths();
		}, 120);
	}, [refetchMonths]);

	useEffect(() => {
		if (!enabled || viewerUserId !== financialDataOwnerId) {
			return;
		}

		const supabase = createClient();
		const channel = supabase
			.channel(
				`transactions-month-summaries:${financialDataOwnerId}:${viewMode}`,
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "lancamentos",
					filter: `user_id=eq.${financialDataOwnerId}`,
				},
				() => {
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
		enabled,
		financialDataOwnerId,
		scheduleRefetch,
		viewMode,
		viewerUserId,
	]);

	return months;
}
