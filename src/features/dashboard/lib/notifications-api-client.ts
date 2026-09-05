import {
	fetchActionResult,
	jsonRequestBody,
} from "@/shared/lib/actions/action-api-client";

type NotificationStateInput = {
	notificationKey: string;
	fingerprint: string;
};

export async function markDashboardNotificationAsReadClient(
	input: NotificationStateInput,
) {
	return dashboardNotificationClient("read", input);
}

export async function markDashboardNotificationAsUnreadClient(
	input: NotificationStateInput,
) {
	return dashboardNotificationClient("unread", input);
}

export async function archiveDashboardNotificationClient(
	input: NotificationStateInput,
) {
	return dashboardNotificationClient("archive", input);
}

export async function unarchiveDashboardNotificationClient(
	input: NotificationStateInput,
) {
	return dashboardNotificationClient("unarchive", input);
}

async function dashboardNotificationClient(
	action: "read" | "unread" | "archive" | "unarchive",
	input: NotificationStateInput,
) {
	return fetchActionResult("/api/dashboard/notifications", {
		method: "POST",
		...jsonRequestBody({ action, ...input }),
	});
}
