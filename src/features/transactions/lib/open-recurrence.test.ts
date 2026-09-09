import { describe, expect, it } from "vitest";
import {
	buildOpenRecurrenceRowsToInsert,
	dedupeRecurrenceTemplatesByPayer,
} from "./open-recurrence";

const baseTemplate = {
	id: "tpl-1",
	payerId: "payer-1",
	period: "2026-05",
	purchaseDate: new Date("2026-05-29T12:00:00"),
	dueDate: new Date("2026-06-05T12:00:00"),
	isSettled: false,
	name: "CPFL",
	transactionType: "Despesa",
	condition: "Recorrente",
	paymentMethod: "Boleto",
	note: null,
	accountId: "acc-1",
	cardId: null,
	categoryId: "cat-1",
	amount: "-345.27",
	boletoPaymentDate: null,
	isDivided: false,
	splitGroupId: null,
};

describe("dedupeRecurrenceTemplatesByPayer", () => {
	it("mantém uma linha por pagador na âncora", () => {
		const rows = [
			baseTemplate,
			{ ...baseTemplate, id: "tpl-2" },
			{ ...baseTemplate, id: "tpl-3", payerId: "payer-2" },
		];

		expect(dedupeRecurrenceTemplatesByPayer(rows)).toHaveLength(2);
	});
});

describe("buildOpenRecurrenceRowsToInsert", () => {
	it("gera no máximo uma ocorrência por pagador no período", () => {
		const anchorTemplates = [
			baseTemplate,
			{ ...baseTemplate, id: "tpl-dup" },
		];

		const rows = buildOpenRecurrenceRowsToInsert({
			dataOwnerUserId: "user-1",
			seriesId: "series-1",
			anchorPeriod: "2026-05",
			period: "2026-09",
			anchorTemplates,
			existingAtPeriod: [],
			isSplitSeries: false,
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.period).toBe("2026-09");
		expect(rows[0]?.purchaseDate).toEqual(new Date("2026-09-29T12:00:00"));
	});

	it("não duplica quando o pagador já existe no período", () => {
		const existingAtPeriod = [
			{
				...baseTemplate,
				id: "existing-1",
				period: "2026-09",
				purchaseDate: new Date("2026-09-29T12:00:00"),
			},
		];

		const rows = buildOpenRecurrenceRowsToInsert({
			dataOwnerUserId: "user-1",
			seriesId: "series-1",
			anchorPeriod: "2026-05",
			period: "2026-09",
			anchorTemplates: [baseTemplate],
			existingAtPeriod,
			isSplitSeries: false,
		});

		expect(rows).toHaveLength(0);
	});

	it("não insere duas linhas para o mesmo pagador no mesmo lote", () => {
		const rows = buildOpenRecurrenceRowsToInsert({
			dataOwnerUserId: "user-1",
			seriesId: "series-1",
			anchorPeriod: "2026-09",
			period: "2026-09",
			anchorTemplates: [
				baseTemplate,
				{ ...baseTemplate, id: "tpl-dup-2" },
				{ ...baseTemplate, id: "tpl-dup-3" },
			],
			existingAtPeriod: [],
			isSplitSeries: false,
		});

		expect(rows).toHaveLength(1);
	});
});
