import type { AircraftDefinition, FmcKey } from "../../types";

import type { FmcProgramContext } from "../../engine/context";

import { getAircraftForPage } from "./render";

function getSelectedAircraft(
	key: FmcKey,
	context: FmcProgramContext,
): AircraftDefinition | null {
	const match = key.match(/^LSK_L([1-5])$/);

	if (!match) {
		return null;
	}

	const rowIndex = Number(match[1]) - 1;
	const state = context.getState();

	const pageAircraft = getAircraftForPage(
		state.aircraftSelect.aircraft,
		state.pageIndex,
	);

	return pageAircraft[rowIndex] ?? null;
}

function incrementErrorMessage(currentMessage: string | null): string {
	const baseMessage = "AIRCRAFT LIST ERROR";

	if (!currentMessage) {
		return `${baseMessage} (x1)`;
	}

	const match = currentMessage.match(/\(x(\d+)\)\s*$/);

	if (!match) {
		return `${baseMessage} (x1)`;
	}

	const currentCount = Number(match[1]);

	return `${baseMessage} (x${currentCount + 1})`;
}

async function reloadAircraftList(context: FmcProgramContext): Promise<void> {
	/*
	 * Capture the existing error before replacing the
	 * scratchpad message with LOADING AIRCRAFT.
	 */
	const previousMessage = context.getState().message;

	context.updateState((current) => ({
		...current,

		aircraftSelect: {
			...current.aircraftSelect,
			status: "LOADING",
			error: null,
		},

		message: "LOADING AIRCRAFT",
	}));

	try {
		/*
		 * refresh() bypasses the valid cache and downloads
		 * a new copy from SimBrief.
		 */
		const aircraft = await context.services.aircraft.refresh();

		context.updateState((current) => ({
			...current,

			pageIndex: 0,

			aircraftSelect: {
				aircraft,
				status: "READY",
				error: null,
			},

			message: "AIRCRAFT LIST UPDATED",
		}));
	} catch (error) {
		const errorMessage = incrementErrorMessage(previousMessage);

		context.updateState((current) => ({
			...current,

			aircraftSelect: {
				...current.aircraftSelect,
				status: "ERROR",
				error:
					error instanceof Error
						? error.message
						: "Unknown aircraft list error",
			},

			message: errorMessage,
		}));
	}
}

export async function handleAircraftSelectKey(
	key: FmcKey,
	context: FmcProgramContext,
): Promise<boolean> {
	const state = context.getState();

	/*
	 * R6 always forces a new download and rewrites
	 * the local aircraft cache.
	 */
	if (key === "LSK_R6" && !context.getState().setup.selectedAircraft) {
		await reloadAircraftList(context);
		return true;
	}

	if (key === "LSK_R6" && context.getState().setup.selectedAircraft) {
		const selectedAircraft = getSelectedAircraft(key, context);
		context.setProgram("SETUP");
		return true;
	}

	if (key === "LSK_L6") {
		context.setProgram("SETUP");
		return true;
	}

	/*
	 * Keep L3 as the retry key on the error screen.
	 */
	if (state.aircraftSelect.status === "ERROR" && key === "LSK_L3") {
		await reloadAircraftList(context);
		return true;
	}

	if (state.aircraftSelect.status !== "READY") {
		return false;
	}

	const selectedAircraft = getSelectedAircraft(key, context);

	if (!selectedAircraft) {
		return false;
	}

	context.updateState((current) => ({
		...current,

		setup: {
			...current.setup,
			selectedAircraft: {
				id: selectedAircraft.id,
				name: selectedAircraft.name,
			},
		},

		message: null,
	}));

	context.setProgram("SETUP");
	context.showMessage(`${selectedAircraft.id} SELECTED`);

	return true;
}
