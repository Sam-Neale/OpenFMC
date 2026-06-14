import type { FmcProgram } from "../../engine/context";

import { handleAircraftSelectKey } from "./logic";

import { getAircraftPageCount, renderAircraftSelect } from "./render";

export const aircraftSelectProgram: FmcProgram = {
	id: "AIRCRAFT_SELECT",

	render: renderAircraftSelect,
	handleKey: handleAircraftSelectKey,
	getPageCount(state) {
		return getAircraftPageCount(state);
	},

	async onEnter(context) {
		const state = context.getState();

		if (
			state.aircraftSelect.status === "READY" &&
			state.aircraftSelect.aircraft.length > 0
		) {
			return;
		}

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
			const aircraft = await context.services.aircraft.list();

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
		} catch (error) {
			context.updateState((current) => ({
				...current,

				aircraftSelect: {
					aircraft: [],
					status: "ERROR",
					error:
						error instanceof Error
							? error.message
							: "Unknown aircraft list error",
				},

				message: "AIRCRAFT LIST ERROR",
			}));
		}
	},
};
