"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import type { AiProviderSettingsView } from "@/shared/lib/ai/types";
import { AiModelConfiguration } from "./ai-model-configuration";

interface AiProvidersTabProps {
	settings: AiProviderSettingsView;
}

export function AiProvidersTab({ settings }: AiProvidersTabProps) {
	return (
		<div className="space-y-6">
			<AiModelConfiguration settings={settings} />

			<div className="flex justify-end">
				<Button type="button" variant="outline" asChild>
					<Link href="/insights">Ir para Insights</Link>
				</Button>
			</div>
		</div>
	);
}
