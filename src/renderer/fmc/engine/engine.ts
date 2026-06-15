import type {
	FmcKey,
	FmcProgramId,
	FmcScreenModel,
	FmcState,
	RouteLegConstraint,
	RoutePlanState,
} from "../types";
import { buildRouteLegRows, type BuiltRouteLeg } from "../route-leg-builder";

import { connectApiService } from "../../services/connect-api";
import { navigationDatabaseService } from "../../services/navigation-database";
import { aircraftService } from "../../services/aircraft";
import { systemService } from "../../services/system";
import { routeStorageService } from "../../services/route-storage";

import type { FmcProgramContext } from "./context";

import { getProgram } from "./registry";

export type FmcListener = (state: Readonly<FmcState>) => void;

const FMC_MONITOR_INTERVAL_MS = 1000;
const MIN_WAYPOINT_ADVANCE_DISTANCE_NM = 1;
const MAX_TURN_LEAD_DISTANCE_NM = 8;
const DEFAULT_BANK_ANGLE_DEGREES = 25;
const KNOTS_TO_FEET_PER_SECOND = 1.68781;
const FEET_PER_NM = 6076.12;
const METERS_PER_SECOND_TO_KNOTS = 1.9438444924406;

function createEmptyStructuredRoute() {
	return {
		departure: {
			icao: "",
			runway: "",
			sid: null,
		},
		enroute: [],
		arrival: {
			icao: "",
			runway: "",
			star: null,
			approach: null,
		},
	};
}

function toRadians(value: number): number {
	return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
	return (value * 180) / Math.PI;
}

function normalizeDegrees(value: number): number {
	return ((value % 360) + 360) % 360;
}

function getSmallestAngleDifference(from: number, to: number): number {
	const difference = Math.abs(normalizeDegrees(to - from));

	return difference > 180 ? 360 - difference : difference;
}

function getDistanceNm(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number },
): number {
	const latitudeDelta = toRadians(to.latitude - from.latitude);
	const longitudeDelta = toRadians(to.longitude - from.longitude);
	const fromLatitude = toRadians(from.latitude);
	const toLatitude = toRadians(to.latitude);
	const haversine =
		Math.sin(latitudeDelta / 2) ** 2 +
		Math.cos(fromLatitude) *
			Math.cos(toLatitude) *
			Math.sin(longitudeDelta / 2) ** 2;

	return (
		2 * 3440.065 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
	);
}

function getBearingDegrees(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number },
): number {
	const fromLatitude = toRadians(from.latitude);
	const toLatitude = toRadians(to.latitude);
	const longitudeDelta = toRadians(to.longitude - from.longitude);
	const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
	const x =
		Math.cos(fromLatitude) * Math.sin(toLatitude) -
		Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);

	return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

function getNearestLegIndex(
	position: { latitude: number; longitude: number },
	legs: BuiltRouteLeg[],
): number {
	return legs.reduce(
		(nearest, leg, index) => {
			const distance = getDistanceNm(position, leg.leg.waypoint);

			return distance < nearest.distance ? { index, distance } : nearest;
		},
		{ index: 0, distance: Number.POSITIVE_INFINITY },
	).index;
}

function getTurnLeadDistanceNm(
	legs: BuiltRouteLeg[],
	activeLegIndex: number,
	groundspeed: number,
): number {
	const currentLeg = legs[activeLegIndex];
	const nextLeg = legs[activeLegIndex + 1];

	if (!currentLeg?.previous || !nextLeg) {
		return MIN_WAYPOINT_ADVANCE_DISTANCE_NM;
	}

	const inboundTrack = getBearingDegrees(
		currentLeg.previous,
		currentLeg.leg.waypoint,
	);
	const outboundTrack = getBearingDegrees(
		currentLeg.leg.waypoint,
		nextLeg.leg.waypoint,
	);
	const turnAngle = getSmallestAngleDifference(inboundTrack, outboundTrack);
	const speedFeetPerSecond = groundspeed * KNOTS_TO_FEET_PER_SECOND;
	const turnRadiusNm =
		speedFeetPerSecond ** 2 /
		(32.174 * Math.tan(toRadians(DEFAULT_BANK_ANGLE_DEGREES))) /
		FEET_PER_NM;
	const leadDistance =
		turnRadiusNm * Math.tan(toRadians(Math.min(turnAngle, 150) / 2));

	return Math.max(
		MIN_WAYPOINT_ADVANCE_DISTANCE_NM,
		Math.min(MAX_TURN_LEAD_DISTANCE_NM, leadDistance),
	);
}

function getNextActiveLegIndex(
	plan: RoutePlanState,
	position: { latitude: number; longitude: number },
	legs: BuiltRouteLeg[],
	currentIndex: number,
	groundspeed: number,
): number {
	if (legs.length === 0) {
		return 0;
	}

	const activeIndex = Math.max(0, Math.min(currentIndex, legs.length - 1));
	const activeHoldId = legs[activeIndex].holdId;

	if (
		activeHoldId &&
		legs[activeIndex].leg.tracking?.type === "HOLD" &&
		(plan.holds ?? []).find((hold) => hold.id === activeHoldId)?.isActive &&
		!(plan.holds ?? []).find((hold) => hold.id === activeHoldId)?.ended
	) {
		return activeIndex;
	}

	const distanceToActive = getDistanceNm(
		position,
		legs[activeIndex].leg.waypoint,
	);
	const leadDistance = getTurnLeadDistanceNm(legs, activeIndex, groundspeed);

	if (activeIndex < legs.length - 1 && distanceToActive <= leadDistance) {
		return activeIndex + 1;
	}

	if (distanceToActive > 50 && activeIndex === 0) {
		return getNearestLegIndex(position, legs);
	}

	return activeIndex;
}

function buildPredictions(
	plan: RoutePlanState,
	legs: BuiltRouteLeg[],
	indicatedAirspeed: number,
	groundspeed: number,
): Record<string, RouteLegConstraint> {
	const predictedSpeed = Math.round(indicatedAirspeed || groundspeed);

	const predictions = Object.fromEntries(
		legs.map((leg) => [
			leg.key,
			{
				speed: predictedSpeed || undefined,
				source: "PREDICTED",
			} satisfies RouteLegConstraint,
		]),
	);

	addAltitudePredictions(plan, legs, predictions);

	return predictions;
}

function getFixedAltitude(
	plan: RoutePlanState,
	leg: BuiltRouteLeg,
): number | null {
	const constraints = plan.legConstraints ?? {};

	if (Object.prototype.hasOwnProperty.call(constraints, leg.key)) {
		return constraints[leg.key]?.altitude ?? null;
	}

	return leg.leg.altitudeRestriction?.altitude ?? null;
}

function getLegLengthNm(leg: BuiltRouteLeg): number {
	return leg.previous ? getDistanceNm(leg.previous, leg.leg.waypoint) : 0;
}

function addAltitudePredictions(
	plan: RoutePlanState,
	legs: BuiltRouteLeg[],
	predictions: Record<string, RouteLegConstraint>,
): void {
	const restrictedIndexes = legs.flatMap((leg, index) =>
		getFixedAltitude(plan, leg) === null ? [] : [index],
	);

	for (let index = 0; index < restrictedIndexes.length - 1; index += 1) {
		const startIndex = restrictedIndexes[index];
		const endIndex = restrictedIndexes[index + 1];
		const unrestrictedCount = endIndex - startIndex - 1;

		if (unrestrictedCount < 1 || unrestrictedCount > 3) {
			continue;
		}

		const startAltitude = getFixedAltitude(plan, legs[startIndex]);
		const endAltitude = getFixedAltitude(plan, legs[endIndex]);

		if (startAltitude === null || endAltitude === null) {
			continue;
		}

		const totalDistance = legs
			.slice(startIndex + 1, endIndex + 1)
			.reduce((total, leg) => total + getLegLengthNm(leg), 0);

		if (totalDistance <= 0) {
			continue;
		}

		let distanceFromStart = 0;

		for (
			let middleIndex = startIndex + 1;
			middleIndex < endIndex;
			middleIndex += 1
		) {
			const leg = legs[middleIndex];
			distanceFromStart += getLegLengthNm(leg);
			const ratio = distanceFromStart / totalDistance;
			const altitude =
				startAltitude + (endAltitude - startAltitude) * ratio;

			predictions[leg.key] = {
				...predictions[leg.key],
				altitude: Math.round(altitude / 100) * 100,
				altitudeType: "AT",
				source: "PREDICTED",
			};
		}
	}
}

function toNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metersPerSecondToKnots(value: unknown): number {
	return toNumber(value) * METERS_PER_SECOND_TO_KNOTS;
}

const initialState: FmcState = {
	activeProgram: "MENU",
	pageIndex: 0,

	scratchpad: "",
	message: null,
	execPending: false,

	setup: {
		connectApiStatus: "DISCONNECTED",
		connectApiError: null,
		connectApiManifest: null,
		navigationDatabase: null,
		selectedAircraft: null,
	},

	aircraftSelect: {
		aircraft: [],
		status: "IDLE",
		error: null,
		returnProgram: null,
	},

	perfInit: {
		grossWeight: "",
		cruiseAltitude: "",
		costIndex: "",
		zeroFuelWeight: "",
		reserves: "",
		activeField: null,
	},

	route: {
		activeRoute: null,
		selectedRoute: 1,
		pendingVia: null,
		pendingViaRowIndex: null,
		plans: {
			1: {
				origin: "",
				destination: "",
				departureRunway: "",
				flightNumber: "",
				routeRequest: "",
				alternate: "",
				procedurePreview: {
					sid: null,
					star: null,
				},
				segments: [],
					structuredRoute: createEmptyStructuredRoute(),
					legConstraints: {},
					holds: [],
					isActive: false,
				},
			2: {
				origin: "",
				destination: "",
				departureRunway: "",
				flightNumber: "",
				routeRequest: "",
				alternate: "",
				procedurePreview: {
					sid: null,
					star: null,
				},
				segments: [],
					structuredRoute: createEmptyStructuredRoute(),
					legConstraints: {},
					holds: [],
					isActive: false,
				},
		},
	},

	depArr: {
		mode: "DEPARTURES",
		selectedDepartureRunway: "",
		departureRunways: [],
		departureSids: [],
		arrivalStars: [],
		arrivalApproaches: [],
		status: "IDLE",
		error: null,
	},

	legs: {
		pendingModification: null,
		position: null,
		magneticVariation: 0,
		groundspeed: 0,
		indicatedAirspeed: 0,
		trueAirspeed: 0,
		altitudeMsl: 0,
		headingMagnetic: 0,
		headingTrue: 0,
		crosswindComponent: 0,
		activeLegIndexByRoute: {
			1: 0,
			2: 0,
		},
		manualActiveLegByRoute: {
			1: false,
			2: false,
		},
		activeDistanceByRoute: {
			1: null,
			2: null,
		},
		predictionsByRoute: {
			1: {},
			2: {},
		},
	},

	hold: {
		draft: null,
		pendingInsertion: null,
		selectedHoldId: null,
	},
};

let state: FmcState = structuredClone(initialState);

const listeners = new Set<FmcListener>();

function notify(): void {
	for (const listener of listeners) {
		listener(state);
	}
}

function replaceState(nextState: FmcState): void {
	state = nextState;
	notify();
}

function updateState(
	update: Partial<FmcState> | ((state: Readonly<FmcState>) => FmcState),
): void {
	if (typeof update === "function") {
		replaceState(update(state));
		return;
	}

	replaceState({
		...state,
		...update,
	});
}

function showMessage(message: string): void {
	updateState({ message });
}

function setScratchpad(value: string): void {
	updateState({
		scratchpad: value.slice(0, 24),
		message: null,
	});
}

function appendScratchpad(value: string): void {
	if (state.scratchpad.length >= 24) {
		return;
	}

	setScratchpad(state.scratchpad + value);
}

function clearScratchpad(): void {
	if (state.message) {
		updateState({ message: null });
		return;
	}

	setScratchpad("");
}

function deleteScratchpadCharacter(): void {
	setScratchpad(state.scratchpad.slice(0, -1));
}

function setExecPending(pending: boolean): void {
	updateState({ execPending: pending });
}

const context: FmcProgramContext = {
	getState() {
		return state;
	},

	updateState,

	setProgram,

	setScratchpad,

	clearScratchpad,

	showMessage,

	setExecPending,

	services: {
		connectApi: connectApiService,
		navigationDatabase: navigationDatabaseService,
		aircraft: aircraftService,
		routeStorage: routeStorageService,
		system: systemService,
	},
};

let monitorPollInFlight = false;

async function pollAircraftMonitor(): Promise<void> {
	if (monitorPollInFlight) {
		return;
	}

	monitorPollInFlight = true;

	try {
		const [
			groundspeed,
			latitude,
			longitude,
			headingMagnetic,
			headingTrue,
			magneticVariation,
			indicatedAirspeed,
			trueAirspeed,
			altitudeMsl,
			crosswindComponent,
		] = await Promise.all([
			context.services.connectApi.get("aircraft/0/groundspeed"),
			context.services.connectApi.get("aircraft/0/latitude"),
			context.services.connectApi.get("aircraft/0/longitude"),
			context.services.connectApi.get("aircraft/0/heading_magnetic"),
			context.services.connectApi.get("aircraft/0/heading_true"),
			context.services.connectApi.get("aircraft/0/magnetic_variation"),
			context.services.connectApi.get("aircraft/0/indicated_airspeed"),
			context.services.connectApi.get("aircraft/0/true_airspeed"),
			context.services.connectApi.get("aircraft/0/altitude_msl"),
			context.services.connectApi.get("aircraft/0/crosswind_component"),
		]);
		const position =
			typeof latitude === "number" && typeof longitude === "number"
				? { latitude, longitude }
				: null;

		if (!position) {
			return;
		}

		const numericGroundspeed = metersPerSecondToKnots(groundspeed);
		const numericIndicatedAirspeed = metersPerSecondToKnots(indicatedAirspeed);
		const numericTrueAirspeed = metersPerSecondToKnots(trueAirspeed);
		const numericAltitudeMsl = toNumber(altitudeMsl);

		updateState((current) => {
			const nextActiveLegIndexByRoute = {
				...current.legs.activeLegIndexByRoute,
			};
			const nextActiveDistanceByRoute = {
				...current.legs.activeDistanceByRoute,
			};
			const nextPredictionsByRoute = {
				...current.legs.predictionsByRoute,
			};
			const nextManualActiveLegByRoute = {
				...current.legs.manualActiveLegByRoute,
			};
			const nextPlans = {
				...current.route.plans,
			};

			for (const routeNumber of [1, 2] as const) {
				const plan = nextPlans[routeNumber];
				const legs = buildRouteLegRows(plan);
				const sequencedActiveIndex = getNextActiveLegIndex(
					plan,
					position,
					legs,
					current.legs.activeLegIndexByRoute[routeNumber] ?? 0,
					numericGroundspeed,
				);
				const currentActiveIndex =
					current.legs.activeLegIndexByRoute[routeNumber] ?? 0;
				const isManualActive =
					current.legs.manualActiveLegByRoute[routeNumber] &&
					sequencedActiveIndex <= currentActiveIndex;
				const activeIndex = isManualActive
					? currentActiveIndex
					: sequencedActiveIndex;
				const activeHoldId = legs[activeIndex]?.holdId;

				if (activeHoldId && legs[activeIndex]?.leg.tracking?.type === "HOLD") {
					nextPlans[routeNumber] = {
						...plan,
						holds: (plan.holds ?? []).map((hold) =>
							hold.id === activeHoldId && !hold.ended
								? { ...hold, isActive: true }
								: hold,
						),
					};
				}

				nextActiveLegIndexByRoute[routeNumber] = activeIndex;
				nextManualActiveLegByRoute[routeNumber] = isManualActive;
				nextActiveDistanceByRoute[routeNumber] =
					legs[activeIndex] !== undefined
						? getDistanceNm(position, legs[activeIndex].leg.waypoint)
						: null;
				nextPredictionsByRoute[routeNumber] = buildPredictions(
					plan,
					legs,
					numericIndicatedAirspeed,
					numericGroundspeed,
				);
			}

			return {
				...current,
				route: {
					...current.route,
					plans: nextPlans,
				},
				legs: {
					...current.legs,
					position,
						groundspeed: numericGroundspeed,
						indicatedAirspeed: numericIndicatedAirspeed,
						trueAirspeed: numericTrueAirspeed,
						altitudeMsl: numericAltitudeMsl,
						headingMagnetic: toNumber(headingMagnetic),
					headingTrue: toNumber(headingTrue),
					magneticVariation: toNumber(magneticVariation),
					crosswindComponent: toNumber(crosswindComponent),
						activeLegIndexByRoute: nextActiveLegIndexByRoute,
						manualActiveLegByRoute: nextManualActiveLegByRoute,
						activeDistanceByRoute: nextActiveDistanceByRoute,
					predictionsByRoute: nextPredictionsByRoute,
				},
			};
		});
	} catch {
		// Monitoring resumes on the next tick once ConnectAPI is available.
	} finally {
		monitorPollInFlight = false;
	}
}

setInterval(() => {
	void pollAircraftMonitor();
}, FMC_MONITOR_INTERVAL_MS);

function setProgram(programId: FmcProgramId): void {
	const currentProgram = getProgram(state.activeProgram);
	const nextProgram = getProgram(programId);

	currentProgram.onExit?.(context);

	updateState({
		activeProgram: programId,
		pageIndex: 0,
		message: null,
	});

	nextProgram.onEnter?.(context);
}

function processPlusMinus(): void {
	const value = Number(state.scratchpad);

	if (state.scratchpad.trim() === "" || !Number.isFinite(value)) {
		showMessage("INVALID NUMBER");
		return;
	}

	setScratchpad(String(-value));
}

async function processExec(): Promise<void> {
	const program = getProgram(state.activeProgram);

	if (await program.onExec?.(context)) {
		return;
	}

	if (!state.execPending) {
		showMessage("NOTHING TO EXECUTE");
		return;
	}

	updateState({
		execPending: false,
		message: "MOD EXECUTED",
	});
}

function processGlobalNavigation(key: FmcKey): boolean {
	if (key === "DEP_ARR") {
		if (state.activeProgram === "DEP_ARR") {
			updateState((current) => ({
				...current,
				pageIndex: 0,
				depArr: {
					...current.depArr,
					mode:
						current.depArr.mode === "DEPARTURES" ? "ARRIVALS" : "DEPARTURES",
				},
			}));
			getProgram("DEP_ARR").onEnter?.(context);
			return true;
		}

		updateState((current) => ({
			...current,
			depArr: {
				...current.depArr,
				mode: "DEPARTURES",
			},
		}));
		setProgram("DEP_ARR");
		return true;
	}

	const destinations: Partial<Record<FmcKey, FmcProgramId>> = {
		INIT_REF: "MENU",
		MENU: "MENU",
		RTE: "RTE",
		LEGS: "LEGS",
		HOLD: "HOLD",
		/*PROG: "PROG",
		MENU: "MENU",*/
	};

	const destination = destinations[key];

	if (!destination) {
		return false;
	}

	setProgram(destination);
	return true;
}

async function processSharedKey(key: FmcKey): Promise<boolean> {
	if (/^[A-Z0-9]$/.test(key)) {
		appendScratchpad(key);
		return true;
	}

	switch (key) {
		case "SP":
			appendScratchpad(" ");
			return true;

		case "DOT":
			appendScratchpad(".");
			return true;

		case "SLASH":
			appendScratchpad("/");
			return true;

		case "PLUS_MINUS":
			processPlusMinus();
			return true;

		case "CLR":
			clearScratchpad();
			return true;

		case "DEL":
			deleteScratchpadCharacter();
			return true;

		case "PREV_PAGE":
			updateState({
				pageIndex: Math.max(0, state.pageIndex - 1),
			});
			return true;

		case "NEXT_PAGE": {
			const program = getProgram(state.activeProgram);

			const pageCount = program.getPageCount?.(state) ?? 1;

			updateState({
				pageIndex: Math.min(pageCount - 1, state.pageIndex + 1),
			});

			return true;
		}

		case "EXEC":
			await processExec();
			return true;

		default:
			return false;
	}
}

export function getFmcState(): Readonly<FmcState> {
	return state;
}

export function subscribeFmc(listener: FmcListener): () => void {
	listeners.add(listener);
	listener(state);

	return () => {
		listeners.delete(listener);
	};
}

export async function pressFmcKey(key: FmcKey): Promise<void> {
	if (processGlobalNavigation(key)) {
		return;
	}

	const activeProgram = getProgram(state.activeProgram);

	const handledByProgram = await activeProgram.handleKey?.(key, context);

	if (handledByProgram) {
		return;
	}

	if (await processSharedKey(key)) {
		return;
	}

	showMessage(`${key.replaceAll("_", " ")} NOT IMPLEMENTED`);
}

export function renderFmcScreen(current: Readonly<FmcState>): FmcScreenModel {
	const program = getProgram(current.activeProgram);

	const rendered = program.render(current);

	return {
		...rendered,
		scratchpad: current.message ?? current.scratchpad,
		execLight: current.execPending,
	};
}
