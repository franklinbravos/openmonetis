"use client";

import { RiNotification2Line } from "@remixicon/react";
import { buttonVariants } from "@/shared/components/ui/button";
import { DropdownMenuTrigger } from "@/shared/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { cn } from "@/shared/utils/ui";

type NotificationBellTriggerProps = {
	open: boolean;
	hasAnySourceItems: boolean;
	hasUnreadNotifications: boolean;
	displayCount: string;
};

export function NotificationBellTrigger({
	open,
	hasAnySourceItems,
	hasUnreadNotifications,
	displayCount,
}: NotificationBellTriggerProps) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Notificações"
						aria-expanded={open}
						className={cn(
							buttonVariants({ variant: "ghost", size: "icon-sm" }),
							"group relative shadow-none transition-all duration-200",
							"text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
							"data-[state=open]:bg-accent data-[state=open]:text-foreground",
						)}
					>
						<RiNotification2Line
							className={cn(
								"size-4 transition-transform duration-200",
								open ? "scale-90" : "scale-100",
							)}
						/>
						{hasUnreadNotifications ? (
							<>
								<span
									aria-hidden
									className="absolute -right-1.5 -top-1.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs text-white"
								>
									{displayCount}
								</span>
								<span className="absolute -right-1.5 -top-1.5 size-5 animate-ping rounded-full bg-destructive/5 repeat-3" />
							</>
						) : null}
					</button>
				</DropdownMenuTrigger>
			</TooltipTrigger>
			<TooltipContent side="bottom" sideOffset={8}>
				Notificações
			</TooltipContent>
		</Tooltip>
	);
}
