import { createFmcProgram, type FmcProgramApi } from "../../sdk";
import type { FmcState, NavigationDatabaseInfo } from "../../types";

const NAV_DATA_HELP_URL = "https://example.com/openfmc-navdata";

function formatNavDatabase(state: Readonly<FmcState>): string {
	const database = state.setup.navigationDatabase;

	if (!database) {
		return "NOT LOADED";
	}

	if (database.status === "INTACT" && database.cycle) {
		return `AIRAC${database.cycle}`;
	}

	switch (database.status) {
		case "CORRUPT":
			return database.cycle ? `AIRAC${database.cycle} CORRUPT` : "CORRUPT";

		case "MISSING_DATABASE":
			return database.cycle ? `AIRAC${database.cycle} NO DB` : "DB MISSING";

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

function getNavDataMessage(database: NavigationDatabaseInfo): string {
	switch (database.status) {
		case "INTACT":
			return "NAV DATA VALID";

		case "CORRUPT":
			return "NAV DATA CORRUPT";

		case "MISSING_DATABASE":
		case "MISSING":
			return "NAV DATA MISSING";

		case "INVALID_CYCLE":
			return "NAV DATA OUT OF DATE";

		case "ERROR":
		default:
			return "NAV DATA ERROR";
	}
}

async function loadNavigationDatabase(api: FmcProgramApi): Promise<void> {
	api.showMessage("CHECKING NAV DATA");

	try {
		const database = await api.services.navigationDatabase.getLoadedDatabase();

		api.updateStore((current) => ({
			...current,
			setup: {
				...current.setup,
				navigationDatabase: database,
			},
			message: getNavDataMessage(database),
		}));
	} catch (error) {
		api.updateStore((current) => ({
			...current,
			setup: {
				...current.setup,
				navigationDatabase: {
					cycle: null,
					revision: null,
					name: null,
					status: "ERROR",
					error:
						error instanceof Error ? error.message : "Unknown nav-data error",
				},
			},
			message: "NAV DATA ERROR",
		}));
	}
}

export const navDataProgram = createFmcProgram({
	id: "NAV_DATA",

	pages: [
		{
			title: "NAV DATA",
			page: "",
			slots(api) {
				const database = api.store.setup.navigationDatabase;

				return [
					{
						labelLeft: "DATABASE",
						valueLeft: formatNavDatabase(api.store),
					},
					{
						labelLeft: "REVISION",
						valueLeft: database?.revision ?? "",
					},
					{
						labelLeft: "NAME",
						valueLeft: database?.name ?? "",
					},
					{
						labelLeft: "DETAIL",
						valueLeft: database?.error ?? "",
					},
					{
						valueRight: "INSTALL HELP>",
						onRight: () => api.services.system.openExternal(NAV_DATA_HELP_URL),
					},
					{
						valueLeft: "<MENU",
						valueRight: "RELOAD>",
						onLeft: () => api.setProgram("MENU"),
						onRight: () => loadNavigationDatabase(api),
					},
				];
			},
		},
	],

	onEnter(api) {
		return loadNavigationDatabase(api);
	},
});
