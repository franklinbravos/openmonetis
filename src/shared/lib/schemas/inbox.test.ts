import { describe, expect, it } from "vitest";
import { inboxBatchSchema, inboxItemSchema } from "./inbox";

describe("inboxItemSchema", () => {
	it("aceita item válido", () => {
		const result = inboxItemSchema.safeParse({
			sourceApp: "com.nu.production",
			sourceAppName: "Nubank",
			originalText: "Compra aprovada de R$ 50,00",
			notificationTimestamp: "2026-01-15T10:00:00-03:00",
			parsedName: "MERCADO",
			parsedAmount: "50.00",
		});
		expect(result.success).toBe(true);
	});

	it("rejeita sem sourceApp", () => {
		const result = inboxItemSchema.safeParse({
			originalText: "texto",
			notificationTimestamp: "2026-01-15T10:00:00Z",
		});
		expect(result.success).toBe(false);
	});

	it("rejeita sem originalText", () => {
		const result = inboxItemSchema.safeParse({
			sourceApp: "app",
			notificationTimestamp: "2026-01-15T10:00:00Z",
		});
		expect(result.success).toBe(false);
	});

	it("rejeita data de notificação inválida", () => {
		const result = inboxItemSchema.safeParse({
			sourceApp: "app",
			originalText: "texto",
			notificationTimestamp: "nao-e-uma-data",
		});
		expect(result.success).toBe(false);
	});

	it("coerce parsedAmount numérico com ponto decimal", () => {
		const result = inboxItemSchema.safeParse({
			sourceApp: "app",
			originalText: "texto",
			notificationTimestamp: "2026-01-15T10:00:00Z",
			parsedAmount: "12.50",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.parsedAmount).toBe(12.5);
		}
	});
});

describe("inboxBatchSchema", () => {
	it("aceita lote com 1..50 itens", () => {
		const item = {
			sourceApp: "app",
			originalText: "texto",
			notificationTimestamp: "2026-01-15T10:00:00Z",
		};
		expect(inboxBatchSchema.safeParse({ items: [item] }).success).toBe(true);
		expect(
			inboxBatchSchema.safeParse({
				items: Array.from({ length: 50 }, () => item),
			}).success,
		).toBe(true);
	});

	it("rejeita lote vazio", () => {
		expect(inboxBatchSchema.safeParse({ items: [] }).success).toBe(false);
	});

	it("rejeita lote acima de 50", () => {
		const item = {
			sourceApp: "app",
			originalText: "texto",
			notificationTimestamp: "2026-01-15T10:00:00Z",
		};
		expect(
			inboxBatchSchema.safeParse({
				items: Array.from({ length: 51 }, () => item),
			}).success,
		).toBe(false);
	});
});
