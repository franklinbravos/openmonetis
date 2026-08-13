import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/payers/access", () => ({
	fetchPayersWithAccess: vi.fn(),
}));

import { fetchPayersWithAccess } from "@/shared/lib/payers/access";
import { resolveFinancialDataContext } from "./financial-context";

const mockedFetchPayersWithAccess = vi.mocked(fetchPayersWithAccess);

describe("resolveFinancialDataContext", () => {
	it("prioriza admin compartilhado para carregar dados do proprietário", async () => {
		mockedFetchPayersWithAccess.mockResolvedValue([
			{
				id: "own-admin",
				userId: "giovanna",
				role: "admin",
				canEdit: true,
				shareId: null,
			},
			{
				id: "shared-admin",
				userId: "franklin",
				role: "admin",
				canEdit: true,
				shareId: "share-1",
			},
		] as never);

		await expect(resolveFinancialDataContext("giovanna")).resolves.toEqual({
			viewerUserId: "giovanna",
			dataOwnerUserId: "franklin",
			adminPayerId: "shared-admin",
			isSharedAccess: true,
			canEditFinancial: true,
			canReadFinancial: true,
		});
	});

	it("usa o próprio usuário quando não há admin compartilhado", async () => {
		mockedFetchPayersWithAccess.mockResolvedValue([
			{
				id: "own-admin",
				userId: "franklin",
				role: "admin",
				canEdit: true,
				shareId: null,
			},
		] as never);

		await expect(resolveFinancialDataContext("franklin")).resolves.toEqual({
			viewerUserId: "franklin",
			dataOwnerUserId: "franklin",
			adminPayerId: "own-admin",
			isSharedAccess: false,
			canEditFinancial: true,
			canReadFinancial: true,
		});
	});

	it("permite leitura com share somente leitura sem edição", async () => {
		mockedFetchPayersWithAccess.mockResolvedValue([
			{
				id: "shared-admin",
				userId: "franklin",
				role: "admin",
				canEdit: false,
				shareId: "share-1",
			},
		] as never);

		await expect(resolveFinancialDataContext("giovanna")).resolves.toEqual({
			viewerUserId: "giovanna",
			dataOwnerUserId: "franklin",
			adminPayerId: "shared-admin",
			isSharedAccess: true,
			canEditFinancial: false,
			canReadFinancial: true,
		});
	});

	it("retorna contexto vazio quando não há admin payer", async () => {
		mockedFetchPayersWithAccess.mockResolvedValue([] as never);

		await expect(resolveFinancialDataContext("giovanna")).resolves.toEqual({
			viewerUserId: "giovanna",
			dataOwnerUserId: "giovanna",
			adminPayerId: null,
			isSharedAccess: false,
			canEditFinancial: false,
			canReadFinancial: false,
		});
	});
});
