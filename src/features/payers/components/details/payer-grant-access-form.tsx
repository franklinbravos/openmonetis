"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { grantPayerAccessToExistingUserAction } from "@/features/payers/actions/share-access";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
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
} from "@/shared/lib/payers/constants";

interface PayerGrantAccessFormProps {
	payerId: string;
	onSuccess?: () => void;
}

export function PayerGrantAccessForm({
	payerId,
	onSuccess,
}: PayerGrantAccessFormProps) {
	const [email, setEmail] = useState("");
	const [permission, setPermission] = useState<PayerSharePermission>("edit");
	const [pending, startTransition] = useTransition();

	const handleSubmit = () => {
		startTransition(async () => {
			const result = await grantPayerAccessToExistingUserAction({
				payerId,
				email,
				permission,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			setEmail("");
			onSuccess?.();
		});
	};

	return (
		<div className="space-y-4 rounded-lg border border-dashed p-4">
			<div className="space-y-1">
				<h4 className="font-semibold text-sm">Conceder acesso familiar</h4>
				<p className="text-muted-foreground text-xs">
					Informe o e-mail de quem já tem conta no OpenMonetis. Todos
					compartilham os mesmos lançamentos, contas, categorias e cartões.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="grant-access-email">E-mail da conta</Label>
					<Input
						id="grant-access-email"
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="email@exemplo.com"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="grant-access-permission">Permissão</Label>
					<Select
						value={permission}
						onValueChange={(value) =>
							setPermission(value as PayerSharePermission)
						}
					>
						<SelectTrigger id="grant-access-permission" className="w-full">
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
				</div>
			</div>

			<Button type="button" onClick={handleSubmit} disabled={pending || !email}>
				{pending ? "Concedendo..." : "Conceder acesso"}
			</Button>
		</div>
	);
}
