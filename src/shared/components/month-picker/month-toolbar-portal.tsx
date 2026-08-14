"use client";

import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type MonthToolbarPortalProps = {
	container: HTMLElement | null;
	children: ReactNode;
};

export function MonthToolbarPortal({
	container,
	children,
}: MonthToolbarPortalProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted || !container?.isConnected) {
		return null;
	}

	return createPortal(children, container);
}
