import { eq } from "drizzle-orm";
import { categories } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { safeToNumber } from "@/shared/utils/number";
import { getPreviousPeriod } from "@/shared/utils/period";

type EstablishmentData = {
	name: string;
	count: number;
	totalAmount: number;
	avgAmount: number;
	categories: { name: string; count: number }[];
};

type TopCategoryData = {
	id: string;
	name: string;
	icon: string | null;
	totalAmount: number;
	transactionCount: number;
};

type TopEstablishmentRow = {
	name: string;
	count: unknown;
	total_amount: unknown;
};

type EstablishmentCategoryRow = {
	establishment_name: string | null;
	category_id: string | null;
	count: unknown;
};

type TopCategoryRow = {
	category_id: string | null;
	total_amount: unknown;
	count: unknown;
};

type CategoryInfo = { id: string; name: string; icon: string | null };

export type TopEstablishmentsData = {
	establishments: EstablishmentData[];
	topCategories: TopCategoryData[];
	summary: {
		totalEstablishments: number;
		totalTransactions: number;
		totalSpent: number;
		avgPerTransaction: number;
		mostFrequent: string | null;
		highestSpending: string | null;
	};
	periodLabel: string;
};

export type PeriodFilter = "3" | "6" | "12";

function buildPeriodRange(currentPeriod: string, months: number): string[] {
	const periods: string[] = [];
	let p = currentPeriod;
	for (let i = 0; i < months; i++) {
		periods.unshift(p);
		p = getPreviousPeriod(p);
	}
	return periods;
}

export function buildEstablishments(
	rows: TopEstablishmentRow[],
	categoriesByEstablishment: EstablishmentCategoryRow[],
	categoryMap: Map<string, CategoryInfo>,
): EstablishmentData[] {
	const categoriesByEstablishmentMap = new Map<
		string,
		Array<{ name: string; count: number }>
	>();

	for (const categoryRow of categoriesByEstablishment) {
		if (!categoryRow.establishment_name || !categoryRow.category_id) {
			continue;
		}

		const current =
			categoriesByEstablishmentMap.get(categoryRow.establishment_name) ?? [];
		current.push({
			name: categoryMap.get(categoryRow.category_id)?.name || "Sem categoria",
			count: Number(categoryRow.count) || 0,
		});
		categoriesByEstablishmentMap.set(categoryRow.establishment_name, current);
	}

	return rows.map((est) => {
		const cnt = Number(est.count) || 0;
		const total = Math.abs(safeToNumber(est.total_amount));

		const estCategories = (categoriesByEstablishmentMap.get(est.name) ?? [])
			.sort(
				(
					a: { name: string; count: number },
					b: { name: string; count: number },
				) => b.count - a.count,
			)
			.slice(0, 3);

		return {
			name: est.name,
			count: cnt,
			totalAmount: total,
			avgAmount: cnt > 0 ? total / cnt : 0,
			categories: estCategories,
		};
	});
}

export async function fetchTopEstablishmentsData(
	userId: string,
	currentPeriod: string,
	periodFilter: PeriodFilter = "6",
): Promise<TopEstablishmentsData> {
	const months = parseInt(periodFilter, 10);
	const periods = buildPeriodRange(currentPeriod, months);
	const startPeriod = periods[0];
	const [adminPayerId, dataOwnerUserId] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
	]);
	const periodLabel =
		months === 3
			? "Últimos 3 meses"
			: months === 6
				? "Últimos 6 meses"
				: "Últimos 12 meses";

	if (!adminPayerId) {
		return {
			establishments: [],
			topCategories: [],
			summary: {
				totalEstablishments: 0,
				totalTransactions: 0,
				totalSpent: 0,
				avgPerTransaction: 0,
				mostFrequent: null,
				highestSpending: null,
			},
			periodLabel,
		};
	}

	const establishmentsData = await callRpc<TopEstablishmentRow>(
		"get_top_establishments",
		{
			p_user_id: dataOwnerUserId,
			p_admin_payer_id: adminPayerId,
			p_start_period: startPeriod,
			p_end_period: currentPeriod,
		},
	);

	const establishmentNames = establishmentsData.map((est) => est.name);

	const [topCategoriesData, categoriesByEstablishment] = await Promise.all([
		callRpc<TopCategoryRow>("get_top_categories", {
			p_user_id: dataOwnerUserId,
			p_admin_payer_id: adminPayerId,
			p_start_period: startPeriod,
			p_end_period: currentPeriod,
		}),
		establishmentNames.length > 0
			? callRpc<EstablishmentCategoryRow>("get_establishment_categories", {
					p_user_id: dataOwnerUserId,
					p_admin_payer_id: adminPayerId,
					p_start_period: startPeriod,
					p_end_period: currentPeriod,
					p_names: establishmentNames,
				})
			: Promise.resolve([]),
	]);

	// Fetch all category names (select simples, permanece no bridge)
	const allCategories = await db
		.select({
			id: categories.id,
			name: categories.name,
			icon: categories.icon,
		})
		.from(categories)
		.where(eq(categories.userId, dataOwnerUserId));

	const categoryMap = new Map<string, CategoryInfo>(
		allCategories.map((c): [string, CategoryInfo] => [c.id, c]),
	);

	const establishments = buildEstablishments(
		establishmentsData,
		categoriesByEstablishment,
		categoryMap,
	);

	// Fetch top categories by spending
	const topCategories: TopCategoryData[] = topCategoriesData
		.filter((category) => category.category_id)
		.map((category) => {
			const catInfo = categoryMap.get(category.category_id as string);
			return {
				id: category.category_id as string,
				name: catInfo?.name || "Sem categoria",
				icon: catInfo?.icon || null,
				totalAmount: Math.abs(safeToNumber(category.total_amount)),
				transactionCount: Number(category.count) || 0,
			};
		});

	// Calculate summary
	const totalTransactions = establishments.reduce((acc, e) => acc + e.count, 0);
	const totalSpent = establishments.reduce((acc, e) => acc + e.totalAmount, 0);

	const mostFrequent =
		establishments.length > 0 ? establishments[0].name : null;

	const sortedBySpending = [...establishments].sort(
		(a, b) => b.totalAmount - a.totalAmount,
	);
	const highestSpending =
		sortedBySpending.length > 0 ? sortedBySpending[0].name : null;

	return {
		establishments,
		topCategories,
		summary: {
			totalEstablishments: establishments.length,
			totalTransactions,
			totalSpent,
			avgPerTransaction:
				totalTransactions > 0 ? totalSpent / totalTransactions : 0,
			mostFrequent,
			highestSpending,
		},
		periodLabel,
	};
}
