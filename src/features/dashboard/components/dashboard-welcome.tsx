import {
	formatCurrentDate,
	getGreeting,
} from "@/features/dashboard/widget-registry/welcome-widget";

type DashboardWelcomeProps = {
	name?: string | null;
};

export function DashboardWelcome({ name }: DashboardWelcomeProps) {
	const displayName = name && name.trim().length > 0 ? name : "Administrador";
	const formattedDate = formatCurrentDate();
	const greeting = getGreeting();

	return (
		<section className="py-1 sm:py-4">
			<h1 className="flex min-w-0 items-baseline justify-between gap-3 text-sm leading-tight tracking-tight sm:justify-start sm:gap-x-1.5 sm:text-xl">
				<span className="min-w-0 truncate">
					<span className="text-muted-foreground">{greeting},</span>{" "}
					<span className="font-signature text-lg font-semibold leading-none tracking-wide sm:text-2xl">
						{displayName}
					</span>
				</span>
				<span
					className="shrink-0 text-right text-xs text-muted-foreground sm:text-left sm:text-sm"
					aria-label={`Data atual: ${formattedDate}`}
				>
					<span
						className="hidden text-muted-foreground/40 sm:inline"
						aria-hidden
					>
						·{" "}
					</span>
					{formattedDate}
				</span>
			</h1>
		</section>
	);
}
