"use client";

import { RiMore2Line, RiPencilLine } from "@remixicon/react";
import { useState } from "react";
import { AccountDialog } from "@/features/accounts/components/account-dialog";
import type { Account } from "@/features/accounts/components/types";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

type AccountStatementCardMenuProps = {
	account: Account;
	logoOptions: string[];
};

export function AccountStatementCardMenu({
	account,
	logoOptions,
}: AccountStatementCardMenuProps) {
	const [editOpen, setEditOpen] = useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="text-muted-foreground hover:text-foreground"
						aria-label="Ações da conta"
					>
						<RiMore2Line className="size-4" aria-hidden />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => setEditOpen(true)}>
						<RiPencilLine className="size-4" aria-hidden />
						Editar conta
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AccountDialog
				mode="update"
				account={account}
				logoOptions={logoOptions}
				open={editOpen}
				onOpenChange={setEditOpen}
			/>
		</>
	);
}
