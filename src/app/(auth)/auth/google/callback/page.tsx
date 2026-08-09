import { Suspense } from "react";
import { GoogleCallbackHandler } from "@/features/auth/components/google-callback-handler";

export default function GoogleCallbackPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
					Conectando com Google…
				</div>
			}
		>
			<GoogleCallbackHandler />
		</Suspense>
	);
}
