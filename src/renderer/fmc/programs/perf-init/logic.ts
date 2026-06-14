import type { FmcKey } from "../../types";
import type { FmcProgramContext } from "../../engine/context";

export function handlePerfInitKey(
	key: FmcKey,
	context: FmcProgramContext,
): boolean {
	switch (key) {
		case "LSK_L6":
			//context.setProgram("MENU");
			return true;

		case "LSK_R6":
			context.showMessage("THRUST LIM NOT IMPLEMENTED");
			return true;

		default:
			return false;
	}
}
