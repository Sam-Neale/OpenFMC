import type { FmcProgramId } from "../types";
import type { FmcProgram } from "./context";

import { setupProgram } from "../programs/setup";
import { aircraftSelectProgram } from "../programs/aircraft-select";

export const programs: Record<FmcProgramId, FmcProgram> = {
	SETUP: setupProgram,
	AIRCRAFT_SELECT: aircraftSelectProgram,
};

export function getProgram(id: FmcProgramId): FmcProgram {
	return programs[id];
}
