"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { AuthCardShell } from "@/features/auth/components/auth-card-shell";
import { AuthHeader } from "@/features/auth/components/auth-header";
import {
	acceptPayerInviteClient,
	getPayerInvitePreviewClient,
} from "@/features/payers/lib/payers-api-client";
import { Button } from "@/shared/components/ui/button";
import {
	PAYER_SHARE_PERMISSION_LABELS,
	type PayerSharePermission,
	resolvePayerSharePermission,
} from "@/shared/lib/payers/constants";

type InvitePreview = {
	payerName: string;
	email: string;
	permission: PayerSharePermission;
	expired: boolean;
};

async function fetchSession() {
	const response = await fetch("/api/auth/get-session", {
		credentials: "include",
	});
	if (!response.ok) return null;
	const data = (await response.json()) as { user?: { email?: string } };
	return data.user ?? null;
}

export default function InvitePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const token = searchParams.get("token") ?? "";
	const [preview, setPreview] = useState<InvitePreview | null>(null);
	const [error, setError] = useState("");
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [pending, startTransition] = useTransition();

	useEffect(() => {
		if (!token) {
			setError("Convite inválido.");
			return;
		}

		startTransition(async () => {
			const result = await getPayerInvitePreviewClient({ token });
			if (!result.success) {
				setError(result.error);
				return;
			}

			if (result.expired) {
				setError("Este convite expirou.");
				return;
			}

			setPreview({
				payerName: result.payerName,
				email: result.email,
				permission: result.permission,
				expired: result.expired,
			});
		});

		fetchSession().then((user) => setIsAuthenticated(Boolean(user)));
	}, [token]);

	const handleAccept = () => {
		startTransition(async () => {
			const result = await acceptPayerInviteClient({ token });
			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			router.replace("/payers");
		});
	};

	const permissionLabel = preview
		? PAYER_SHARE_PERMISSION_LABELS[
				resolvePayerSharePermission(preview.permission)
			]
		: "";

	return (
		<AuthCardShell>
			<AuthHeader
				title="Convite de acesso"
				description="Aceite o convite para visualizar os dados compartilhados."
			/>

			{error ? (
				<p className="text-sm text-destructive">{error}</p>
			) : preview ? (
				<div className="space-y-4 text-sm">
					<p>
						Você foi convidado para acessar <strong>{preview.payerName}</strong>{" "}
						com permissão de <strong>{permissionLabel}</strong>.
					</p>
					<p className="text-muted-foreground">
						Use o e-mail <strong>{preview.email}</strong> para entrar.
					</p>

					{isAuthenticated ? (
						<Button type="button" onClick={handleAccept} disabled={pending}>
							{pending ? "Aceitando..." : "Aceitar convite"}
						</Button>
					) : (
						<div className="flex flex-col gap-2">
							<Button type="button" asChild>
								<Link
									href={`/?callbackUrl=/invite?token=${encodeURIComponent(token)}`}
								>
									Entrar para aceitar
								</Link>
							</Button>
							<Button type="button" variant="outline" asChild>
								<Link
									href={`/signup?callbackUrl=/invite?token=${encodeURIComponent(token)}`}
								>
									Criar conta e aceitar
								</Link>
							</Button>
						</div>
					)}
				</div>
			) : (
				<p className="text-sm text-muted-foreground">Carregando convite...</p>
			)}
		</AuthCardShell>
	);
}
