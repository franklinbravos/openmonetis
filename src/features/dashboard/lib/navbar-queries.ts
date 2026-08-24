import { and, eq, ilike } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { payers, user } from "@/db/schema";
import { fetchPendingInboxCount } from "@/features/inbox/queries";
import type { Payer } from "@/features/payers/components/types";
import { fetchPayersForUser } from "@/features/payers/queries";
import type { NavbarFinanceLinks } from "@/shared/components/navigation/navbar/nav-items";
import { isAccountInactive } from "@/shared/lib/accounts/constants";
import {
	type AccountWithoutMovements,
	fetchAccountsWithoutMovements,
} from "@/shared/lib/accounts/queries";
import { db } from "@/shared/lib/db";
import { PAYER_ROLE_ADMIN } from "@/shared/lib/payers/constants";
import { getFinancialDataOwnerId } from "@/shared/lib/payers/financial-context";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { callRpc } from "@/shared/lib/supabase/rpc";
import { getBusinessDateString } from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import {
	type DashboardNotificationsSnapshot,
	fetchDashboardNotifications,
} from "../notifications/notifications-queries";

type DashboardNavbarData = {
	viewerAvatarUrl: string | null;
	profilePayer: Payer | null;
	avatarOptions: string[];
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

async function fetchViewerAvatarUrl(
	viewerUserId: string,
	viewerEmail: string | null,
): Promise<string | null> {
	const ownAdmin = await db.query.payers.findFirst({
		columns: { avatarUrl: true },
		where: and(
			eq(payers.userId, viewerUserId),
			eq(payers.role, PAYER_ROLE_ADMIN),
		),
	});
	if (ownAdmin?.avatarUrl) {
		return ownAdmin.avatarUrl;
	}

	const normalizedEmail = viewerEmail?.trim().toLowerCase();
	if (!normalizedEmail) {
		return null;
	}

	const dataOwnerUserId = await getFinancialDataOwnerId(viewerUserId);
	if (!dataOwnerUserId) {
		return null;
	}

	// `lower(email) = x` não é traduzível para PostgREST. `ilike` compara sem
	// diferenciar caixa; a igualdade é reconfirmada aqui porque `%`, `_` e `*`
	// no e-mail viram curinga e casariam a pessoa errada.
	const candidates = await db.query.payers.findMany({
		columns: { avatarUrl: true, email: true },
		where: and(
			eq(payers.userId, dataOwnerUserId),
			ilike(payers.email, normalizedEmail),
		),
	});

	const familyPayer = candidates.find(
		(candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail,
	);

	return familyPayer?.avatarUrl ?? null;
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
	const [adminPayerId, dataOwnerUserId, viewerAccount] = await Promise.all([
		getAdminPayerId(userId),
		getFinancialDataOwnerId(userId),
		db.query.user.findFirst({
			columns: { email: true },
			where: eq(user.id, userId),
		}),
	]);
	const viewerEmail = viewerAccount?.email ?? null;
	const [
		viewerAvatarUrl,
		notificationsSnapshot,
		inboxPendingCount,
		activeCards,
		activeAccounts,
		payersPageData,
	] = await Promise.all([
		fetchViewerAvatarUrl(userId, viewerEmail),
		fetchDashboardNotifications(userId, currentPeriod),
		fetchPendingInboxCount(userId),
		callRpc<NavbarCardRow>("get_navbar_cards", {
			p_user_id: dataOwnerUserId,
			p_period: currentPeriod,
		}),
		adminPayerId
			? callRpc<NavbarAccountRow>("get_account_balances", {
					p_user_id: dataOwnerUserId,
					p_admin_payer_id: adminPayerId,
				})
			: fetchAccountsWithoutMovements(dataOwnerUserId).then((rows) =>
					rows.map(toNavbarAccountRow),
				),
		fetchPayersForUser(userId),
	]);

	const normalizedViewerEmail = viewerEmail?.trim().toLowerCase() ?? null;
	const profilePayer =
		payersPageData.payers.find(
			(payer) => payer.role === PAYER_ROLE_ADMIN && !payer.shareId,
		) ??
		(normalizedViewerEmail
			? (payersPageData.payers.find((payer) => {
					const loginEmail = payer.loginEmail?.trim().toLowerCase();
					const payerEmail = payer.email?.trim().toLowerCase();
					return (
						loginEmail === normalizedViewerEmail ||
						payerEmail === normalizedViewerEmail
					);
				}) ?? null)
			: null);

	return {
		viewerAvatarUrl,
		profilePayer,
		avatarOptions: payersPageData.avatarOptions,
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
