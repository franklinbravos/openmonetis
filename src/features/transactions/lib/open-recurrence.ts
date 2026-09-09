import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { addMonthsToDate } from "@/shared/utils/date";
import {
	buildPeriodRange,
	comparePeriods,
	parsePeriod,
} from "@/shared/utils/period";

const CONDITION_RECURRING = "Recorrente";

/** Evita materializar a mesma série em paralelo no mesmo processo. */
const materializeSeriesLocks = new Map<string, Promise<void>>();

type RecurrenceTemplate = {
	id: string;
	payerId: string | null;
	period: string | null;
	purchaseDate: Date | null;
	dueDate: Date | null;
	isSettled: boolean | null;
	name: string;
	transactionType: string;
	condition: string;
	paymentMethod: string;
	note: string | null;
	accountId: string | null;
	cardId: string | null;
	categoryId: string | null;
	amount: string;
	boletoPaymentDate: Date | null;
	isDivided: boolean | null;
	splitGroupId: string | null;
};

function getPeriodOffset(basePeriod: string, targetPeriod: string): number {
	const base = parsePeriod(basePeriod);
	const target = parsePeriod(targetPeriod);
	return (target.year - base.year) * 12 + (target.month - base.month);
}

function recurrencePayerKey(
	payerId: string | null,
	templateId: string,
): string {
	return payerId ?? templateId;
}

/** Uma ocorrência por pessoa na âncora — evita amplificar duplicatas históricas. */
export function dedupeRecurrenceTemplatesByPayer<T extends RecurrenceTemplate>(
	rows: T[],
): T[] {
	const byPayer = new Map<string, T>();

	for (const row of rows) {
		const key = recurrencePayerKey(row.payerId, row.id);
		if (!byPayer.has(key)) {
			byPayer.set(key, row);
		}
	}

	return [...byPayer.values()];
}

export function buildOpenRecurrenceRowsToInsert(params: {
	dataOwnerUserId: string;
	seriesId: string;
	anchorPeriod: string;
	period: string;
	anchorTemplates: RecurrenceTemplate[];
	existingAtPeriod: RecurrenceTemplate[];
	isSplitSeries: boolean;
}): Array<typeof transactions.$inferInsert> {
	const {
		dataOwnerUserId,
		seriesId,
		anchorPeriod,
		period,
		anchorTemplates,
		existingAtPeriod,
		isSplitSeries,
	} = params;

	const templates = dedupeRecurrenceTemplatesByPayer(anchorTemplates);
	const existingPayerKeys = new Set(
		existingAtPeriod.map((row) => recurrencePayerKey(row.payerId, row.id)),
	);

	if (existingPayerKeys.size >= templates.length) {
		return [];
	}

	const offset = getPeriodOffset(anchorPeriod, period);
	const splitGroupId = isSplitSeries && offset > 0 ? randomUUID() : null;
	const rowsToInsert: Array<typeof transactions.$inferInsert> = [];
	const scheduledPayerKeys = new Set(existingPayerKeys);

	for (const template of templates) {
		const payerKey = recurrencePayerKey(template.payerId, template.id);
		if (scheduledPayerKeys.has(payerKey)) {
			continue;
		}

		const purchaseDateValue = template.purchaseDate
			? addMonthsToDate(template.purchaseDate, offset)
			: null;
		if (!purchaseDateValue) {
			continue;
		}
		const dueDate = template.dueDate
			? addMonthsToDate(template.dueDate, offset)
			: null;
		const settled = offset === 0 ? template.isSettled : false;

		rowsToInsert.push({
			userId: dataOwnerUserId,
			seriesId,
			name: template.name,
			transactionType: template.transactionType,
			condition: template.condition,
			paymentMethod: template.paymentMethod,
			note: template.note,
			accountId: template.accountId,
			cardId: template.cardId,
			categoryId: template.categoryId,
			amount: template.amount,
			payerId: template.payerId,
			purchaseDate: purchaseDateValue,
			period,
			isSettled: settled,
			recurrenceCount: null,
			installmentCount: null,
			currentInstallment: null,
			dueDate,
			boletoPaymentDate:
				template.paymentMethod === "Boleto" && settled
					? template.boletoPaymentDate
					: null,
			isDivided: template.isDivided ?? false,
			isAnticipated: false,
			splitGroupId: offset === 0 ? template.splitGroupId : splitGroupId,
		});
		scheduledPayerKeys.add(payerKey);
	}

	return rowsToInsert;
}

async function materializeOpenRecurrenceSeries(
	dataOwnerUserId: string,
	seriesId: string,
	targetPeriod: string,
): Promise<void> {
	const lockKey = `${dataOwnerUserId}:${seriesId}`;
	const inflight = materializeSeriesLocks.get(lockKey);
	if (inflight) {
		await inflight;
		return;
	}

	const work = (async () => {
		const seriesTransactions = await db.query.transactions.findMany({
			where: and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.seriesId, seriesId),
				eq(transactions.condition, CONDITION_RECURRING),
				isNull(transactions.recurrenceCount),
			),
		});

		if (seriesTransactions.length === 0) {
			return;
		}

		let anchorPeriod = seriesTransactions[0]?.period ?? null;
		for (const row of seriesTransactions) {
			if (!row.period) continue;
			if (!anchorPeriod || comparePeriods(row.period, anchorPeriod) < 0) {
				anchorPeriod = row.period;
			}
		}

		if (!anchorPeriod || comparePeriods(targetPeriod, anchorPeriod) < 0) {
			return;
		}

		const anchorTemplates = seriesTransactions.filter(
			(row) => row.period === anchorPeriod,
		);
		const isSplitSeries = anchorTemplates.some((row) => row.splitGroupId);
		const knownRows = [...seriesTransactions];

		for (const period of buildPeriodRange(anchorPeriod, targetPeriod)) {
			const existingAtPeriod = knownRows.filter((row) => row.period === period);
			const rowsToInsert = buildOpenRecurrenceRowsToInsert({
				dataOwnerUserId,
				seriesId,
				anchorPeriod,
				period,
				anchorTemplates,
				existingAtPeriod,
				isSplitSeries,
			});

			if (rowsToInsert.length === 0) {
				continue;
			}

			const inserted = await db
				.insert(transactions)
				.values(rowsToInsert)
				.returning();
			knownRows.push(...inserted);
		}
	})();

	materializeSeriesLocks.set(lockKey, work);
	try {
		await work;
	} finally {
		materializeSeriesLocks.delete(lockKey);
	}
}

/**
 * Materializa ocorrências de séries recorrentes abertas (recurrenceCount null)
 * do mês inicial até o período solicitado.
 */
export async function ensureOpenRecurrenceInstancesForPeriod(
	dataOwnerUserId: string,
	targetPeriod: string,
): Promise<void> {
	if (!/^\d{4}-\d{2}$/.test(targetPeriod)) {
		return;
	}

	const seriesRows = await db
		.selectDistinct({ seriesId: transactions.seriesId })
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.condition, CONDITION_RECURRING),
				isNull(transactions.recurrenceCount),
				isNotNull(transactions.seriesId),
			),
		);

	const seriesIds = seriesRows
		.map((row) => row.seriesId)
		.filter((id): id is string => Boolean(id));

	for (const seriesId of seriesIds) {
		await materializeOpenRecurrenceSeries(
			dataOwnerUserId,
			seriesId,
			targetPeriod,
		);
	}
}
