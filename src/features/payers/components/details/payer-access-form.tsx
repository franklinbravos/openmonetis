"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPayerAccessAction } from "@/features/payers/actions/share-access";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
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

type AccessType = "magic_link" | "credentials";

interface PayerAccessFormProps {
	payerId: string;
	defaultEmail?: string | null;
	onSuccess?: () => void;
}

export function PayerAccessForm({
	payerId,
	defaultEmail,
	onSuccess,
}: PayerAccessFormProps) {
	const [accessType, setAccessType] = useState<AccessType>("magic_link");
	const [email, setEmail] = useState(defaultEmail ?? "");
	const [permission, setPermission] = useState<PayerSharePermission>("read");
	const [password, setPassword] = useState("");
	const [mustChangePassword, setMustChangePassword] = useState(true);
	const [generatedLink, setGeneratedLink] = useState<string | null>(null);
	const [generatedPassword, setGeneratedPassword] = useState<string | null>(
		null,
	);
	const [pending, startTransition] = useTransition();

	const handleSubmit = () => {
		startTransition(async () => {
			setGeneratedLink(null);
			setGeneratedPassword(null);

			const result =
				accessType === "magic_link"
					? await createPayerAccessAction({
							payerId,
							email,
							permission,
							accessType: "magic_link",
						})
					: await createPayerAccessAction({
							payerId,
							email,
							permission,
							accessType: "credentials",
							password: password.trim() || undefined,
							mustChangePassword,
						});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message);

			if ("inviteUrl" in result && result.inviteUrl) {
				setGeneratedLink(result.inviteUrl);
			}

			if ("temporaryPassword" in result && result.temporaryPassword) {
				setGeneratedPassword(result.temporaryPassword);
			}

			onSuccess?.();
		});
	};

	const copyToClipboard = async (value: string, label: string) => {
		try {
			await navigator.clipboard.writeText(value);
			toast.success(`${label} copiado.`);
		} catch {
			toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
		}
	};

	return (
		<div className="space-y-4 rounded-lg border border-dashed p-4">
			<div className="space-y-1">
				<h4 className="text-sm font-semibold">Gerar acesso de usuário</h4>
				<p className="text-xs text-muted-foreground">
					Crie um login para esta pessoa com a permissão desejada.
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="access-email">E-mail de acesso</Label>
					<Input
						id="access-email"
						type="email"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						placeholder="email@exemplo.com"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="access-permission">Permissão</Label>
					<Select
						value={permission}
						onValueChange={(value) =>
							setPermission(value as PayerSharePermission)
						}
					>
						<SelectTrigger id="access-permission" className="w-full">
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

			<div className="space-y-2">
				<Label htmlFor="access-type">Método de acesso</Label>
				<Select
					value={accessType}
					onValueChange={(value) => setAccessType(value as AccessType)}
				>
					<SelectTrigger id="access-type" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="magic_link">Link mágico de acesso</SelectItem>
						<SelectItem value="credentials">Usuário e senha</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{accessType === "credentials" ? (
				<div className="space-y-3">
					<div className="space-y-2">
						<Label htmlFor="access-password">Senha (opcional)</Label>
						<Input
							id="access-password"
							type="text"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							placeholder="Deixe em branco para gerar automaticamente"
						/>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="must-change-password"
							checked={mustChangePassword}
							onCheckedChange={(checked) =>
								setMustChangePassword(Boolean(checked))
							}
						/>
						<Label htmlFor="must-change-password" className="font-normal">
							Obrigar troca de senha no primeiro acesso
						</Label>
					</div>
				</div>
			) : null}

			<Button type="button" onClick={handleSubmit} disabled={pending || !email}>
				{pending ? "Gerando..." : "Gerar acesso"}
			</Button>

			{generatedLink ? (
				<div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
					<p className="font-medium">Link mágico gerado</p>
					<code className="block break-all text-xs">{generatedLink}</code>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => copyToClipboard(generatedLink, "Link")}
					>
						Copiar link
					</Button>
				</div>
			) : null}

			{generatedPassword ? (
				<div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
					<p className="font-medium">Senha temporária</p>
					<code className="block text-xs">{generatedPassword}</code>
					<p className="text-xs text-muted-foreground">
						Guarde esta senha agora. Ela não será exibida novamente.
					</p>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => copyToClipboard(generatedPassword, "Senha")}
					>
						Copiar senha
					</Button>
				</div>
			) : null}
		</div>
	);
}
