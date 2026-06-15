import { createFmcProgram, type FmcProgramApi } from "../../sdk";

function openPerfInit(api: FmcProgramApi): void {
	if (api.store.setup.connectApiStatus !== "CONNECTED") {
		api.showMessage("IF CONNECT REQUIRED");
		return;
	}

	api.setProgram("IDENT");
}

function showDud(api: FmcProgramApi): void {
	api.showMessage("NOT AVAILABLE");
}

export const menuProgram = createFmcProgram({
	id: "MENU",

	pages: [
		{
			title: "OPENFMC MENU",
			page: "",
			slots(api) {
				return [
					{
						valueLeft: "<FMC",
						onLeft: () => openPerfInit(api),
					},
					{
						valueLeft: "<DOWNLINK",
						disabledLeft: true,
						onLeft: () => showDud(api),
					},
					{
						valueLeft: "<SAT",
						disabledLeft: true,
						onLeft: () => showDud(api),
					},
					{},
					{
						valueRight: "IF SETUP>",
						onRight: () => api.setProgram("IF_CONNECT"),
					},
					{
						valueRight: "IF OPTIONS>",
						disabledRight: true,
						onRight: () => showDud(api),
					},
				];
			},
		},
	],
});
