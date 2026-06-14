import type { FmcKey } from "../../types";
import type { FmcProgramContext } from "../../engine/context";

async function toggleConnectApi(context: FmcProgramContext): Promise<void> {
	const state = context.getState();
	const status = state.setup.connectApiStatus;

	if (status === "CONNECTING") {
		return;
	}

	if (status === "CONNECTED") {
		context.updateState((current) => ({
			...current,

			setup: {
				...current.setup,
				connectApiStatus: "DISCONNECTED",
				connectApiError: null,
			},
		}));

		try {
			await context.services.connectApi.disconnect();
			context.showMessage("API DISCONNECTED");
		} catch (error) {
			context.showMessage("DISCONNECT FAILED");
		}

		return;
	}

	context.updateState((current) => ({
		...current,

		setup: {
			...current.setup,
			connectApiStatus: "CONNECTING",
			connectApiError: null,
		},

		message: null,
	}));

	try {
		await context.services.connectApi.connect();

		context.updateState((current) => ({
			...current,

			setup: {
				...current.setup,
				connectApiStatus: "CONNECTED",
				connectApiError: null,
			},

			message: "API CONNECTED",
		}));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown connection error";

		context.updateState((current) => ({
			...current,

			setup: {
				...current.setup,
				connectApiStatus: "ERROR",
				connectApiError: message,
			},

			message: "CONNECTION FAILED",
		}));
	}
}

async function refreshNavigationDatabase(
	context: FmcProgramContext,
): Promise<void> {
	context.showMessage("CHECKING NAV DATA");

	try {
		const database =
			await context.services.navigationDatabase.getLoadedDatabase();

		context.updateState((current) => ({
			...current,

			setup: {
				...current.setup,
				navigationDatabase: database,
			},

			message:
				database.status === "INTACT"
					? "NAV DATA VALID"
					: database.status === "CORRUPT"
						? "NAV DATA CORRUPT"
						: "NO VALID NAV DATA",
		}));
	} catch (error) {
		context.updateState((current) => ({
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

export async function handleSetupKey(
	key: FmcKey,
	context: FmcProgramContext,
): Promise<boolean> {
	switch (key) {
		case "LSK_L1":
			await toggleConnectApi(context);
			return true;

		case "LSK_L2":
			await refreshNavigationDatabase(context);
			return true;

		case "LSK_L3":
			context.setProgram("AIRCRAFT_SELECT");
			return true;

		case "LSK_L6":
			//context.setProgram("MENU");
			return true;

		case "LSK_R6": {
			const state = context.getState();

			if (state.setup.connectApiStatus !== "CONNECTED") {
				context.showMessage("CONNECT API REQUIRED");
				return true;
			}

			if (!state.setup.navigationDatabase) {
				context.showMessage("NAV DATA REQUIRED");
				return true;
			}

			if (!state.setup.selectedAircraft) {
				context.showMessage("SELECT AIRCRAFT TYPE");
				return true;
			}

			//context.setProgram("PERF_INIT");
			return true;
		}

		default:
			return false;
	}
}
