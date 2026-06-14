import type { NavigationDatabaseInfo } from "../fmc/types";

export const navigationDatabaseService = {
	async getLoadedDatabase(): Promise<NavigationDatabaseInfo> {
		return window.openFmc.navData.inspect();
	},
};
