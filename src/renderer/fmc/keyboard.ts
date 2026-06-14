import type { FmcKey } from "./types";

const directMap: Record<string, FmcKey> = {
	Backspace: "DEL",
	Delete: "DEL",
	Enter: "EXEC",
	" ": "SP",
	".": "DOT",
	"/": "SLASH",
	"-": "PLUS_MINUS",
	PageUp: "PREV_PAGE",
	PageDown: "NEXT_PAGE",
	Escape: "CLR",
};

export function keyboardEventToFmcKey(event: KeyboardEvent): FmcKey | null {
	if (event.ctrlKey || event.metaKey || event.altKey) return null;

	if (directMap[event.key]) return directMap[event.key];

	const key = event.key.toUpperCase();

	if (/^[A-Z]$/.test(key)) return key as FmcKey;
	if (/^[0-9]$/.test(key)) return key as FmcKey;

	return null;
}
