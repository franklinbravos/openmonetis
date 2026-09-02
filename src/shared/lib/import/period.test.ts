import { describe, expect, it } from "vitest";
import { resolveImportRowPeriod } from "./period";

const date = (value: string) => {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
};

describe("resolveImportRowPeriod", () => {
	it("fatura de cartão mantém o período da fatura", () => {
		// A compra de 28/07 entra na fatura de agosto — é assim que cartão funciona.
		expect(
			resolveImportRowPeriod({
				date: date("2026-07-28"),
				invoicePeriod: "2026-08",
				isCardImport: true,
			}),
		).toBe("2026-08");
	});

	it("extrato de conta usa a data de cada lançamento", () => {
		// Mesmo quando a tela abriu a importação com um período na URL: o extrato
		// não tem período, tem intervalo.
		expect(
			resolveImportRowPeriod({
				date: date("2026-07-28"),
				invoicePeriod: "2026-08",
				isCardImport: false,
			}),
		).toBe("2026-07");
	});

	it("arquivo de conta que atravessa meses gera um período por mês", () => {
		const periods = ["2026-07-31", "2026-08-01", "2026-09-15"].map((value) =>
			resolveImportRowPeriod({
				date: date(value),
				invoicePeriod: "2026-08",
				isCardImport: false,
			}),
		);

		expect(periods).toEqual(["2026-07", "2026-08", "2026-09"]);
	});

	it("cartão sem período declarado cai na data, em vez de ficar sem período", () => {
		expect(
			resolveImportRowPeriod({
				date: date("2026-08-09"),
				invoicePeriod: null,
				isCardImport: true,
			}),
		).toBe("2026-08");
	});
});
