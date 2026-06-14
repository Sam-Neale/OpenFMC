import type { FmcProgramId } from "../types";
import type { FmcProgram } from "./context";

import { perfInitProgram } from "../programs/perf-init";

export const programs: Record<FmcProgramId, FmcProgram> = {
	PERF_INIT: perfInitProgram,
};

export function getProgram(id: FmcProgramId): FmcProgram {
	return programs[id];
}
