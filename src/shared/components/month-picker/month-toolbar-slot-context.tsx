"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useState,
} from "react";
import type { MonthToolbarMobileColumns } from "@/features/transactions/lib/month-toolbar";

type MonthToolbarSlotElements = {
	create: HTMLDivElement | null;
	mobileActions: HTMLDivElement | null;
	filters: HTMLDivElement | null;
	expand: HTMLDivElement | null;
	end: HTMLDivElement | null;
	legacy: HTMLDivElement | null;
};

type MonthToolbarSlotContextValue = {
	slots: MonthToolbarSlotElements;
	mobileColumns: MonthToolbarMobileColumns;
	setCreateSlot: (node: HTMLDivElement | null) => void;
	setMobileActionsSlot: (node: HTMLDivElement | null) => void;
	setFiltersSlot: (node: HTMLDivElement | null) => void;
	setExpandSlot: (node: HTMLDivElement | null) => void;
	setEndSlot: (node: HTMLDivElement | null) => void;
	setLegacySlot: (node: HTMLDivElement | null) => void;
};

const MonthToolbarSlotContext =
	createContext<MonthToolbarSlotContextValue | null>(null);

type MonthToolbarSlotProviderProps = {
	children: ReactNode;
	mobileColumns?: MonthToolbarMobileColumns;
};

export function MonthToolbarSlotProvider({
	children,
	mobileColumns = 4,
}: MonthToolbarSlotProviderProps) {
	const [create, setCreateSlot] = useState<HTMLDivElement | null>(null);
	const [mobileActions, setMobileActionsSlot] = useState<HTMLDivElement | null>(
		null,
	);
	const [filters, setFiltersSlot] = useState<HTMLDivElement | null>(null);
	const [expand, setExpandSlot] = useState<HTMLDivElement | null>(null);
	const [end, setEndSlot] = useState<HTMLDivElement | null>(null);
	const [legacy, setLegacySlot] = useState<HTMLDivElement | null>(null);

	const value = useMemo(
		() => ({
			slots: { create, mobileActions, filters, expand, end, legacy },
			mobileColumns,
			setCreateSlot,
			setMobileActionsSlot,
			setFiltersSlot,
			setExpandSlot,
			setEndSlot,
			setLegacySlot,
		}),
		[create, mobileActions, filters, expand, end, legacy, mobileColumns],
	);

	return (
		<MonthToolbarSlotContext.Provider value={value}>
			{children}
		</MonthToolbarSlotContext.Provider>
	);
}

export function useMonthToolbarSlotContext() {
	return useContext(MonthToolbarSlotContext);
}

export function useMonthToolbarMobileColumns(): MonthToolbarMobileColumns {
	return useMonthToolbarSlotContext()?.mobileColumns ?? 4;
}

export function useMonthToolbarSlot(
	key: keyof MonthToolbarSlotElements,
): HTMLDivElement | null {
	const context = useMonthToolbarSlotContext();
	return context?.slots[key] ?? null;
}

export function useMonthToolbarSlotRef(key: keyof MonthToolbarSlotElements) {
	const context = useMonthToolbarSlotContext();

	return useCallback(
		(node: HTMLDivElement | null) => {
			if (!context) return;

			switch (key) {
				case "create":
					context.setCreateSlot(node);
					break;
				case "mobileActions":
					context.setMobileActionsSlot(node);
					break;
				case "filters":
					context.setFiltersSlot(node);
					break;
				case "expand":
					context.setExpandSlot(node);
					break;
				case "end":
					context.setEndSlot(node);
					break;
				case "legacy":
					context.setLegacySlot(node);
					break;
			}
		},
		[context, key],
	);
}

export function useResolvedMonthToolbarSlot(
	elementId: string | null | undefined,
	contextKey: keyof MonthToolbarSlotElements,
): HTMLDivElement | null {
	const contextSlot = useMonthToolbarSlot(contextKey);
	const [fallbackSlot, setFallbackSlot] = useState<HTMLDivElement | null>(null);

	useLayoutEffect(() => {
		if (contextSlot || !elementId) {
			setFallbackSlot(null);
			return;
		}

		const resolve = () => {
			const element = document.getElementById(elementId);
			if (element instanceof HTMLDivElement && element.isConnected) {
				setFallbackSlot(element);
				return true;
			}

			setFallbackSlot(null);
			return false;
		};

		if (resolve()) return;

		const observer = new MutationObserver(() => {
			if (resolve()) {
				observer.disconnect();
			}
		});

		observer.observe(document.body, { childList: true, subtree: true });

		return () => {
			observer.disconnect();
			setFallbackSlot(null);
		};
	}, [contextSlot, elementId]);

	return contextSlot ?? fallbackSlot;
}
