"use client";

import {
	RiCheckLine,
	RiFileCopyLine,
	RiHistoryLine,
	RiLogoutCircleLine,
	RiMegaphoneLine,
	RiMessageLine,
	RiPencilLine,
	RiSettings2Line,
} from "@remixicon/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PayerDialog } from "@/features/payers/components/payer-dialog";
import type { Payer } from "@/features/payers/components/types";
import { version } from "@/package.json";
import { FeedbackDialogBody } from "@/shared/components/navigation/navbar/feedback-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogTrigger } from "@/shared/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Spinner } from "@/shared/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { signOut } from "@/shared/lib/auth/client";
import { getAvatarSrc } from "@/shared/lib/payers/utils";
import type { UpdateCheckResult } from "@/shared/lib/version/check-update";
import { cn } from "@/shared/utils/ui";

const itemClass = "flex w-full items-center gap-2 text-foreground";

const menuItemClass =
	"cursor-pointer px-2 py-1.5 focus:bg-accent data-[variant=destructive]:focus:bg-destructive/10";

type NavbarUserProps = {
	user: {
		id: string;
		name: string;
		email: string;
		image: string | null;
	};
	viewerAvatarUrl: string | null;
	profilePayer: Payer | null;
	avatarOptions: string[];
	updateCheck: UpdateCheckResult;
};

export function NavbarUser({
	user,
	viewerAvatarUrl,
	profilePayer,
	avatarOptions,
	updateCheck,
}: NavbarUserProps) {
	const router = useRouter();
	const [menuOpen, setMenuOpen] = useState(false);
	const [profileOpen, setProfileOpen] = useState(false);
	const [logoutLoading, setLogoutLoading] = useState(false);
	const [feedbackOpen, setFeedbackOpen] = useState(false);
	const [copied, setCopied] = useState(false);

	const canEditProfile = Boolean(profilePayer?.canEdit);

	function handleCopyId(event: React.MouseEvent) {
		event.stopPropagation();
		navigator.clipboard.writeText(user.id);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	function openProfileEditor() {
		if (!canEditProfile) return;
		setMenuOpen(false);
		setProfileOpen(true);
	}

	const avatarSrc = viewerAvatarUrl
		? getAvatarSrc(viewerAvatarUrl)
		: user.image || getAvatarSrc(null);
	const isDataUrl = avatarSrc.startsWith("data:");

	async function handleLogout() {
		setLogoutLoading(true);
		await signOut();
		setLogoutLoading(false);
		router.push("/");
	}

	return (
		<Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<div className="relative">
					<DropdownMenuTrigger asChild>
						<button
							className="flex size-9 items-center justify-center overflow-hidden rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:outline-none"
							aria-label="Menu do usuário"
						>
							<div className="relative size-10 overflow-hidden rounded-full">
								<Image
									src={avatarSrc}
									unoptimized={isDataUrl}
									alt={`Avatar de ${user.name}`}
									fill
									sizes="40px"
									className="object-cover"
								/>
							</div>
						</button>
					</DropdownMenuTrigger>
					{updateCheck.hasUpdate && (
						<span className="pointer-events-none absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-success" />
					)}
				</div>
				<DropdownMenuContent
					align="end"
					className="w-60 border-border/60 p-2 shadow-none"
					sideOffset={10}
				>
					<div className="px-2 py-1">
						<div
							className={cn(
								"flex items-center gap-1 rounded-sm px-2 py-2 transition-colors",
								canEditProfile && "hover:bg-accent",
							)}
						>
							<button
								type="button"
								onClick={openProfileEditor}
								disabled={!canEditProfile}
								className={cn(
									"flex min-w-0 flex-1 items-center gap-3 text-left",
									canEditProfile
										? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
										: "cursor-default opacity-80",
								)}
								aria-label={
									canEditProfile
										? "Editar perfil da pessoa"
										: "Perfil da pessoa indisponível para edição"
								}
							>
								<div className="relative size-9 shrink-0 overflow-hidden rounded-full">
									<Image
										src={avatarSrc}
										unoptimized={isDataUrl}
										alt={user.name}
										fill
										sizes="36px"
										className="object-cover"
									/>
								</div>
								<div className="flex min-w-0 flex-1 flex-col">
									<div className="flex min-w-0 items-center gap-1">
										<span className="truncate text-sm font-medium">
											{user.name}
										</span>
									</div>
									<span className="truncate text-xs text-muted-foreground">
										{user.email}
									</span>
								</div>
								{canEditProfile ? (
									<RiPencilLine className="size-4 shrink-0 text-muted-foreground" />
								) : null}
							</button>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={handleCopyId}
										className="shrink-0 rounded-sm p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-muted-foreground"
										aria-label="Copiar ID do usuário"
									>
										{copied ? (
											<RiCheckLine className="size-3 text-success" />
										) : (
											<RiFileCopyLine className="size-3" />
										)}
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									{copied ? "Copiado!" : "Copiar ID do usuário"}
								</TooltipContent>
							</Tooltip>
						</div>
					</div>

					<DropdownMenuSeparator />

					<div className="flex flex-col gap-0.5 py-1">
						<DropdownMenuItem asChild className={menuItemClass}>
							<Link href="/settings" className={itemClass}>
								<RiSettings2Line className="size-4 shrink-0 text-muted-foreground" />
								Configurações
							</Link>
						</DropdownMenuItem>

						<DropdownMenuItem asChild className={menuItemClass}>
							<Link href="/changelog" className={itemClass}>
								<RiHistoryLine className="size-4 shrink-0 text-muted-foreground" />
								<span className="flex-1">Changelog</span>
								<Badge variant="outline" className="text-xs font-semibold">
									v{version}
								</Badge>
							</Link>
						</DropdownMenuItem>

						<DropdownMenuItem asChild className={menuItemClass}>
							<DialogTrigger asChild>
								<button type="button" className={itemClass}>
									<RiMessageLine className="size-4 shrink-0 text-muted-foreground" />
									Enviar Feedback
								</button>
							</DialogTrigger>
						</DropdownMenuItem>

						{updateCheck.hasUpdate && (
							<DropdownMenuItem asChild className={menuItemClass}>
								<Link
									href={updateCheck.releaseUrl}
									target="_blank"
									rel="noopener noreferrer"
									className={cn(itemClass, "text-success")}
								>
									<RiMegaphoneLine className="size-4 shrink-0 text-success" />
									<span className="flex-1 text-xs font-bold tracking-wide">
										Versão {updateCheck.latestVersion} disponível
									</span>
								</Link>
							</DropdownMenuItem>
						)}
					</div>

					<DropdownMenuSeparator />

					<div className="py-1">
						<DropdownMenuItem
							variant="destructive"
							disabled={logoutLoading}
							className={cn(menuItemClass, "disabled:opacity-60")}
							onSelect={(event) => {
								event.preventDefault();
								void handleLogout();
							}}
						>
							{logoutLoading ? (
								<Spinner className="size-4 shrink-0" />
							) : (
								<RiLogoutCircleLine className="size-4 shrink-0" />
							)}
							{logoutLoading ? "Saindo..." : "Sair"}
						</DropdownMenuItem>
					</div>
				</DropdownMenuContent>
			</DropdownMenu>

			{profilePayer ? (
				<PayerDialog
					mode="update"
					payer={profilePayer}
					avatarOptions={avatarOptions}
					open={profileOpen}
					onOpenChange={setProfileOpen}
				/>
			) : null}

			<FeedbackDialogBody onClose={() => setFeedbackOpen(false)} />
		</Dialog>
	);
}
