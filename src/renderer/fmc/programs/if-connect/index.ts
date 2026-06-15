import { createFmcProgram, type FmcProgramApi } from "../../sdk";
import type { FmcState } from "../../types";

function formatStatus(state: Readonly<FmcState>): string {
	switch (state.setup.connectApiStatus) {
		case "CONNECTED":
			return "CONNECTED";

		case "CONNECTING":
			return "CONNECTING...";

		case "ERROR":
			return "FAILED";

		case "DISCONNECTED":
		default:
			return "DISCONNECTED";
	}
}

async function connectToIf(api: FmcProgramApi): Promise<void> {
	if (api.store.setup.connectApiStatus === "CONNECTING") {
		return;
	}

	if (api.store.setup.connectApiStatus === "CONNECTED") {
		api.showMessage("IF CONNECTED");
		return;
	}

	api.updateStore((current) => ({
		...current,
		setup: {
			...current.setup,
			connectApiStatus: "CONNECTING",
			connectApiError: null,
			connectApiManifest: null,
		},
		message: "CONNECTING TO IF",
	}));

	try {
		const manifest = await api.services.connectApi.connect();

		api.updateStore((current) => ({
			...current,
			setup: {
				...current.setup,
				connectApiStatus: "CONNECTED",
				connectApiError: null,
				connectApiManifest: manifest,
			},
			message: "IF CONNECTED",
		}));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown connection error";

		api.updateStore((current) => ({
			...current,
			setup: {
				...current.setup,
				connectApiStatus: "ERROR",
				connectApiError: message,
				connectApiManifest: null,
			},
			message: "IF CONNECT FAILED",
		}));
	}
}

async function disconnectFromIf(api: FmcProgramApi): Promise<void> {
	if (api.store.setup.connectApiStatus !== "CONNECTED") {
		api.showMessage("IF NOT CONNECTED");
		return;
	}

	api.updateStore((current) => ({
		...current,
		setup: {
			...current.setup,
			connectApiStatus: "DISCONNECTED",
			connectApiError: null,
			connectApiManifest: null,
		},
	}));

	try {
		await api.services.connectApi.disconnect();
		api.showMessage("IF DISCONNECTED");
	} catch {
		api.showMessage("DISCONNECT FAILED");
	}
}

export const ifConnectProgram = createFmcProgram({
	id: "IF_CONNECT",

	pages: [
		{
			title: "IF CONNECT",
			page: "",
			slots(api) {
				return [
					{
						labelLeft: "STATUS",
						valueLeft: formatStatus(api.store),
					},
					{
						labelLeft: "ERROR",
						valueLeft: api.store.setup.connectApiError ?? "",
					},
					{},
					{},
					{},
					{
						valueLeft: "<MENU",
						valueRight:
							api.store.setup.connectApiStatus === "CONNECTED"
								? "DISCONNECT>"
								: "CONNECT>",
						onLeft: () => api.setProgram("MENU"),
						onRight: () =>
							api.store.setup.connectApiStatus === "CONNECTED"
								? disconnectFromIf(api)
								: connectToIf(api),
					},
				];
			},
		},
	],
});
