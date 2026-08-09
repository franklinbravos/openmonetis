import * as RemixIcons from "@remixicon/react";
import type { ComponentType, ReactNode } from "react";

const ICON_CLASS = "h-4 w-4";

const normalizeKey = (value: string) =>
	value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");

const ICON_ALIASES: Record<string, string> = {
	RiBabyCarriageLine: "RiEmotionHappyLine",
	RiMonitorLine: "RiTv2Line",
	RiLinkLine: "RiLinksLine",
	RiCloudDownloadLine: "RiDownloadCloudLine",
	RiCloudUploadLine: "RiUploadCloudLine",
};

export function resolveIconName(iconName: string): string {
	return ICON_ALIASES[iconName] ?? iconName;
}

let remixLineIconNamesCache: string[] | null = null;

export function getAllRemixLineIconNames(): string[] {
	if (!remixLineIconNamesCache) {
		remixLineIconNamesCache = Object.keys(RemixIcons)
			.filter((name) => name.startsWith("Ri") && name.endsWith("Line"))
			.sort((a, b) => a.localeCompare(b, "pt-BR"));
	}

	return remixLineIconNamesCache;
}

export function formatRemixIconLabel(iconName: string): string {
	return iconName
		.replace(/^Ri/, "")
		.replace(/Line$/, "")
		.replace(/(\d+)/g, " $1 ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.trim();
}

export const getIconComponent = (
	iconName: string,
): ComponentType<{ className?: string }> | null => {
	const resolvedName = resolveIconName(iconName);
	// Busca o ícone no objeto de ícones do Remix Icon
	const icon = (RemixIcons as Record<string, unknown>)[resolvedName];

	if (icon && typeof icon === "function") {
		return icon as ComponentType<{ className?: string }>;
	}

	return null;
};

export const getConditionIcon = (condition: string): ReactNode => {
	const key = normalizeKey(condition);

	const registry: Record<string, ReactNode> = {
		parcelado: <RemixIcons.RiNumbersLine className={ICON_CLASS} aria-hidden />,
		recorrente: <RemixIcons.RiRefreshLine className={ICON_CLASS} aria-hidden />,
		avista: <RemixIcons.RiCheckLine className={ICON_CLASS} aria-hidden />,
		vista: <RemixIcons.RiCheckLine className={ICON_CLASS} aria-hidden />,
	};

	return registry[key] ?? null;
};

export const getAccountTypeIcon = (accountType: string): ReactNode => {
	const key = normalizeKey(accountType);

	const registry: Record<string, ReactNode> = {
		contacorrente: <RemixIcons.RiBankLine className={ICON_CLASS} aria-hidden />,
		contapoupanca: (
			<RemixIcons.RiSafe2Line className={ICON_CLASS} aria-hidden />
		),
		carteiradigital: (
			<RemixIcons.RiWalletLine className={ICON_CLASS} aria-hidden />
		),
		containvestimento: (
			<RemixIcons.RiFundsLine className={ICON_CLASS} aria-hidden />
		),
		prepagovrva: <RemixIcons.RiCouponLine className={ICON_CLASS} aria-hidden />,
		dinheiro: <RemixIcons.RiCashLine className={ICON_CLASS} aria-hidden />,
		outros: <RemixIcons.RiMoreFill className={ICON_CLASS} aria-hidden />,
	};

	return (
		registry[key] ?? (
			<RemixIcons.RiBankLine className={ICON_CLASS} aria-hidden />
		)
	);
};

export const getPaymentMethodIcon = (paymentMethod: string): ReactNode => {
	const key = normalizeKey(paymentMethod);

	const registry: Record<string, ReactNode> = {
		dinheiro: <RemixIcons.RiCashLine className={ICON_CLASS} aria-hidden />,
		pix: <RemixIcons.RiPixLine className={ICON_CLASS} aria-hidden />,
		boleto: <RemixIcons.RiBarcodeLine className={ICON_CLASS} aria-hidden />,
		credito: (
			<RemixIcons.RiMoneyDollarCircleLine className={ICON_CLASS} aria-hidden />
		),
		cartaodecredito: (
			<RemixIcons.RiBankCard2Line className={ICON_CLASS} aria-hidden />
		),
		cartaodedebito: (
			<RemixIcons.RiBankCard2Line className={ICON_CLASS} aria-hidden />
		),
		debito: <RemixIcons.RiBankCard2Line className={ICON_CLASS} aria-hidden />,
		prepagovrva: <RemixIcons.RiCouponLine className={ICON_CLASS} aria-hidden />,
		transferenciabancaria: (
			<RemixIcons.RiExchangeLine className={ICON_CLASS} aria-hidden />
		),
	};

	return registry[key] ?? null;
};
