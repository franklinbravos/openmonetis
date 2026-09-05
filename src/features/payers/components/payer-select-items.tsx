"use client";

import StatusDot from "@/shared/components/feedback/status-dot";

export function StatusSelectContent({ label }: { label: string }) {
	const isActive = label === "Ativo";

	return (
		<span className="flex items-center gap-2">
			<StatusDot
				color={isActive ? "bg-success" : "bg-muted-foreground"}
			/>
			<span>{label}</span>
		</span>
	);
}
