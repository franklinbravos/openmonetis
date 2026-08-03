"use client";

import { RiDeleteBin5Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deletePayerShareAction,
	regeneratePayerShareCodeAction,
} from "@/features/payers/actions";
import { updatePayerSharePermissionAction } from "@/features/payers/actions/share-access";
import { PayerAccessForm } from "@/features/payers/components/details/payer-access-form";
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
	shareCode: string;
	payerEmail?: string | null;
	shares: PayerShare[];
}

export function PayerSharingCard({
	payerId,
	shareCode,
	payerEmail,
	shares,
}: PayerSharingCardProps) {
	const router = useRouter();
	const [currentCode, setCurrentCode] = useState(shareCode);
	const [regeneratePending, startRegenerate] = useTransition();
	const [removePendingId, setRemovePendingId] = useState<string | null>(null);
	const [permissionPendingId, setPermissionPendingId] = useState<string | null>(
		null,
	);

	const handleCopyCode = async () => {
		try {
			await navigator.clipboard.writeText(currentCode);
			toast.success("Código copiado para a área de transferência.");
		} catch {
			toast.error("Não foi possível copiar o código.");
		}
	};

	const handleRegenerate = () => {
		startRegenerate(async () => {
			const result = await regeneratePayerShareCodeAction({ payerId });

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			if ("code" in result) setCurrentCode(result.code);
			toast.success("Novo código gerado com sucesso.");
			router.refresh();
		});
	};

	const handleRemove = (shareId: string) => {
		setRemovePendingId(shareId);
		startRegenerate(async () => {
			const result = await deletePayerShareAction({ shareId });

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
		startRegenerate(async () => {
			const result = await updatePayerSharePermissionAction({
				shareId,
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
				<CardTitle className="text-lg font-semibold">
					Compartilhamentos
				</CardTitle>
				<p className="text-sm text-muted-foreground">
					Gere acesso de usuário com permissões ou compartilhe o código para
					entrada manual na página de pessoas.
				</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<PayerAccessForm
					payerId={payerId}
					defaultEmail={payerEmail}
					onSuccess={() => router.refresh()}
				/>

				<div className="flex flex-col gap-2 rounded-lg border border-dashed p-4 text-sm">
					<span className="text-xs font-medium uppercase text-muted-foreground/80">
						Código de compartilhamento manual
					</span>
					<div className="flex flex-wrap items-center gap-2">
						<code className="rounded bg-muted px-2 py-1 text-xs font-mono">
							{currentCode}
						</code>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={handleCopyCode}
						>
							Copiar
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={handleRegenerate}
							disabled={regeneratePending}
						>
							{regeneratePending ? "Gerando..." : "Gerar novo código"}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						O código manual concede acesso somente leitura via &quot;Adicionar
						por código&quot;.
					</p>
				</div>

				{shares.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nenhum usuário com acesso ativo.
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
