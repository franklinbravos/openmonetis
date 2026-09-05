#!/usr/bin/env node
/**
 * Gera ícones PWA e favicon a partir de public/images/logo-mark.svg.
 * Uso: pnpm run icons:generate
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const PRIMARY = { r: 53, g: 86, b: 177, alpha: 1 };
const BACKGROUND = { r: 250, g: 252, b: 254, alpha: 1 };

const markSvg = readFileSync(join(root, "public/images/logo-mark.svg"), "utf8");

function whiteMarkSvg() {
	return markSvg.replace('fill="currentColor"', 'fill="#FFFFFF"');
}

function primaryMarkSvg() {
	return markSvg.replace('fill="currentColor"', 'fill="#3556B1"');
}

async function renderMarkPng(size, { fill = "white", background = null, paddingRatio = 0.18 } = {}) {
	const svg = fill === "white" ? whiteMarkSvg() : primaryMarkSvg();
	const canvas = size;
	const inner = Math.round(canvas * (1 - paddingRatio * 2));
	const padding = Math.round((canvas - inner) / 2);

	const mark = await sharp(Buffer.from(svg)).resize(inner, inner).png().toBuffer();

	if (!background) {
		return sharp(mark).png().toBuffer();
	}

	return sharp({
		create: {
			width: canvas,
			height: canvas,
			channels: 4,
			background,
		},
	})
		.composite([{ input: mark, left: padding, top: padding }])
		.png()
		.toBuffer();
}

async function writePng(path, buffer) {
	writeFileSync(path, buffer);
	console.log(`wrote ${path}`);
}

async function main() {
	const publicImages = join(root, "public/images");
	const appDir = join(root, "src/app");

	const appIcon180 = await renderMarkPng(180, {
		fill: "white",
		background: PRIMARY,
		paddingRatio: 0.2,
	});
	const appIcon192 = await renderMarkPng(192, {
		fill: "white",
		background: PRIMARY,
		paddingRatio: 0.2,
	});
	const appIcon512 = await renderMarkPng(512, {
		fill: "white",
		background: PRIMARY,
		paddingRatio: 0.2,
	});
	const maskable512 = await renderMarkPng(512, {
		fill: "white",
		background: PRIMARY,
		paddingRatio: 0.28,
	});

	await writePng(join(publicImages, "web-app-manifest-192x192.png"), appIcon192);
	await writePng(join(publicImages, "web-app-manifest-512x512.png"), appIcon512);
	await writePng(join(publicImages, "icon-maskable-512.png"), maskable512);

	await writePng(join(appDir, "apple-icon.png"), appIcon180);
	await writePng(join(appDir, "icon1.png"), appIcon180);

	const favicon32 = await renderMarkPng(32, {
		fill: "primary",
		background: BACKGROUND,
		paddingRatio: 0.14,
	});
	const favicon16 = await renderMarkPng(16, {
		fill: "primary",
		background: BACKGROUND,
		paddingRatio: 0.12,
	});
	const favicon48 = await renderMarkPng(48, {
		fill: "primary",
		background: BACKGROUND,
		paddingRatio: 0.16,
	});

	const ico = await toIco([favicon16, favicon32, favicon48]);
	writeFileSync(join(appDir, "favicon.ico"), ico);
	console.log(`wrote ${join(appDir, "favicon.ico")}`);

	const tabIconSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="OpenMonetis">
  <rect width="32" height="32" rx="6" fill="#FAFCFE"/>
  <g transform="translate(4 4)" fill="#3556B1">
    ${markSvg.replace(/<svg[^>]*>|<\/svg>/g, "").replace(/fill="currentColor"/g, "")}
  </g>
</svg>`;
	writeFileSync(join(appDir, "icon.svg"), tabIconSvg);
	console.log(`wrote ${join(appDir, "icon.svg")}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
