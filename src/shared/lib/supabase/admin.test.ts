import { describe, expect, it, vi } from "vitest";
import { createQueuedFetch } from "./admin";

describe("createQueuedFetch", () => {
	it("não deixa passar mais que o limite ao mesmo tempo", async () => {
		// O que derrubava a página: uma rajada de handshakes TLS simultâneos
		// falhava, e o fetch do Node devolvia erro sem corpo.
		let ativos = 0;
		let pico = 0;

		vi.stubGlobal("fetch", async () => {
			ativos += 1;
			pico = Math.max(pico, ativos);
			await new Promise((resolve) => setTimeout(resolve, 5));
			ativos -= 1;
			return new Response("ok");
		});

		const queued = createQueuedFetch(3);
		await Promise.all(
			Array.from({ length: 12 }, () => queued("https://exemplo.test")),
		);

		expect(pico).toBe(3);
		expect(ativos).toBe(0);
		vi.unstubAllGlobals();
	});

	it("libera a vaga mesmo quando a requisição falha", async () => {
		// Sem o `finally`, uma falha de rede travaria a fila para sempre.
		let chamadas = 0;
		vi.stubGlobal("fetch", () => {
			chamadas += 1;
			return chamadas === 1
				? Promise.reject(new Error("TLS caiu"))
				: Promise.resolve(new Response("ok"));
		});

		const queued = createQueuedFetch(1);

		await expect(queued("https://exemplo.test")).rejects.toThrow("TLS caiu");
		await expect(queued("https://exemplo.test")).resolves.toBeInstanceOf(
			Response,
		);
		expect(chamadas).toBe(2);
		vi.unstubAllGlobals();
	});
});
