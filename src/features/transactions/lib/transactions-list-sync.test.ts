import { describe, expect, it } from "vitest";
import type { TransactionItem } from "@/features/transactions/components/types";
import {
	resolveTransactionsListMatchContext,
	transactionMatchesListContext,
} from "@/features/transactions/lib/transactions-list-sync";

const baseItem = {
	id: "tx-1",
	period: "2026-03",
	purchaseDate: "2026-03-15",
	cardId: "card-1",
	accountId: "account-1",
	payerId: "payer-1",
} as TransactionItem;

describe("transactionMatchesListContext", () => {
	it("lista geral filtra pela data de compra no mês", () => {
		const context = resolveTransactionsListMatchContext("2026-03");

		expect(
			transactionMatchesListContext(
				{ ...baseItem, purchaseDate: "2026-03-02" },
				context,
			),
		).toBe(true);
		expect(
			transactionMatchesListContext(
				{ ...baseItem, period: "2026-04", purchaseDate: "2026-03-02" },
				context,
			),
		).toBe(true);
		expect(
			transactionMatchesListContext(
				{ ...baseItem, purchaseDate: "2026-04-01" },
				context,
			),
		).toBe(false);
	});

	it("fatura filtra por periodo e cartão", () => {
		const context = resolveTransactionsListMatchContext("2026-04", {
			listCardId: "card-1",
		});

		expect(transactionMatchesListContext(baseItem, context)).toBe(false);
		expect(
			transactionMatchesListContext(
				{ ...baseItem, period: "2026-04" },
				context,
			),
		).toBe(true);
		expect(
			transactionMatchesListContext(
				{ ...baseItem, period: "2026-04", cardId: "card-2" },
				context,
			),
		).toBe(false);
	});
});
