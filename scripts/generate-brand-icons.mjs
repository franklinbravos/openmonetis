#!/usr/bin/env node
/**
 * Gera ícones PWA, favicon e OG a partir de public/images/logo-mark.svg.
 * Uso: pnpm run icons:generate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const COLORS = {
	primary: "#3556B1",
	orbit: "#5C6370",
	appBackground: "#000000",
	tabBackground: "#FAFCFE",
	ogText: "#FAFCFE",
};

const markSvg = readFileSync(join(root, "public/images/logo-mark.svg"), "utf8");
const markInner = markSvg.replace(/<svg[^>]*>|<\/svg>/g, "").trim();

async function renderMarkPng(
	size,
	{ background = null, paddingRatio = 0.2, svg = markSvg } = {},
) {
	const inner = Math.round(size * (1 - paddingRatio * 2));
	const padding = Math.round((size - inner) / 2);
	const mark = await sharp(Buffer.from(svg)).resize(inner, inner).png().toBuffer();

	if (!background) {
		return sharp(mark).png().toBuffer();
	}

	return sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background,
		},
	})
		.composite([{ input: mark, left: padding, top: padding }])
		.png()
		.toBuffer();
}

function tabIconSvg() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="OpenMonetis">
  <rect width="32" height="32" rx="6" fill="${COLORS.tabBackground}"/>
  <svg x="2.5" y="2.5" width="27" height="27" viewBox="0 0 48 48" fill="none">
    ${markInner}
  </svg>
</svg>`;
}

function ogImageSvg() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="OpenMonetis">
  <rect width="1200" height="630" fill="${COLORS.appBackground}"/>
  <svg x="552" y="168" width="96" height="96" viewBox="0 0 48 48" fill="none">
    ${markInner}
  </svg>
  <text
    x="600"
    y="430"
    text-anchor="middle"
    fill="${COLORS.ogText}"
    font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
    font-size="52"
    font-weight="600"
    letter-spacing="-0.02em"
  >OpenMonetis</text>
  <text
    x="600"
    y="490"
    text-anchor="middle"
    fill="${COLORS.orbit}"
    font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
    font-size="24"
    font-weight="400"
  >Suas finanças, do seu jeito</text>
</svg>`;
}

async function writePng(path, buffer) {
	writeFileSync(path, buffer);
	console.log(`wrote ${path}`);
}

async function main() {
	const publicImages = join(root, "public/images");
	const appDir = join(root, "src/app");
	const appBackground = {
		r: 0,
		g: 0,
		b: 0,
		alpha: 1,
	};
	const tabBackground = {
		r: 250,
		g: 252,
		b: 254,
		alpha: 1,
	};

	const appIcon180 = await renderMarkPng(180, {
		background: appBackground,
		paddingRatio: 0.2,
	});
	const appIcon192 = await renderMarkPng(192, {
		background: appBackground,
		paddingRatio: 0.2,
	});
	const appIcon512 = await renderMarkPng(512, {
		background: appBackground,
		paddingRatio: 0.2,
	});
	const maskable512 = await renderMarkPng(512, {
		background: appBackground,
		paddingRatio: 0.28,
	});

	await writePng(join(publicImages, "web-app-manifest-192x192.png"), appIcon192);
	await writePng(join(publicImages, "web-app-manifest-512x512.png"), appIcon512);
	await writePng(join(publicImages, "icon-maskable-512.png"), maskable512);

	await writePng(join(appDir, "apple-icon.png"), appIcon180);
	await writePng(join(appDir, "icon1.png"), appIcon180);

	const favicon32 = await renderMarkPng(32, {
		background: tabBackground,
		paddingRatio: 0.14,
	});
	const favicon16 = await renderMarkPng(16, {
		background: tabBackground,
		paddingRatio: 0.12,
	});
	const favicon48 = await renderMarkPng(48, {
		background: tabBackground,
		paddingRatio: 0.16,
	});

	const ico = await toIco([favicon16, favicon32, favicon48]);
	writeFileSync(join(appDir, "favicon.ico"), ico);
	console.log(`wrote ${join(appDir, "favicon.ico")}`);

	writeFileSync(join(appDir, "icon.svg"), tabIconSvg());
	console.log(`wrote ${join(appDir, "icon.svg")}`);

	const ogImage = await sharp(Buffer.from(ogImageSvg())).png().toBuffer();
	await writePng(join(publicImages, "og-image.png"), ogImage);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
