import type {
	AircraftDefinition,
	AirwayExpansion,
	IfFlightPlanResolution,
	NavigationDatabaseInfo,
	FmcState,
	RouteLoadResult,
	RouteProcedurePreview,
	RouteProcedureLeg,
	RoutePlanState,
	RoutePointReference,
	ProcedureOption,
	ApproachOption,
	StructuredRouteProcedure,
	StructuredArrivalProcedure,
	StructuredApproachProcedure,
	RunwayDefinition,
} from "./fmc/types";
import type { ConnectionManifest, StateValue } from "ifc-node";

interface AutopilotStatus {
	autopilotOn: boolean;
	targetHeading: number;
	targetSpeed: number;
	targetAltitude: number;
	verticalSpeed: number;
	maxBankDegrees: number;
	standardTurnRateDegreesPerMinute: number;
	bankSmoothnessDegreesPerSecond: number;
	headingKp: number;
	headingKi: number;
	headingKd: number;
	headingCaptureStartDegrees: number;
	headingCaptureMinScale: number;
	headingIntegralDecayStartDegrees: number;
	altitudeKp: number;
	altitudeKi: number;
	altitudeKd: number;
	altitudeCaptureBandMeters: number;
	altitudeCaptureStartMeters: number;
	altitudeCaptureMinScale: number;
	initialVerticalSpeedFpm: number;
	verticalSpeedRampFpmPerSecond: number;
	verticalSpeedReductionFpmPerSecond: number;
	workerRunning: boolean;
	status: string;
	pid: number | null;
	logFilePath: string | null;
}

declare global {
	interface Window {
		openFmc: {
			navData: {
				inspect(): Promise<NavigationDatabaseInfo>;
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
				resolveFlightPlanForIf(
					waypoints: string[],
				): Promise<IfFlightPlanResolution>;
			};
			aircraft: {
				list(): Promise<AircraftDefinition[]>;
				refresh(): Promise<AircraftDefinition[]>;
			};
			connectApi: {
				connect(): Promise<ConnectionManifest>;
				disconnect(): Promise<void>;
				get(pathName: string): Promise<StateValue | null>;
				set(pathName: string, value: StateValue): Promise<void>;
				command(commandName: string): Promise<void>;
			};
			routeStorage: {
				save(name: string, route: RoutePlanState): Promise<string>;
				load(name: string): Promise<RouteLoadResult>;
			};
			system: {
				openExternal(url: string): Promise<void>;
			};
			autopilot: {
				getStatus(): Promise<AutopilotStatus>;
				setLoggingEnabled(enabled: boolean): Promise<AutopilotStatus>;
				setSettings(
					settings: Partial<
						Pick<
							AutopilotStatus,
							| "autopilotOn"
							| "targetHeading"
							| "targetSpeed"
							| "targetAltitude"
							| "verticalSpeed"
							| "maxBankDegrees"
							| "standardTurnRateDegreesPerMinute"
							| "bankSmoothnessDegreesPerSecond"
							| "headingKp"
							| "headingKi"
							| "headingKd"
							| "headingCaptureStartDegrees"
							| "headingCaptureMinScale"
							| "headingIntegralDecayStartDegrees"
							| "altitudeKp"
							| "altitudeKi"
							| "altitudeKd"
							| "altitudeCaptureBandMeters"
							| "altitudeCaptureStartMeters"
							| "altitudeCaptureMinScale"
							| "initialVerticalSpeedFpm"
							| "verticalSpeedRampFpmPerSecond"
							| "verticalSpeedReductionFpmPerSecond"
						>
					>,
				): Promise<AutopilotStatus>;
			};
		};
		readonly fmcState: Readonly<FmcState>;
	}
}

export {};
