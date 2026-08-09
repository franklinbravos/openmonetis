export const metadata = {
	title: "Contas",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <section className="space-y-6">{children}</section>;
}
