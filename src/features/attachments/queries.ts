import { cacheLife, cacheTag } from "next/cache";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { getSupabaseAdmin } from "@/shared/lib/supabase/admin";

export type AttachmentForPeriod = {
	attachmentId: string;
	fileName: string;
	fileSize: number;
	mimeType: string;
	transactionId: string;
	transactionName: string;
	transactionAmount: string;
	transactionPeriod: string;
	purchaseDate: Date;
	categoryName: string | null;
	categoryIcon: string | null;
	payerId: string;
	payerName: string;
	payerAvatarUrl: string | null;
};

export type AttachmentsPageData = {
	attachments: AttachmentForPeriod[];
	adminPayerId: string;
};

type AttachRow = {
	anexos: {
		id: string;
		nome_arquivo: string;
		tamanho_bytes: number;
		mime_type: string;
	};
	lancamentos: {
		id: string;
		nome: string;
		valor: string;
		periodo: string;
		data_compra: string;
		pagador_id: string;
		pagadores: {
			id: string;
			nome: string;
			avatar_url: string | null;
		} | null;
		categorias: {
			nome: string;
			icone: string | null;
		} | null;
	};
};

export async function fetchAttachmentsForPeriod(
	userId: string,
	period: string,
	payerScope?: string | "all",
): Promise<AttachmentForPeriod[]> {
	"use cache";
	cacheTag(`dashboard-${userId}`);
	cacheLife({ revalidate: 3 });

	const [adminPayerId, dataOwnerUserId] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
	]);
	if (!adminPayerId) return [];
	const payerId = payerScope ?? adminPayerId;

	const supabase = getSupabaseAdmin();
	const select = [
		"anexos:anexos!anexo_id(id, nome_arquivo, tamanho_bytes, mime_type)",
		"lancamentos:lancamentos!lancamento_id(id, nome, valor, periodo, data_compra, pagador_id, pagadores:pagadores!pagador_id(id, nome, avatar_url), categorias:categorias!categoria_id(nome, icone))",
	].join(",");

	let query = supabase
		.from("lancamento_anexos")
		.select(select)
		.eq("lancamentos.user_id", dataOwnerUserId)
		.eq("lancamentos.periodo", period);

	if (payerId !== "all") {
		query = query.eq("lancamentos.pagador_id", payerId);
	}

	const { data, error } = await query;
	if (error) {
		console.error("[attachments] fetchAttachmentsForPeriod falhou", {
			userId,
			period,
			error: error.message,
		});
		throw error;
	}

	const mapped = (data ?? []).map((row) => {
		const attach = (row as unknown as AttachRow).anexos;
		const lancamento = (row as unknown as AttachRow).lancamentos;
		return {
			attachmentId: attach.id,
			fileName: attach.nome_arquivo,
			fileSize: attach.tamanho_bytes,
			mimeType: attach.mime_type,
			transactionId: lancamento.id,
			transactionName: lancamento.nome,
			transactionAmount: lancamento.valor,
			transactionPeriod: lancamento.periodo,
			purchaseDate: new Date(`${lancamento.data_compra}T00:00:00`),
			categoryName: lancamento.categorias?.nome ?? null,
			categoryIcon: lancamento.categorias?.icone ?? null,
			payerId: lancamento.pagador_id,
			payerName: lancamento.pagadores?.nome ?? "",
			payerAvatarUrl: lancamento.pagadores?.avatar_url ?? null,
		};
	});

	mapped.sort(
		(a, b) =>
			b.purchaseDate.getTime() - a.purchaseDate.getTime() ||
			a.transactionId.localeCompare(b.transactionId),
	);

	return mapped;
}

export async function fetchAttachmentsPageData(
	userId: string,
	period: string,
): Promise<AttachmentsPageData | null> {
	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) return null;
	const rows = await fetchAttachmentsForPeriod(userId, period, "all");
	return { attachments: rows, adminPayerId };
}
