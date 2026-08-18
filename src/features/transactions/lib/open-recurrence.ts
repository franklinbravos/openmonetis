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

function getPeriodOffset(basePeriod: string, targetPeriod: string): number {
	const base = parsePeriod(basePeriod);
	const target = parsePeriod(targetPeriod);
	return (target.year - base.year) * 12 + (target.month - base.month);
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

	if (seriesIds.length === 0) {
		return;
	}

	for (const seriesId of seriesIds) {
		const seriesTransactions = await db.query.transactions.findMany({
			where: and(
				eq(transactions.userId, dataOwnerUserId),
				eq(transactions.seriesId, seriesId),
				eq(transactions.condition, CONDITION_RECURRING),
				isNull(transactions.recurrenceCount),
			),
		});

		if (seriesTransactions.length === 0) {
			continue;
		}

		let anchorPeriod = seriesTransactions[0]?.period ?? null;
		for (const row of seriesTransactions) {
			if (!row.period) continue;
			if (!anchorPeriod || comparePeriods(row.period, anchorPeriod) < 0) {
				anchorPeriod = row.period;
			}
		}

		if (!anchorPeriod || comparePeriods(targetPeriod, anchorPeriod) < 0) {
			continue;
		}

		const anchorTemplates = seriesTransactions.filter(
			(row) => row.period === anchorPeriod,
		);
		const isSplitSeries = anchorTemplates.some((row) => row.splitGroupId);

		for (const period of buildPeriodRange(anchorPeriod, targetPeriod)) {
			const existingAtPeriod = seriesTransactions.filter(
				(row) => row.period === period,
			);
			if (existingAtPeriod.length >= anchorTemplates.length) {
				continue;
			}

			const offset = getPeriodOffset(anchorPeriod, period);
			const splitGroupId = isSplitSeries && offset > 0 ? randomUUID() : null;
			const rowsToInsert = [];

			for (const template of anchorTemplates) {
				if (existingAtPeriod.some((row) => row.payerId === template.payerId)) {
					continue;
				}

				const purchaseDate = template.purchaseDate
					? addMonthsToDate(template.purchaseDate, offset)
					: template.purchaseDate;
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
					purchaseDate,
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
			}

			if (rowsToInsert.length === 0) {
				continue;
			}

			await db.insert(transactions).values(rowsToInsert);
		}
	}
}
