import type { FmcProgramId } from "../types";
import type { FmcProgram } from "./context";

import { menuProgram } from "../programs/menu";
import { ifConnectProgram } from "../programs/if-connect";
import { identProgram } from "../programs/ident";
import { navDataProgram } from "../programs/nav-data";
import { perfInitProgram } from "../programs/perf-init";
import { routeProgram } from "../programs/route";
import { legsProgram } from "../programs/legs";
import { holdProgram } from "../programs/hold";
import { depArrProgram } from "../programs/dep-arr";
import { aircraftSelectProgram } from "../programs/aircraft-select";

export const programs: Record<FmcProgramId, FmcProgram> = {
	MENU: menuProgram,
	IF_CONNECT: ifConnectProgram,
	IDENT: identProgram,
	NAV_DATA: navDataProgram,
	PERF_INIT: perfInitProgram,
	RTE: routeProgram,
	LEGS: legsProgram,
	HOLD: holdProgram,
	DEP_ARR: depArrProgram,
	AIRCRAFT_SELECT: aircraftSelectProgram,
};

export function getProgram(id: FmcProgramId): FmcProgram {
	return programs[id];
}
