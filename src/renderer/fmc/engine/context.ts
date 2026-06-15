import type {
	FmcProgramId,
	FmcScreenModel,
	FmcKey,
	FmcState,
	RouteLoadResult,
	NavigationDatabaseInfo,
	AircraftDefinition,
	RunwayDefinition,
	RouteProcedurePreview,
	AirwayExpansion,
	IfFlightPlanResolution,
	RouteProcedureLeg,
	RoutePointReference,
	ProcedureOption,
	ApproachOption,
	StructuredRouteProcedure,
	StructuredArrivalProcedure,
	StructuredApproachProcedure,
	RoutePlanState,
} from "../types";
import type { ConnectionManifest, StateValue } from "ifc-node";

export interface FmcServices {
	connectApi: {
		connect(): Promise<ConnectionManifest>;
		disconnect(): Promise<void>;
		get(pathName: string): Promise<StateValue | null>;
		set(pathName: string, value: StateValue): Promise<void>;
		command(commandName: string): Promise<void>;
	};
	navigationDatabase: {
		getLoadedDatabase(): Promise<NavigationDatabaseInfo>;
		airportExists(airport: string): Promise<boolean>;
		waypointExists(waypoint: string): Promise<boolean>;
		resolveWaypoint(waypoint: string): Promise<RouteProcedureLeg | null>;
		resolveWaypointForRoute(
			waypoint: string,
			previousReference: RoutePointReference,
		): Promise<RouteProcedureLeg | null>;
		listRunways(airport: string): Promise<RunwayDefinition[]>;
		runwayExists(airport: string, runway: string): Promise<boolean>;
		getProcedurePreview(
			origin: string,
			destination: string,
			runway: string,
		): Promise<RouteProcedurePreview>;
		listDepartureSids(
			airport: string,
			runway: string,
		): Promise<ProcedureOption[]>;
		listArrivalStars(airport: string): Promise<ProcedureOption[]>;
		listApproaches(airport: string): Promise<ApproachOption[]>;
		getSidProcedure(
			airport: string,
			identifier: string,
			transition: string,
		): Promise<StructuredRouteProcedure>;
		getStarProcedure(
			airport: string,
			identifier: string,
			commonTransition: string,
			runwayTransition: string,
		): Promise<StructuredArrivalProcedure>;
		getApproachProcedure(
			airport: string,
			identifier: string,
			transition: string,
		): Promise<StructuredApproachProcedure>;
		expandAirway(
			airway: string,
			from: string,
			to: string,
		): Promise<AirwayExpansion | null>;
		resolveFlightPlanForIf(waypoints: string[]): Promise<IfFlightPlanResolution>;
	};
	aircraft: {
		list(): Promise<AircraftDefinition[]>;
		refresh(): Promise<AircraftDefinition[]>;
	};
	routeStorage: {
		save(name: string, route: RoutePlanState): Promise<string>;
		load(name: string): Promise<RouteLoadResult>;
	};
	system: {
		openExternal(url: string): Promise<void>;
	};
}

export interface FmcProgramContext {
	getState(): Readonly<FmcState>;
	updateState(
		update: Partial<FmcState> | ((state: Readonly<FmcState>) => FmcState),
	): void;
	setProgram(program: FmcProgramId): void;
	setScratchpad(value: string): void;
	clearScratchpad(): void;
	showMessage(message: string): void;
	setExecPending(pending: boolean): void;
	services: FmcServices;
}

export interface FmcProgram {
	id: FmcProgramId;

	getPageCount?(state: Readonly<FmcState>): number;

	render(
		state: Readonly<FmcState>,
	): Omit<FmcScreenModel, "scratchpad" | "execLight">;

	handleKey?(
		key: FmcKey,
		context: FmcProgramContext,
	): boolean | Promise<boolean>;

	onEnter?(context: FmcProgramContext): void | Promise<void>;

	onExit?(context: FmcProgramContext): void | Promise<void>;

	onExec?(context: FmcProgramContext): boolean | Promise<boolean>;
}
