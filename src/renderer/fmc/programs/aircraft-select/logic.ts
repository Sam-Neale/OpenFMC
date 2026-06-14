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

export async function handleAircraftSelectKey(
	key: FmcKey,
	context: FmcProgramContext,
): Promise<boolean> {
	if (key === "LSK_L6") {
		context.setProgram("SETUP");
		return true;
	}

	const state = context.getState();

	if (state.aircraftSelect.status === "ERROR" && key === "LSK_L3") {
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
			const aircraft = await context.services.aircraft.refresh();

			context.updateState((current) => ({
				...current,

				pageIndex: 0,

				aircraftSelect: {
					aircraft,
					status: "READY",
					error: null,
				},

				message: null,
			}));
		} catch {
			context.showMessage("AIRCRAFT LIST ERROR");
		}

		return true;
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
