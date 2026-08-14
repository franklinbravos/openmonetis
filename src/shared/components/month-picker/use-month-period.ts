"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";

import {
	formatPeriod,
	formatPeriodForUrl,
	PERIOD_SEARCH_PARAM,
	parsePeriodParam,
	TRANSACTIONS_DATE_RANGE_SEARCH_PARAMS,
} from "@/shared/utils/period";

export function useMonthPeriod() {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const periodFromParams = searchParams.get(PERIOD_SEARCH_PARAM);
	const referenceDate = useRef(new Date()).current;
	const defaultPeriod = formatPeriod(
		referenceDate.getFullYear(),
		referenceDate.getMonth() + 1,
	);
	const { period, monthName, year } = parsePeriodParam(
		periodFromParams,
		referenceDate,
	);

	const buildHref = (targetPeriod: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set(PERIOD_SEARCH_PARAM, formatPeriodForUrl(targetPeriod));
		params.delete("page");
		for (const key of TRANSACTIONS_DATE_RANGE_SEARCH_PARAMS) {
			params.delete(key);
		}

		return `${pathname}?${params.toString()}`;
	};

	return {
		period,
		currentMonth: monthName,
		currentYear: year.toString(),
		defaultPeriod,
		buildHref,
	};
}
