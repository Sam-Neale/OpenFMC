import { createFmcProgram, type FmcProgramApi } from "../../sdk";
import type { FmcState } from "../../types";

function formatAircraft(state: Readonly<FmcState>): string {
	return state.setup.selectedAircraft
		? `<${state.setup.selectedAircraft.name}`
		: "<SELECT";
}

function formatAiracCycle(state: Readonly<FmcState>): string {
	const database = state.setup.navigationDatabase;

	if (!database) {
		return "<LOAD";
	}

	if (database.status === "INTACT" && database.cycle) {
		return `<AIRAC${database.cycle}`;
	}

	return `<${database.status.replaceAll("_", " ")}`;
}

function openAircraftSelect(api: FmcProgramApi): void {
	api.updateStore((current) => ({
		...current,
		aircraftSelect: {
			...current.aircraftSelect,
			returnProgram: "IDENT",
		},
	}));

	api.setProgram("AIRCRAFT_SELECT");
}

export const identProgram = createFmcProgram({
	id: "IDENT",

	pages: [
		{
			title: "IDENT",
			page: "",
			slots(api) {
				return [
					{
						labelLeft: "AIRCRAFT",
						valueLeft: formatAircraft(api.store),
						onLeft: () => openAircraftSelect(api),
					},
					{
						labelLeft: "NAV DATA",
						valueLeft: formatAiracCycle(api.store),
						onLeft: () => api.setProgram("NAV_DATA"),
					},
					{},
					{},
					{
						valueCenter: "----------------",
					},
					{
						valueLeft: "<INDEX",
						valueRight: "ROUTE>",
						onLeft: () => api.setProgram("MENU"),
						onRight: () => api.setProgram("RTE"),
					},
				];
			},
		},
	],
});
