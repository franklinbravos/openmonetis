import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/login-form";
import { isSignupDisabled } from "@/shared/lib/auth/signup";

export const metadata: Metadata = {
	title: "Entrar",
	description: "Acesse sua conta OpenMonetis.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function Page() {
	return <LoginForm signupDisabled={isSignupDisabled()} />;
}
