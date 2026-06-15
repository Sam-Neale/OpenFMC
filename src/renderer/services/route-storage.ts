import type { RouteLoadResult, RoutePlanState } from "../fmc/types";

export const routeStorageService = {
	async save(name: string, route: RoutePlanState): Promise<string> {
		return window.openFmc.routeStorage.save(name, route);
	},

	async load(name: string): Promise<RouteLoadResult> {
		return window.openFmc.routeStorage.load(name);
	},
};
