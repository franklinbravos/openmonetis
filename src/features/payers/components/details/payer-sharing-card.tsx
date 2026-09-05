"use client";

import { RiDeleteBin5Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deletePayerShareClient,
	updatePayerSharePermissionClient,
} from "@/features/payers/lib/payers-api-client";
import { PayerGrantAccessForm } from "@/features/payers/components/details/payer-grant-access-form";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	PAYER_SHARE_PERMISSION_LABELS,
	PAYER_SHARE_PERMISSIONS,
	type PayerSharePermission,
	resolvePayerSharePermission,
} from "@/shared/lib/payers/constants";

type PayerShare = {
	id: string;
	userId: string;
	name: string;
	email: string;
	permission: string;
	createdAt: string;
};

interface PayerSharingCardProps {
	payerId: string;
	shares: PayerShare[];
}

export function PayerSharingCard({ payerId, shares }: PayerSharingCardProps) {
	const router = useRouter();
	const [removePendingId, setRemovePendingId] = useState<string | null>(null);
	const [permissionPendingId, setPermissionPendingId] = useState<string | null>(
		null,
	);
	const [, startTransition] = useTransition();

	const handleRemove = (shareId: string) => {
		setRemovePendingId(shareId);
		startTransition(async () => {
			const result = await deletePayerShareClient(shareId);

			if (!result.success) {
				toast.error(result.error);
				setRemovePendingId(null);
				return;
			}

			toast.success(result.message);
			setRemovePendingId(null);
			router.refresh();
		});
	};

	const handlePermissionChange = (
		shareId: string,
		permission: PayerSharePermission,
	) => {
		setPermissionPendingId(shareId);
		startTransition(async () => {
			const result = await updatePayerSharePermissionClient(shareId, {
				permission,
			});

			if (!result.success) {
				toast.error(result.error);
				setPermissionPendingId(null);
				return;
			}

			toast.success(result.message);
			setPermissionPendingId(null);
			router.refresh();
		});
	};

	return (
		<Card className="border">
			<CardHeader>
				<CardTitle className="font-semibold text-lg">
					Acessos familiares
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					Conceda permissão para contas já cadastradas. Cada membro entra com
					seu login e visualiza o mesmo ambiente financeiro.
				</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<PayerGrantAccessForm
					payerId={payerId}
					onSuccess={() => router.refresh()}
				/>

				{shares.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nenhum membro com acesso ativo.
					</p>
				) : (
					<ul className="space-y-3">
						{shares.map((share) => {
							const permission = resolvePayerSharePermission(share.permission);

							return (
								<li
									key={share.id}
									className="flex flex-col gap-3 rounded-lg border border-dashed p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
								>
									<div className="flex flex-col gap-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-medium text-foreground">
												{share.name}
											</span>
											<Badge variant="outline" className="text-xs">
												{PAYER_SHARE_PERMISSION_LABELS[permission]}
											</Badge>
										</div>
										<span className="text-muted-foreground">{share.email}</span>
									</div>

									<div className="flex items-center gap-2">
										<Select
											value={permission}
											onValueChange={(value) =>
												handlePermissionChange(
													share.id,
													value as PayerSharePermission,
												)
											}
											disabled={permissionPendingId === share.id}
										>
											<SelectTrigger className="w-[180px]">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{PAYER_SHARE_PERMISSIONS.map((item) => (
													<SelectItem key={item} value={item}>
														{PAYER_SHARE_PERMISSION_LABELS[item]}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											onClick={() => handleRemove(share.id)}
											disabled={removePendingId === share.id}
										>
											<RiDeleteBin5Line className="size-4" />
											<span className="sr-only">Remover acesso</span>
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
