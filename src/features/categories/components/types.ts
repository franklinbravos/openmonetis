import type { CategoryType } from "@/shared/lib/categories/constants";

export type Category = {
	id: string;
	name: string;
	type: CategoryType;
	icon: string | null;
	parentId: string | null;
};

export type CategoryFormValues = {
	name: string;
	type: CategoryType;
	icon: string;
	parentId: string;
};
