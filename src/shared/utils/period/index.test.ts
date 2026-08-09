import { describe, expect, it } from "vitest";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	buildPeriodWindow,
	comparePeriods,
	dateToPeriod,
	derivePeriodFromDate,
	displayPeriod,
	formatCompactPeriodLabel,
	formatMonthYearLabel,
	formatPeriod,
	formatPeriodForUrl,
	formatPeriodMonthShort,
	formatShortPeriodLabel,
	getCurrentPeriod,
	getNextPeriod,
	getPreviousPeriod,
	parsePeriod,
	parsePeriodParam,
	periodToDate,
} from "./index";

describe("parsePeriod", () => {
	it("extrai ano e mês de um período válido", () => {
		expect(parsePeriod("2025-11")).toEqual({ year: 2025, month: 11 });
	});

	it("lança erro para mês fora do intervalo", () => {
		expect(() => parsePeriod("2025-00")).toThrow("Período inválido");
		expect(() => parsePeriod("2025-13")).toThrow("Período inválido");
	});

	it("lança erro para formato não numérico", () => {
		expect(() => parsePeriod("abc-def")).toThrow("Período inválido");
		expect(() => parsePeriod("2025")).toThrow("Período inválido");
	});
});

describe("formatPeriod", () => {
	it("formata mês com zero à esquerda", () => {
		expect(formatPeriod(2025, 1)).toBe("2025-01");
		expect(formatPeriod(2025, 12)).toBe("2025-12");
	});
});

describe("navegação de períodos", () => {
	it("getPreviousPeriod volta um mês", () => {
		expect(getPreviousPeriod("2025-11")).toBe("2025-10");
	});

	it("getPreviousPeriod cruza o ano", () => {
		expect(getPreviousPeriod("2025-01")).toBe("2024-12");
	});

	it("getNextPeriod avança um mês", () => {
		expect(getNextPeriod("2025-11")).toBe("2025-12");
	});

	it("getNextPeriod cruza o ano", () => {
		expect(getNextPeriod("2025-12")).toBe("2026-01");
	});

	it("addMonthsToPeriod aceita offset negativo e positivo", () => {
		expect(addMonthsToPeriod("2025-01", -1)).toBe("2024-12");
		expect(addMonthsToPeriod("2025-11", 3)).toBe("2026-02");
	});

	it("getCurrentPeriod usa a data informada", () => {
		expect(getCurrentPeriod(new Date(2025, 10, 15))).toBe("2025-11");
	});
});

describe("comparação e ranges", () => {
	it("comparePeriods ordena corretamente", () => {
		expect(comparePeriods("2025-10", "2025-11")).toBe(-1);
		expect(comparePeriods("2025-11", "2025-11")).toBe(0);
		expect(comparePeriods("2025-12", "2025-11")).toBe(1);
	});

	it("buildPeriodRange gera intervalo inclusivo", () => {
		expect(buildPeriodRange("2025-11", "2026-01")).toEqual([
			"2025-11",
			"2025-12",
			"2026-01",
		]);
	});

	it("buildPeriodRange aceita range invertido", () => {
		expect(buildPeriodRange("2026-01", "2025-12")).toEqual([
			"2025-12",
			"2026-01",
		]);
	});

	it("buildPeriodWindow termina na referência", () => {
		expect(buildPeriodWindow("2025-11", 3)).toEqual([
			"2025-09",
			"2025-10",
			"2025-11",
		]);
	});

	it("buildPeriodWindow com totalMonths zero retorna vazio", () => {
		expect(buildPeriodWindow("2025-11", 0)).toEqual([]);
	});
});

describe("URL params (mes-ano)", () => {
	it("parsePeriodParam converte nome de mês + ano", () => {
		expect(parsePeriodParam("novembro-2025")).toEqual({
			period: "2025-11",
			monthName: "novembro",
			year: 2025,
		});
	});

	it("parsePeriodParam aceita acentos e maiúsculas", () => {
		expect(parsePeriodParam("MARÇO-2025").period).toBe("2025-03");
	});

	it("parsePeriodParam usa referência quando o param é inválido", () => {
		const reference = new Date(2025, 4, 1);
		expect(parsePeriodParam("inexistente-2025", reference).period).toBe(
			"2025-05",
		);
		expect(parsePeriodParam(null, reference).period).toBe("2025-05");
	});

	it("formatPeriodForUrl converte YYYY-MM para mes-ano", () => {
		expect(formatPeriodForUrl("2025-11")).toBe("novembro-2025");
		expect(formatPeriodForUrl("2025-01")).toBe("janeiro-2025");
	});

	it("formatPeriodForUrl devolve o próprio período se inválido", () => {
		expect(formatPeriodForUrl("invalido")).toBe("invalido");
	});
});

describe("display", () => {
	it("formatMonthYearLabel", () => {
		expect(formatMonthYearLabel("2025-11")).toBe("Novembro 2025");
	});

	it("displayPeriod", () => {
		expect(displayPeriod("2025-11")).toBe("Novembro de 2025");
	});

	it("formatShortPeriodLabel", () => {
		expect(formatShortPeriodLabel("2025-11")).toMatch(/Nov\/2025/);
	});

	it("formatCompactPeriodLabel", () => {
		expect(formatCompactPeriodLabel("2025-11")).toMatch(/Nov\/25/);
	});

	it("formatPeriodMonthShort", () => {
		expect(formatPeriodMonthShort("2025-11")).toMatch(/Nov/);
	});
});

describe("data <-> período", () => {
	it("periodToDate retorna primeiro dia do mês", () => {
		const date = periodToDate("2025-11");
		expect(date.getFullYear()).toBe(2025);
		expect(date.getMonth()).toBe(10);
		expect(date.getDate()).toBe(1);
	});

	it("dateToPeriod extrai período da data", () => {
		expect(dateToPeriod(new Date(2025, 10, 20))).toBe("2025-11");
	});

	it("derivePeriodFromDate trata data como local", () => {
		expect(derivePeriodFromDate("2024-01-15")).toBe("2024-01");
	});

	it("derivePeriodFromDate devolve período atual para valor vazio", () => {
		expect(derivePeriodFromDate(null)).toBe(getCurrentPeriod());
		expect(derivePeriodFromDate("invalido")).toBe(getCurrentPeriod());
	});
});
