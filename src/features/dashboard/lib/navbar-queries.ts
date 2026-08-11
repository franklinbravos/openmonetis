import { and, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { payers } from "@/db/schema";
import { fetchPendingInboxCount } from "@/features/inbox/queries";
import type { NavbarFinanceLinks } from "@/shared/components/navigation/navbar/nav-items";
import { isAccountInactive } from "@/shared/lib/accounts/constants";
import {
	type AccountWithoutMovements,
	fetchAccountsWithoutMovements,
} from "@/shared/lib/accounts/queries";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { getBusinessDateString } from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import {
	type DashboardNotificationsSnapshot,
	fetchDashboardNotifications,
} from "../notifications/notifications-queries";

type DashboardNavbarData = {
	payerAvatarUrl: string | null;
	inboxPendingCount: number;
	notificationsSnapshot: DashboardNotificationsSnapshot;
	financeLinks: NavbarFinanceLinks;
};

type NavbarCardRow = {
	card_id: string;
	card_name: string;
	card_logo: string | null;
	amount: string | number | null;
};

type NavbarAccountRow = {
	id: string;
	nome: string;
	status: string;
	logo: string;
	saldo_inicial: string | number | null;
	saldo_movimentacoes: string | number | null;
};

async function fetchAdminPayerAvatarUrl(
	userId: string,
	adminPayerId: string | null,
): Promise<string | null> {
	if (!adminPayerId) {
		return null;
	}

	const payer = await db.query.payers.findFirst({
		columns: {
			avatarUrl: true,
		},
		where: and(eq(payers.id, adminPayerId), eq(payers.userId, userId)),
	});

	return payer?.avatarUrl ?? null;
}

const toNavbarAccountRow = (
	row: AccountWithoutMovements,
): NavbarAccountRow => ({
	id: row.id,
	nome: row.name,
	status: row.status,
	logo: row.logo,
	saldo_inicial: row.initialBalance,
	saldo_movimentacoes: null,
});

async function fetchDashboardNavbarDataInternal(
	userId: string,
): Promise<DashboardNavbarData> {
	const currentPeriod = getBusinessDateString().slice(0, 7);
	const adminPayerId = await getAdminPayerId(userId);
	const [
		payerAvatarUrl,
		notificationsSnapshot,
		inboxPendingCount,
		activeCards,
		activeAccounts,
	] = await Promise.all([
		fetchAdminPayerAvatarUrl(userId, adminPayerId),
		fetchDashboardNotifications(userId, currentPeriod),
		fetchPendingInboxCount(userId),
		callRpc<NavbarCardRow>("get_navbar_cards", {
			p_user_id: userId,
			p_period: currentPeriod,
		}),
		adminPayerId
			? callRpc<NavbarAccountRow>("get_account_balances", {
					p_user_id: userId,
					p_admin_payer_id: adminPayerId,
				})
			: fetchAccountsWithoutMovements(userId).then((rows) =>
					rows.map(toNavbarAccountRow),
				),
	]);

	return {
		payerAvatarUrl,
		inboxPendingCount,
		notificationsSnapshot,
		financeLinks: {
			cards: activeCards.map((card) => ({
				id: card.card_id,
				name: card.card_name,
				logo: card.card_logo,
				amount: Math.abs(safeToNumber(card.amount)),
			})),
			accounts: activeAccounts
				.filter((account) => !isAccountInactive(account.status))
				.sort((left, right) => left.nome.localeCompare(right.nome))
				.map((account) => ({
					id: account.id,
					name: account.nome,
					logo: account.logo,
					amount:
						safeToNumber(account.saldo_inicial) +
						safeToNumber(account.saldo_movimentacoes),
				})),
		},
	};
}

export async function fetchDashboardNavbarData(userId: string) {
	"use cache";
	cacheTag(`dashboard-${userId}`);
	cacheLife({ revalidate: 3 });
	return fetchDashboardNavbarDataInternal(userId);
}
