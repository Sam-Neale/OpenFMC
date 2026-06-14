import type { FmcScreenModel, FmcState } from "../../types";

type ProgramScreen = Omit<FmcScreenModel, "scratchpad" | "execLight">;

function formatConnectionStatus(state: Readonly<FmcState>): string {
	switch (state.setup.connectApiStatus) {
		case "CONNECTED":
			return "CONNECTED";

		case "CONNECTING":
			return "CONNECTING...";

		case "ERROR":
			return "FAILED";

		case "DISCONNECTED":
		default:
			return "CONNECT>";
	}
}

function formatNavDatabase(state: Readonly<FmcState>): string {
	const database = state.setup.navigationDatabase;

	if (!database) {
		return "NOT CHECKED";
	}

	if (database.status === "INTACT" && database.cycle) {
		return `AIRAC${database.cycle} (INTACT)`;
	}

	switch (database.status) {
		case "CORRUPT":
			return database.cycle
				? `AIRAC${database.cycle} (CORRUPT)`
				: "DATABASE CORRUPT";

		case "MISSING_DATABASE":
			return database.cycle
				? `AIRAC${database.cycle} (NO DB)`
				: "NAVDB MISSING";

		case "INVALID_CYCLE":
			return "CYCLE INVALID";

		case "MISSING":
			return "NOT INSTALLED";

		case "ERROR":
			return "CHECK FAILED";

		default:
			return "NOT INSTALLED";
	}
}

function formatAircraft(state: Readonly<FmcState>): string {
	return state.setup.selectedAircraft?.name ?? "SELECT>";
}

export function renderSetup(state: Readonly<FmcState>): ProgramScreen {
	return {
		title: "OPENFMC SETUP",
		page: "1/1",

		slots: [
			{
				labelLeft: "CONNECT API",
				valueLeft: `<${formatConnectionStatus(state)}`,
			},
			{
				labelLeft: "NAV DATABASE",
				valueLeft: formatNavDatabase(state),
			},
			{
				labelLeft: "AIRCRAFT TYPE",
				valueLeft: `<${formatAircraft(state)}`,
			},
			{},
			{},
			{
				valueLeft: "<INDEX",
				valueRight: "CONTINUE>",
			},
		],
	};
}
