import { connection } from "next/server";
import { InsightsPage } from "@/features/insights/components/insights-page";
import { DEFAULT_MODEL } from "@/features/insights/constants";
import MonthNavigation from "@/shared/components/month-picker/month-navigation";
import { fetchInstanceAiProviderSettings } from "@/shared/lib/ai/user-provider-config";
import { getUser } from "@/shared/lib/auth/server";
import { parsePeriodParam } from "@/shared/utils/period";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
	searchParams?: PageSearchParams;
};

const getSingleParam = (
	params: Record<string, string | string[] | undefined> | undefined,
	key: string,
) => {
	const value = params?.[key];
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
};

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const user = await getUser();
	const aiSettings = await fetchInstanceAiProviderSettings(user.id);
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const periodoParam = getSingleParam(resolvedSearchParams, "periodo");
	const { period: selectedPeriod } = parsePeriodParam(periodoParam);

	return (
		<main className="flex flex-col gap-6">
			<MonthNavigation />
			<InsightsPage
				period={selectedPeriod}
				defaultModelId={aiSettings.insightsDefaultModelId ?? DEFAULT_MODEL}
				providerSettings={aiSettings.view.providers}
			/>
		</main>
	);
}
