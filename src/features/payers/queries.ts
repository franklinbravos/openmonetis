import { eq } from "drizzle-orm";
import { user } from "@/db/schema";
import { loadAvatarOptions } from "@/features/payers/lib/avatar-options";
import { buildPayerLoginLinks } from "@/features/payers/lib/payer-family-access";
import { db } from "@/shared/lib/db";
import { fetchPayersWithAccess } from "@/shared/lib/payers/access";
import type { PayerStatus } from "@/shared/lib/payers/constants";
import {
	PAYER_ROLE_ADMIN,
	PAYER_STATUS_OPTIONS,
} from "@/shared/lib/payers/constants";

type PayerData = {
	id: string;
	name: string;
	email: string | null;
	avatarUrl: string | null;
	status: PayerStatus;
	note: string | null;
	role: string | null;
	isAutoSend: boolean;
	createdAt: string;
	canEdit: boolean;
	sharedByName: string | null;
	sharedByEmail: string | null;
	shareId: string | null;
	shareCode: string | null;
	loginEmail: string | null;
	loginUserName: string | null;
	familyAccessActive: boolean;
};

const resolveStatus = (status: string | null): PayerStatus => {
	const normalized = status?.trim() ?? "";
	const found = PAYER_STATUS_OPTIONS.find(
		(option) => option.toLowerCase() === normalized.toLowerCase(),
	);
	return found ?? PAYER_STATUS_OPTIONS[0];
};

const toIsoString = (value: Date | string | null | undefined): string => {
	if (!value) return new Date().toISOString();
	if (value instanceof Date) return value.toISOString();
	return new Date(value).toISOString();
};

export async function fetchPayersForUser(
	userId: string,
): Promise<{ payers: PayerData[]; avatarOptions: string[] }> {
	const [payerRows, localAvatarOptions, userData] = await Promise.all([
		fetchPayersWithAccess(userId),
		loadAvatarOptions(),
		db.query.user.findFirst({
			columns: { image: true },
			where: eq(user.id, userId),
		}),
	]);

	const userImage = userData?.image;
	const avatarOptions = userImage
		? [userImage, ...localAvatarOptions]
		: localAvatarOptions;

	const payersMapped = payerRows.map((pagador) => ({
		id: pagador.id,
		name: pagador.name,
		email: pagador.email,
		avatarUrl: pagador.avatarUrl,
		status: resolveStatus(pagador.status),
		note: pagador.note,
		role: pagador.role,
		isAutoSend: pagador.isAutoSend ?? false,
		createdAt: toIsoString(pagador.createdAt),
		canEdit: pagador.canEdit,
		sharedByName: pagador.sharedByName ?? null,
		sharedByEmail: pagador.sharedByEmail ?? null,
		shareId: pagador.shareId ?? null,
		shareCode: pagador.canManageShares ? (pagador.shareCode ?? null) : null,
		userId: pagador.userId,
	}));

	const loginLinks = await buildPayerLoginLinks(userId, payersMapped);

	const payers = payersMapped
		.map((pagador) => {
			const login = loginLinks.get(pagador.id);
			return {
				id: pagador.id,
				name: pagador.name,
				email: pagador.email,
				avatarUrl: pagador.avatarUrl,
				status: pagador.status,
				note: pagador.note,
				role: pagador.role,
				isAutoSend: pagador.isAutoSend,
				createdAt: pagador.createdAt,
				canEdit: pagador.canEdit,
				sharedByName: pagador.sharedByName,
				sharedByEmail: pagador.sharedByEmail,
				shareId: pagador.shareId,
				shareCode: pagador.shareCode,
				loginEmail: login?.loginEmail ?? pagador.email,
				loginUserName: login?.loginUserName ?? null,
				familyAccessActive: login?.familyAccessActive ?? false,
			};
		})
		.sort((a, b) => {
			if (a.role === PAYER_ROLE_ADMIN && b.role !== PAYER_ROLE_ADMIN) return -1;
			if (a.role !== PAYER_ROLE_ADMIN && b.role === PAYER_ROLE_ADMIN) return 1;
			return 0;
		});

	return { payers, avatarOptions };
}
