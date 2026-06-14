import type { AircraftDefinition } from "../fmc/types";

export const aircraftService = {
	async list(): Promise<AircraftDefinition[]> {
		return window.openFmc.aircraft.list();
	},

	async refresh(): Promise<AircraftDefinition[]> {
		return window.openFmc.aircraft.refresh();
	},
};
