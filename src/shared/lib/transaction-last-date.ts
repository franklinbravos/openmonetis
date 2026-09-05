import { getTodayDateString } from "@/shared/utils/date";

const SESSION_STORAGE_KEY = "openmonetis-last-transaction-date";
const LEGACY_TRANSFER_STORAGE_KEY = "openmonetis-transfer-last-date";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isValidIsoDate(value: string | null | undefined): value is string {
	return Boolean(value && ISO_DATE_PATTERN.test(value));
}

export function readLastTransactionDate(): string {
	if (typeof window === "undefined") {
		return getTodayDateString();
	}

	const fromSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
	if (isValidIsoDate(fromSession)) {
		return fromSession;
	}

	const legacyTransferDate = localStorage.getItem(LEGACY_TRANSFER_STORAGE_KEY);
	if (isValidIsoDate(legacyTransferDate)) {
		sessionStorage.setItem(SESSION_STORAGE_KEY, legacyTransferDate);
		return legacyTransferDate;
	}

	return getTodayDateString();
}

export function writeLastTransactionDate(value: string): void {
	if (typeof window === "undefined" || !isValidIsoDate(value)) {
		return;
	}

	sessionStorage.setItem(SESSION_STORAGE_KEY, value);
}
