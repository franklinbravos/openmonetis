"use client";

import { useEffect } from "react";

const RELOAD_KEY = "openmonetis:chunk-reload";

function isChunkLoadMessage(message: string): boolean {
	return (
		message.includes("Failed to load chunk") || message.includes("ChunkLoadError")
	);
}

function reloadOnceForStaleChunk(): void {
	if (sessionStorage.getItem(RELOAD_KEY) === "1") {
		return;
	}

	sessionStorage.setItem(RELOAD_KEY, "1");
	const url = new URL(window.location.href);
	url.searchParams.set("_chunk", String(Date.now()));
	window.location.replace(url.toString());
}

function scheduleReloadFlagReset(): void {
	window.setTimeout(() => {
		sessionStorage.removeItem(RELOAD_KEY);
	}, 10_000);
}

/** Script síncrono: captura ChunkLoadError antes do React montar. */
export const chunkLoadRecoveryScript = `(function(){var k=${JSON.stringify(RELOAD_KEY)};function isChunk(v){var m="";if(v&&v.message)m=String(v.message);else if(v&&v.reason&&v.reason.message)m=String(v.reason.message);else if(v&&v.reason)m=String(v.reason);else if(typeof v==="string")m=v;return m.indexOf("Failed to load chunk")!==-1||m.indexOf("ChunkLoadError")!==-1;}function reload(){if(sessionStorage.getItem(k)==="1")return;sessionStorage.setItem(k,"1");var u=new URL(window.location.href);u.searchParams.set("_chunk",String(Date.now()));window.location.replace(u.toString());}window.addEventListener("error",function(e){if(isChunk(e.error||e.message))reload();});window.addEventListener("unhandledrejection",function(e){if(isChunk(e.reason))reload();});window.addEventListener("load",function(){setTimeout(function(){sessionStorage.removeItem(k);},10000);});})();`;

/** Fallback client-side depois da hidratação. */
export function ChunkLoadRecovery() {
	useEffect(() => {
		const onError = (event: ErrorEvent) => {
			const message = String(event.error?.message ?? event.message ?? "");
			if (!isChunkLoadMessage(message)) return;
			reloadOnceForStaleChunk();
		};

		const onRejection = (event: PromiseRejectionEvent) => {
			const reason = event.reason;
			const message =
				reason instanceof Error
					? reason.message
					: typeof reason === "string"
						? reason
						: "";
			if (!isChunkLoadMessage(message)) return;
			reloadOnceForStaleChunk();
		};

		window.addEventListener("error", onError);
		window.addEventListener("unhandledrejection", onRejection);
		scheduleReloadFlagReset();

		return () => {
			window.removeEventListener("error", onError);
			window.removeEventListener("unhandledrejection", onRejection);
		};
	}, []);

	return null;
}
