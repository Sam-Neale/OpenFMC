import type {
	AirwayExpansion,
	ApproachOption,
	IfFlightPlanResolution,
	NavigationDatabaseInfo,
	ProcedureOption,
	RouteProcedureLeg,
	RoutePointReference,
	RouteProcedurePreview,
	StructuredApproachProcedure,
	StructuredArrivalProcedure,
	StructuredRouteProcedure,
	RunwayDefinition,
} from "../fmc/types";

function isMissingIpcHandler(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.includes("No handler registered for")
	);
}

export const navigationDatabaseService = {
	async getLoadedDatabase(): Promise<NavigationDatabaseInfo> {
		return window.openFmc.navData.inspect();
	},

	async airportExists(airport: string): Promise<boolean> {
		try {
			return await window.openFmc.navData.airportExists(airport);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return true;
			}

			throw error;
		}
	},

	async waypointExists(waypoint: string): Promise<boolean> {
		try {
			return await window.openFmc.navData.waypointExists(waypoint);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return true;
			}

			throw error;
		}
	},

	async resolveWaypoint(waypoint: string): Promise<RouteProcedureLeg | null> {
		try {
			return await window.openFmc.navData.resolveWaypoint(waypoint);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return null;
			}

			throw error;
		}
	},

	async resolveWaypointForRoute(
		waypoint: string,
		previousReference: RoutePointReference,
	): Promise<RouteProcedureLeg | null> {
		return window.openFmc.navData.resolveWaypointForRoute(
			waypoint,
			previousReference,
		);
	},

	async listRunways(airport: string): Promise<RunwayDefinition[]> {
		try {
			return await window.openFmc.navData.listRunways(airport);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return [];
			}

			throw error;
		}
	},

	async runwayExists(airport: string, runway: string): Promise<boolean> {
		try {
			return await window.openFmc.navData.runwayExists(airport, runway);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return true;
			}

			throw error;
		}
	},

	async getProcedurePreview(
		origin: string,
		destination: string,
		runway: string,
	): Promise<RouteProcedurePreview> {
		try {
			return await window.openFmc.navData.getProcedurePreview(
				origin,
				destination,
				runway,
			);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return {
					sid: null,
					star: null,
				};
			}

			throw error;
		}
	},

	async listDepartureSids(
		airport: string,
		runway: string,
	): Promise<ProcedureOption[]> {
		try {
			return await window.openFmc.navData.listDepartureSids(airport, runway);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return [];
			}

			throw error;
		}
	},

	async listArrivalStars(airport: string): Promise<ProcedureOption[]> {
		try {
			return await window.openFmc.navData.listArrivalStars(airport);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return [];
			}

			throw error;
		}
	},

	async listApproaches(airport: string): Promise<ApproachOption[]> {
		try {
			return await window.openFmc.navData.listApproaches(airport);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return [];
			}

			throw error;
		}
	},

	async getSidProcedure(
		airport: string,
		identifier: string,
		transition: string,
	): Promise<StructuredRouteProcedure> {
		return window.openFmc.navData.getSidProcedure(
			airport,
			identifier,
			transition,
		);
	},

	async getStarProcedure(
		airport: string,
		identifier: string,
		commonTransition: string,
		runwayTransition: string,
	): Promise<StructuredArrivalProcedure> {
		return window.openFmc.navData.getStarProcedure(
			airport,
			identifier,
			commonTransition,
			runwayTransition,
		);
	},

	async getApproachProcedure(
		airport: string,
		identifier: string,
		transition: string,
	): Promise<StructuredApproachProcedure> {
		return window.openFmc.navData.getApproachProcedure(
			airport,
			identifier,
			transition,
		);
	},

	async expandAirway(
		airway: string,
		from: string,
		to: string,
	): Promise<AirwayExpansion | null> {
		try {
			return await window.openFmc.navData.expandAirway(airway, from, to);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return null;
			}

			throw error;
		}
	},

	async resolveFlightPlanForIf(
		waypoints: string[],
	): Promise<IfFlightPlanResolution> {
		try {
			return await window.openFmc.navData.resolveFlightPlanForIf(waypoints);
		} catch (error) {
			if (isMissingIpcHandler(error)) {
				return {
					waypoints,
					ambiguousFixes: [],
				};
			}

			throw error;
		}
	},
};
