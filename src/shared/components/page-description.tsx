export default function PageDescription({
	title,
	subtitle,
	icon,
	actions,
}: {
	title?: string;
	subtitle?: string;
	icon?: React.ReactNode;
	actions?: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<h1 className="text-2xl font-semibold flex items-center gap-1">
					<span className="text-primary">{icon}</span>
					{title}
				</h1>
				{actions ? (
					<div className="w-full sm:w-auto sm:max-w-md">{actions}</div>
				) : null}
			</div>
			{subtitle ? (
				<p className="text-sm max-w-2xl text-muted-foreground leading-relaxed">
					{subtitle}
				</p>
			) : null}
		</div>
	);
}
