export const metadata = {
	title: "Cartões",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <section className="space-y-6">{children}</section>;
}
