import { Suspense } from "react";
import InvitePage from "./invite-client";

export default function Page() {
	return (
		<Suspense
			fallback={<div className="p-6 text-sm">Carregando convite...</div>}
		>
			<InvitePage />
		</Suspense>
	);
}
