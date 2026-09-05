"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { completeRequiredPasswordChangeClient } from "@/features/settings/lib/settings-api-client";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

export default function ChangePasswordRequiredPage() {
	const router = useRouter();
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [pending, startTransition] = useTransition();

	const handleSubmit = () => {
		startTransition(async () => {
			const result = await completeRequiredPasswordChangeClient({
				newPassword: password,
				confirmPassword,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			router.replace("/dashboard");
			router.refresh();
		});
	};

	return (
		<div className="flex min-h-[60vh] items-center justify-center p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Troca de senha obrigatória</CardTitle>
					<CardDescription>
						Por segurança, defina uma nova senha antes de continuar.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="new-password">Nova senha</Label>
						<Input
							id="new-password"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="confirm-password">Confirmar senha</Label>
						<Input
							id="confirm-password"
							type="password"
							value={confirmPassword}
							onChange={(event) => setConfirmPassword(event.target.value)}
						/>
					</div>
					<Button
						type="button"
						className="w-full"
						onClick={handleSubmit}
						disabled={pending || !password || !confirmPassword}
					>
						{pending ? "Salvando..." : "Salvar nova senha"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
