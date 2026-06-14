import type { FmcProgram } from "../../engine/context";

import { handlePerfInitKey } from "./logic";
import { renderPerfInit } from "./render";

export const perfInitProgram: FmcProgram = {
	id: "PERF_INIT",
	render: renderPerfInit,
	handleKey: handlePerfInitKey,
};
