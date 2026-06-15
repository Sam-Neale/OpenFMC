import type { ConnectionManifest } from "ifc-node";

export type FmcTextColor = "white" | "green" | "cyan" | "amber" | "magenta";
export type FmcTextSize = "small" | "large";

export interface FmcLine {
	left?: string;
	center?: string;
	right?: string;
	color?: FmcTextColor;
	size?: FmcTextSize;
}

export interface FmcScreenSlot {
	labelLeft?: string;
	labelCenter?: string;
	labelRight?: string;

	valueLeft?: string;
	valueCenter?: string;
	valueRight?: string;
	disabled?: boolean;
	disabledLeft?: boolean;
	disabledCenter?: boolean;
	disabledRight?: boolean;
	boxedLeft?: boolean;
	boxedCenter?: boolean;
	boxedRight?: boolean;
	colorLeft?: FmcTextColor;
	colorCenter?: FmcTextColor;
	colorRight?: FmcTextColor;
	sizeLeft?: FmcTextSize;
	sizeCenter?: FmcTextSize;
	sizeRight?: FmcTextSize;
}

export interface FmcScreenModel {
	title: string;
	page?: string;
	slots: FmcScreenSlot[];
	scratchpad: string;
	execLight: boolean;
}

export type FmcProgramId =
	| "MENU"
	| "IF_CONNECT"
	| "IDENT"
	| "NAV_DATA"
	| "PERF_INIT"
	| "RTE"
	| "LEGS"
	| "HOLD"
	| "DEP_ARR"
	| "AIRCRAFT_SELECT";

export type FmcKey =
	| "INIT_REF"
	| "RTE"
	| "DEP_ARR"
	| "ATC"
	| "VNAV"
	| "FIX"
	| "LEGS"
	| "HOLD"
	| "FMC_COMM"
	| "PROG"
	| "MENU"
	| "NAV_RAD"
	| "PREV_PAGE"
	| "NEXT_PAGE"
	| "EXEC"
	| "DEL"
	| "CLR"
	| "SP"
	| "SLASH"
	| "DOT"
	| "PLUS_MINUS"
	| `LSK_L${1 | 2 | 3 | 4 | 5 | 6}`
	| `LSK_R${1 | 2 | 3 | 4 | 5 | 6}`
	| `${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
	| "A"
	| "B"
	| "C"
	| "D"
	| "E"
	| "F"
	| "G"
	| "H"
	| "I"
	| "J"
	| "K"
	| "L"
	| "M"
	| "N"
	| "O"
	| "P"
	| "Q"
	| "R"
	| "S"
	| "T"
	| "U"
	| "V"
	| "W"
	| "X"
	| "Y"
	| "Z";

export interface RouteSegment {
	via: string;
	to: string;
	expandedWaypoints: string[];
	fixes: RouteProcedureLeg[];
}

export interface RouteWaypoint {
	latitude: number;
	longitude: number;
	name: string;
}

export interface RouteTracking {
	type: string;
	course?: number;
}

export type AltitudeRestrictionType =
	| "AT"
	| "AT_OR_ABOVE"
	| "AT_OR_BELOW"
	| "BETWEEN";

export interface AltitudeRestriction {
	altitude: number;
	altitude2?: number;
	type: AltitudeRestrictionType;
}

export interface RouteProcedureLeg {
	seqno: number;
	waypoint: RouteWaypoint;
	tracking?: RouteTracking;
	altitudeRestriction?: AltitudeRestriction;
	holdId?: string;
}

export interface RoutePointReference {
	identifier?: string;
	areaCode?: string | null;
	latitude?: number;
	longitude?: number;
}

export type RouteAltitudeRestrictionType =
	| "AT"
	| "AT_OR_ABOVE"
	| "AT_OR_BELOW";

export interface RouteLegConstraint {
	speed?: number;
	altitude?: number;
	altitudeType?: RouteAltitudeRestrictionType;
	source: "PROCEDURE" | "MANUAL" | "PREDICTED";
}

export type RouteHoldKind = "ON_ROUTE" | "OFF_ROUTE" | "PPOS";
export type RouteHoldTurnDirection = "L" | "R";

export interface RouteHold {
	id: string;
	route: 1 | 2;
	kind: RouteHoldKind;
	fixName: string;
	waypoint: RouteWaypoint;
	inboundCourse: number;
	turnDirection: RouteHoldTurnDirection;
	legTimeMinutes?: number;
	legDistanceNm?: number;
	speed?: number;
	altitude?: number;
	altitudeType?: RouteAltitudeRestrictionType;
	insertionAfterLegKey: string | null;
	isActive: boolean;
	ended: boolean;
}

export interface StructuredRouteProcedure {
	identifier: string;
	transition: string;
	procedure: RouteProcedureLeg[];
}

export interface StructuredArrivalProcedure {
	identifier: string;
	transition: string;
	commonRoute: RouteProcedureLeg[];
	runwayTransitionRoute: RouteProcedureLeg[];
}

export interface StructuredApproachProcedure {
	identifier: string;
	localiserIdentifier: string | null;
	procedure: RouteProcedureLeg[];
	missedApproachProcedure: Array<{
		step: number;
		track?: number;
		altitudeRestriction?: AltitudeRestriction;
	}>;
}

export interface ProcedureOption {
	identifier: string;
	transitions: string[];
}

export interface ApproachOption {
	identifier: string;
	routeTypes: string[];
	transition: string;
}

export interface StructuredRoute {
	departure: {
		icao: string;
		runway: string;
		sid: StructuredRouteProcedure | null;
	};
	enroute: Array<{
		airway: string;
		fixes: RouteProcedureLeg[];
	}>;
	arrival: {
		icao: string;
		runway: string;
		star: StructuredArrivalProcedure | null;
		approach: StructuredApproachProcedure | null;
	};
}

export interface RoutePlanState {
	origin: string;
	destination: string;
	departureRunway: string;
	flightNumber: string;
	routeRequest: string;
	alternate: string;
	procedurePreview: RouteProcedurePreview;
	segments: RouteSegment[];
	structuredRoute: StructuredRoute;
	legConstraints: Record<string, RouteLegConstraint | null>;
	holds: RouteHold[];
	isActive: boolean;
}

export interface RouteLoadResult {
	status: "LOADED" | "NOT_FOUND" | "DUPLICATE";
	route?: RoutePlanState;
	matches?: string[];
}

export interface RouteState {
	activeRoute: 1 | 2 | null;
	selectedRoute: 1 | 2;
	plans: {
		1: RoutePlanState;
		2: RoutePlanState;
	};
	pendingVia: string | null;
	pendingViaRowIndex: number | null;
}

export interface FmcState {
	activeProgram: FmcProgramId;
	pageIndex: number;

	scratchpad: string;
	message: string | null;
	execPending: boolean;

	setup: SetupProgramState;
	aircraftSelect: AircraftSelectState;
	perfInit: PerfInitState;
	route: RouteState;
	depArr: DepArrState;
	legs: LegsState;
	hold: HoldState;
}

export type ConnectApiStatus =
	| "DISCONNECTED"
	| "CONNECTING"
	| "CONNECTED"
	| "ERROR";

export type NavigationDatabaseStatus =
	| "INTACT"
	| "MISSING"
	| "INVALID_CYCLE"
	| "MISSING_DATABASE"
	| "CORRUPT"
	| "ERROR";

export interface NavigationDatabaseInfo {
	cycle: string | null;
	revision: string | null;
	name: string | null;
	status: NavigationDatabaseStatus;
	error?: string;
}

export interface RunwayDefinition {
	identifier: string;
	length: number | null;
}

export interface RouteProcedurePreview {
	sid: string | null;
	star: string | null;
}

export interface AirwayExpansion {
	routeIdentifier: string;
	waypoints: string[];
	fixes: RouteProcedureLeg[];
}

export type DepArrMode = "DEPARTURES" | "ARRIVALS";

export interface DepArrState {
	mode: DepArrMode;
	selectedDepartureRunway: string;
	departureRunways: RunwayDefinition[];
	departureSids: ProcedureOption[];
	arrivalStars: ProcedureOption[];
	arrivalApproaches: ApproachOption[];
	status: "IDLE" | "LOADING" | "READY" | "ERROR";
	error: string | null;
}

export interface IfFlightPlanResolution {
	waypoints: string[];
	ambiguousFixes: string[];
}

export interface LegsPendingModification {
	route: 1 | 2;
	legKey: string;
	constraint: RouteLegConstraint | null;
}

export interface LegsState {
	pendingModification: LegsPendingModification | null;
	position: {
		latitude: number;
		longitude: number;
	} | null;
	magneticVariation: number;
	groundspeed: number;
	indicatedAirspeed: number;
	trueAirspeed: number;
	altitudeMsl: number;
	headingMagnetic: number;
	headingTrue: number;
	crosswindComponent: number;
	activeLegIndexByRoute: {
		1: number;
		2: number;
	};
	manualActiveLegByRoute: {
		1: boolean;
		2: boolean;
	};
	activeDistanceByRoute: {
		1: number | null;
		2: number | null;
	};
	predictionsByRoute: {
		1: Record<string, RouteLegConstraint>;
		2: Record<string, RouteLegConstraint>;
	};
}

export interface HoldState {
	draft: RouteHold | null;
	pendingInsertion: RouteHold | null;
	selectedHoldId: string | null;
}

export interface AircraftDefinition {
	id: string;
	name: string;
}

export interface AircraftSelectState {
	aircraft: AircraftDefinition[];
	status: "IDLE" | "LOADING" | "READY" | "ERROR";
	error: string | null;
	returnProgram: FmcProgramId | null;
}

export interface SetupProgramState {
	connectApiStatus: ConnectApiStatus;
	connectApiError: string | null;
	connectApiManifest: ConnectionManifest | null;

	navigationDatabase: NavigationDatabaseInfo | null;

	selectedAircraft: AircraftDefinition | null;
}

export type PerfInitField =
	| "grossWeight"
	| "cruiseAltitude"
	| "costIndex"
	| "zeroFuelWeight"
	| "reserves";

export interface PerfInitState {
	grossWeight: string;
	cruiseAltitude: string;
	costIndex: string;
	zeroFuelWeight: string;
	reserves: string;
	activeField: PerfInitField | null;
}
