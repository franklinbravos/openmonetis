import type { PayerStatus } from "@/shared/lib/payers/constants";

export type Payer = {
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
	sharedByName?: string | null;
	sharedByEmail?: string | null;
	shareId?: string | null;
	shareCode?: string | null;
	loginEmail?: string | null;
	loginUserName?: string | null;
	familyAccessActive?: boolean;
};

export type PayerFormValues = {
	name: string;
	email: string;
	status: PayerStatus;
	avatarUrl: string;
	note: string;
	isAutoSend: boolean;
};
