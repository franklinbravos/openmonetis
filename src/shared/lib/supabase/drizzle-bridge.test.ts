import { asc, desc } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { importBatches } from "@/db/schema";
import { extractOrderSpec } from "./drizzle-bridge";

describe("extractOrderSpec", () => {
	it("reconhece desc() como descendente", () => {
		// O StringChunk do Drizzle guarda o " desc" em `value` como array de
		// strings. Ler só strings simples fazia todo desc() virar asc() calado —
		// e findFirst devolvia a linha mais antiga em vez da mais recente.
		const spec = extractOrderSpec(desc(importBatches.createdAt));

		expect(spec.column?.name).toBe("created_at");
		expect(spec.ascending).toBe(false);
	});

	it("reconhece asc() como ascendente", () => {
		const spec = extractOrderSpec(asc(importBatches.createdAt));

		expect(spec.column?.name).toBe("created_at");
		expect(spec.ascending).toBe(true);
	});

	it("trata coluna crua como ascendente", () => {
		const spec = extractOrderSpec(importBatches.createdAt);

		expect(spec.column?.name).toBe("created_at");
		expect(spec.ascending).toBe(true);
	});
});
