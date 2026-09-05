import { NextResponse } from "next/server";
import {
	archiveDashboardNotificationAction,
	markDashboardNotificationAsReadAction,
	markDashboardNotificationAsUnreadAction,
	unarchiveDashboardNotificationAction,
} from "@/features/dashboard/notifications/notifications-actions";
import { requireAuthSession } from "@/shared/lib/actions/action-route-handler";

const notificationHandlers = {
	read: markDashboardNotificationAsReadAction,
	unread: markDashboardNotificationAsUnreadAction,
	archive: archiveDashboardNotificationAction,
	unarchive: unarchiveDashboardNotificationAction,
} as const;

export async function POST(request: Request) {
	const { unauthorized } = await requireAuthSession();
	if (unauthorized) return unauthorized;

	const body = (await request.json()) as {
		action?: keyof typeof notificationHandlers;
		notificationKey?: string;
		fingerprint?: string;
	};

	const handler = body.action ? notificationHandlers[body.action] : undefined;
	if (!handler || !body.notificationKey || !body.fingerprint) {
		return NextResponse.json(
			{ success: false, error: "Operação inválida." },
			{ status: 400 },
		);
	}

	const result = await handler({
		notificationKey: body.notificationKey,
		fingerprint: body.fingerprint,
	});

	return NextResponse.json(result, {
		status: result.success ? 200 : 400,
	});
}
