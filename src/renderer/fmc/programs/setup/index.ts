import type { FmcProgram } from "../../engine/context";

import { handleSetupKey } from "./logic";
import { renderSetup } from "./render";

export const setupProgram: FmcProgram = {
	id: "SETUP",

	render: renderSetup,

	handleKey: handleSetupKey,

	async onEnter(context) {
		try {
			const database =
				await context.services.navigationDatabase.getLoadedDatabase();

			context.updateState((current) => ({
				...current,

				setup: {
					...current.setup,
					navigationDatabase: database,
				},
			}));
		} catch {
			context.updateState((current) => ({
				...current,

				setup: {
					...current.setup,
					navigationDatabase: null,
				},
			}));
		}
	},
};
