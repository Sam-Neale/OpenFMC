import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getFmcState } from "./fmc/engine/engine";

const root = document.getElementById("root");

if (true) {
	Object.defineProperties(window, {
		fmcState: {
			get: () => getFmcState(),
			configurable: true,
		},
		getFmcStateSnapshot: {
			value: () => structuredClone(getFmcState()),
			configurable: true,
		},
	});
}

if (!root) {
	throw new Error("Missing #root element");
}

createRoot(root).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
