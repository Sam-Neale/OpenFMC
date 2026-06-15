import {
	createFmcProgram,
	type FmcProgramApi,
	type FmcSdkSlot,
} from "../../sdk";
import { buildRouteLegRows } from "../../route-leg-builder";
import type {
	FmcState,
	RouteAltitudeRestrictionType,
	RouteHold,
	RouteHoldTurnDirection,
	RoutePlanState,
	RoutePointReference,
	RouteWaypoint,
} from "../../types";

const HOLD_SELECTION_ROWS = 5;
const DEFAULT_HOLD_TIME_MINUTES = 1;
const EARTH_RADIUS_NM = 3440.065;
const DELETE_COMMAND = "DELETE";

function getRoutePlan(state: Readonly<FmcState>): RoutePlanState {
	return state.route.plans[state.route.selectedRoute];
}

function normalizeIdentifier(value: string): string {
	return value.trim().toUpperCase();
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
		2 *
		EARTH_RADIUS_NM *
		Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
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
		Math.sin(fromLatitude) *
			Math.cos(toLatitude) *
			Math.cos(longitudeDelta);

	return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

function formatCourse(value: number): string {
	return `${String(Math.round(normalizeDegrees(value))).padStart(3, "0")}°`;
}

function formatAltitude(altitude: number): string {
	if (altitude >= 18000) {
		return `FL${String(Math.round(altitude / 100)).padStart(3, "0")}`;
	}

	return String(Math.round(altitude));
}

function formatSpeedAltitude(hold: RouteHold): string {
	const speed = hold.speed ? String(hold.speed) : "---";
	const altitude = hold.altitude ? formatAltitude(hold.altitude) : "-----";

	return `${speed}/${altitude}`;
}

function parseAltitude(value: string): {
	altitude: number;
	altitudeType: RouteAltitudeRestrictionType;
} | null {
	const match = value.match(/^(?:FL)?(\d{1,5})([AB])?$/);

	if (!match) {
		return null;
	}

	return {
		altitude: value.startsWith("FL") ? Number(match[1]) * 100 : Number(match[1]),
		altitudeType:
			match[2] === "A"
				? "AT_OR_ABOVE"
				: match[2] === "B"
					? "AT_OR_BELOW"
					: "AT",
	};
}

function formatCoordinateName(waypoint: RouteWaypoint): string {
	const latitudeHemisphere = waypoint.latitude >= 0 ? "N" : "S";
	const longitudeHemisphere = waypoint.longitude >= 0 ? "E" : "W";
	const latitude = String(Math.round(Math.abs(waypoint.latitude))).padStart(
		2,
		"0",
	);
	const longitude = String(Math.round(Math.abs(waypoint.longitude))).padStart(
		3,
		"0",
	);

	return `${latitudeHemisphere}${latitude}${longitudeHemisphere}${longitude}`;
}

function createHoldId(): string {
	return `HOLD-${Date.now().toString(36).toUpperCase()}`;
}

function getActiveReference(api: FmcProgramApi): RoutePointReference {
	const plan = getRoutePlan(api.store);
	const rows = buildRouteLegRows(plan);
	const activeRow =
		rows[api.store.legs.activeLegIndexByRoute[api.store.route.selectedRoute]];

	if (activeRow) {
		return {
			identifier: activeRow.name,
			latitude: activeRow.leg.waypoint.latitude,
			longitude: activeRow.leg.waypoint.longitude,
		};
	}

	return api.store.legs.position ?? { identifier: plan.origin };
}

function getRouteRowForFix(plan: RoutePlanState, fixName: string) {
	return buildRouteLegRows(plan).find(
		(row) => row.name.toUpperCase() === fixName,
	);
}

function getLegDistanceNm(api: FmcProgramApi): number {
	return api.store.legs.groundspeed > 0
		? api.store.legs.groundspeed / 60
		: 4;
}

function createHoldDraft(
	api: FmcProgramApi,
	kind: RouteHold["kind"],
	fixName: string,
	waypoint: RouteWaypoint,
): RouteHold {
	const position = api.store.legs.position;
	const inboundCourse = position
		? getBearingDegrees(position, waypoint)
		: api.store.legs.headingMagnetic;

	return {
		id: createHoldId(),
		route: api.store.route.selectedRoute,
		kind,
		fixName,
		waypoint,
		inboundCourse,
		turnDirection: "R",
		legTimeMinutes: DEFAULT_HOLD_TIME_MINUTES,
		legDistanceNm: getLegDistanceNm(api),
		speed: Math.round(
			api.store.legs.indicatedAirspeed || api.store.legs.groundspeed,
		),
		altitude: Math.round(api.store.legs.altitudeMsl / 100) * 100 || undefined,
		altitudeType: "AT",
		insertionAfterLegKey: null,
		isActive: false,
		ended: false,
	};
}

function setDraft(api: FmcProgramApi, draft: RouteHold): void {
	api.updateStore((current) => ({
		...current,
		pageIndex: 0,
		hold: {
			...current.hold,
			draft,
			selectedHoldId: draft.id,
		},
	}));
	api.setExecPending(true);
	api.setScratchpad("");
}

function updateEditableHold(
	api: FmcProgramApi,
	update: (hold: RouteHold) => RouteHold,
): boolean {
	const draft = api.store.hold.draft;
	const pendingInsertion = api.store.hold.pendingInsertion;

	if (!draft && !pendingInsertion) {
		const hold = getDisplayedHold(api);

		if (!hold) {
			api.showMessage("NO HOLD");
			return false;
		}

		if (hold.isActive) {
			api.showMessage("HOLD ACTIVE");
			return false;
		}

		const selectedRoute = api.store.route.selectedRoute;

		api.updateStore((current) => {
			const plan = current.route.plans[selectedRoute];

			return {
				...current,
				route: {
					...current.route,
					plans: {
						...current.route.plans,
						[selectedRoute]: {
							...plan,
							holds: (plan.holds ?? []).map((candidate) =>
								candidate.id === hold.id ? update(candidate) : candidate,
							),
						},
					},
				},
			};
		});
		api.setScratchpad("");
		api.showMessage("HOLD UPDATED");
		return true;
	}

	api.updateStore((current) => ({
		...current,
		hold: {
			...current.hold,
			draft: current.hold.draft ? update(current.hold.draft) : null,
			pendingInsertion: current.hold.pendingInsertion
				? update(current.hold.pendingInsertion)
				: null,
		},
	}));
	api.setExecPending(Boolean(draft));
	api.setScratchpad("");
	api.showMessage("HOLD UPDATED");
	return true;
}

function setCourseDirection(api: FmcProgramApi): void {
	const value = normalizeIdentifier(api.scratchpad);
	const match = value.match(/^(\d{1,3})(?:\/?([LR]))?$/);

	if (!match) {
		api.showMessage("INVALID CRS");
		return;
	}

	const course = Number(match[1]);

	if (!Number.isFinite(course) || course > 360) {
		api.showMessage("INVALID CRS");
		return;
	}

	updateEditableHold(api, (hold) => ({
		...hold,
		inboundCourse: course,
		turnDirection: (match[2] as RouteHoldTurnDirection | undefined) ?? "R",
	}));
}

function setLegTime(api: FmcProgramApi): void {
	if (api.scratchpad.trim().toUpperCase() === DELETE_COMMAND) {
		const hold = getDisplayedHold(api);

		if (!hold?.legDistanceNm) {
			api.showMessage("TIME OR DIST REQ");
			return;
		}

		updateEditableHold(api, (currentHold) => ({
			...currentHold,
			legTimeMinutes: undefined,
		}));
		return;
	}

	const time = Number(api.scratchpad.trim());

	if (!Number.isFinite(time) || time <= 0 || time > 9.9) {
		api.showMessage("INVALID TIME");
		return;
	}

	updateEditableHold(api, (hold) => ({
		...hold,
		legTimeMinutes: Math.round(time * 10) / 10,
	}));
}

function setLegDistance(api: FmcProgramApi): void {
	if (api.scratchpad.trim().toUpperCase() === DELETE_COMMAND) {
		const hold = getDisplayedHold(api);

		if (!hold?.legTimeMinutes) {
			api.showMessage("TIME OR DIST REQ");
			return;
		}

		updateEditableHold(api, (currentHold) => ({
			...currentHold,
			legDistanceNm: undefined,
		}));
		return;
	}

	const distance = Number(api.scratchpad.trim());

	if (!Number.isFinite(distance) || distance <= 0 || distance > 99.9) {
		api.showMessage("INVALID DIST");
		return;
	}

	updateEditableHold(api, (hold) => ({
		...hold,
		legDistanceNm: Math.round(distance * 10) / 10,
	}));
}

function setSpeedAltitude(api: FmcProgramApi): void {
	const value = normalizeIdentifier(api.scratchpad);
	const match = value.match(/^(\d{1,3})?\/((?:FL)?\d{1,5}[AB]?)?$/);

	if (!match) {
		api.showMessage("INVALID RESTR");
		return;
	}

	const speed = match[1] ? Number(match[1]) : undefined;
	const altitude = match[2] ? parseAltitude(match[2]) : null;

	if (speed && (speed < 50 || speed > 399)) {
		api.showMessage("INVALID SPEED");
		return;
	}

	updateEditableHold(api, (hold) => ({
		...hold,
		speed: speed ?? hold.speed,
		altitude: altitude?.altitude ?? hold.altitude,
		altitudeType: altitude?.altitudeType ?? hold.altitudeType,
	}));
}

async function holdAtTypedWaypoint(api: FmcProgramApi): Promise<void> {
	const fixName = normalizeIdentifier(api.scratchpad);

	if (!fixName) {
		api.showMessage("ENTER FIX");
		return;
	}

	const plan = getRoutePlan(api.store);
	const routeRow = getRouteRowForFix(plan, fixName);

	if (routeRow) {
		setDraft(
			api,
			createHoldDraft(api, "ON_ROUTE", routeRow.name, routeRow.leg.waypoint),
		);
		return;
	}

	const fix = await api.services.navigationDatabase.resolveWaypointForRoute(
		fixName,
		getActiveReference(api),
	);

	if (!fix) {
		api.showMessage("FIX NOT IN DB");
		return;
	}

	setDraft(api, createHoldDraft(api, "OFF_ROUTE", fixName, fix.waypoint));
}

function holdAtPresentPosition(api: FmcProgramApi): void {
	const position = api.store.legs.position;

	if (!position) {
		api.showMessage("NO POSITION");
		return;
	}

	const waypoint = {
		latitude: position.latitude,
		longitude: position.longitude,
		name: "PPOS",
	};

	setDraft(
		api,
		createHoldDraft(api, "PPOS", formatCoordinateName(waypoint), waypoint),
	);
}

function getDisplayedHold(api: FmcProgramApi): RouteHold | null {
	const plan = getRoutePlan(api.store);

	return (
		api.store.hold.draft ??
		(api.store.hold.pendingInsertion?.route === api.store.route.selectedRoute
			? api.store.hold.pendingInsertion
			: null) ??
		(plan.holds ?? []).find(
			(hold) => hold.id === api.store.hold.selectedHoldId,
		) ??
		(plan.holds ?? []).find((hold) => !hold.ended) ??
		(plan.holds ?? [])[0] ??
		null
	);
}

function formatEta(api: FmcProgramApi, hold: RouteHold): string {
	const position = api.store.legs.position;
	const groundspeed = api.store.legs.groundspeed;

	if (!position || groundspeed <= 0) {
		return "----";
	}

	const minutes = (getDistanceNm(position, hold.waypoint) / groundspeed) * 60;
	const eta = new Date(Date.now() + minutes * 60_000);

	return `${String(eta.getUTCHours()).padStart(2, "0")}${String(
		eta.getUTCMinutes(),
	).padStart(2, "0")}Z`;
}

function eraseHold(api: FmcProgramApi): void {
	api.updateStore((current) => ({
		...current,
		execPending: false,
		hold: {
			...current.hold,
			draft: null,
			pendingInsertion: null,
		},
	}));
	api.setProgram("LEGS");
}

function endHold(api: FmcProgramApi, hold: RouteHold): void {
	const selectedRoute = api.store.route.selectedRoute;
	const rows = buildRouteLegRows(getRoutePlan(api.store));
	const holdIndex = rows.findIndex((row) => row.holdId === hold.id);

	api.updateStore((current) => {
		const plan = current.route.plans[selectedRoute];

		return {
			...current,
			route: {
				...current.route,
				plans: {
					...current.route.plans,
					[selectedRoute]: {
						...plan,
						holds: (plan.holds ?? []).map((candidate) =>
							candidate.id === hold.id
								? { ...candidate, ended: true }
								: candidate,
						),
					},
				},
			},
			legs: {
				...current.legs,
				activeLegIndexByRoute: {
					...current.legs.activeLegIndexByRoute,
					[selectedRoute]: Math.min(holdIndex + 1, rows.length - 1),
				},
				manualActiveLegByRoute: {
					...current.legs.manualActiveLegByRoute,
					[selectedRoute]: false,
				},
			},
		};
	});
	api.showMessage("HOLD ENDED");
	api.setProgram("LEGS");
}

function createSelectionSlots(api: FmcProgramApi, pageIndex: number): FmcSdkSlot[] {
	const rows = buildRouteLegRows(getRoutePlan(api.store)).slice(
		pageIndex * HOLD_SELECTION_ROWS,
		pageIndex * HOLD_SELECTION_ROWS + HOLD_SELECTION_ROWS,
	);
	const slots: FmcSdkSlot[] = rows.map((row) => ({
		labelLeft: row.name,
		labelCenter: row.previous ? "LEG" : undefined,
		valueLeft: row.name,
	}));

	while (slots.length < HOLD_SELECTION_ROWS) {
		slots.push({});
	}

	slots.push({
		labelCenter: "----HOLD AT-----",
		valueLeft: normalizeIdentifier(api.scratchpad) || "[][][][][][]",
		valueRight: "PPOS>",
		onLeft: () => holdAtTypedWaypoint(api),
		onRight: () => holdAtPresentPosition(api),
	});

	return slots;
}

function createExpandedSlots(api: FmcProgramApi): FmcSdkSlot[] {
	const hold = getDisplayedHold(api);

	if (!hold) {
		return createSelectionSlots(api, 0);
	}

	return [
		{
			labelLeft: "FIX",
			valueLeft: hold.fixName,
			labelRight: "SPD/TGT ALT",
			valueRight: formatSpeedAltitude(hold),
			onRight: () => setSpeedAltitude(api),
		},
		{
			labelRight: "FIX ETA",
			valueRight: formatEta(api, hold),
		},
		{
			labelLeft: "INBD CRS/DIR",
			valueLeft: `${formatCourse(hold.inboundCourse)}/${hold.turnDirection} TURN`,
			onLeft: () => setCourseDirection(api),
		},
		{
			labelLeft: "LEG TIME",
			valueLeft:
				hold.legTimeMinutes !== undefined
					? `${hold.legTimeMinutes.toFixed(1)} MIN`
					: "----",
			onLeft: () => setLegTime(api),
		},
		{
			labelLeft: "LEG DIST",
			valueLeft:
				hold.legDistanceNm !== undefined
					? `${hold.legDistanceNm.toFixed(1)} NM`
					: "----",
			onLeft: () => setLegDistance(api),
		},
		{
			valueLeft: "<ERASE",
			valueRight:
				hold.insertionAfterLegKey && !hold.ended ? "END HOLD>" : undefined,
			onLeft: () => eraseHold(api),
			onRight: () =>
				hold.insertionAfterLegKey && !hold.ended
					? endHold(api, hold)
					: undefined,
		},
	];
}

export const holdProgram = createFmcProgram({
	id: "HOLD",

	pages(api) {
		const plan = getRoutePlan(api.store);
		const rows = buildRouteLegRows(plan);
		const pageCount = Math.max(
			1,
			Math.ceil(rows.length / HOLD_SELECTION_ROWS),
		);
		const shouldShowExpanded = Boolean(
			api.store.hold.draft ??
				api.store.hold.pendingInsertion ??
				(plan.holds ?? []).length,
		);

		if (shouldShowExpanded) {
			return [
				{
					title: `RTE ${api.store.route.selectedRoute} HOLD`,
					page: "1/1",
					slots: createExpandedSlots,
				},
			];
		}

		return Array.from({ length: pageCount }, (_, pageIndex) => ({
			title: `RTE ${api.store.route.selectedRoute} HOLD`,
			page: `${pageIndex + 1}/${pageCount}`,
			slots: (slotApi) => createSelectionSlots(slotApi, pageIndex),
		}));
	},

	onKey(key, api) {
		if (key !== "DEL" || api.scratchpad.trim() !== "") {
			return false;
		}

		api.setScratchpad(DELETE_COMMAND);
		return true;
	},

	onExec(api) {
		const draft = api.store.hold.draft;

		if (!draft) {
			return false;
		}

		api.updateStore((current) => ({
			...current,
			execPending: false,
			message: "SELECT HOLD POS",
			hold: {
				...current.hold,
				draft: null,
				pendingInsertion: draft,
				selectedHoldId: draft.id,
			},
		}));
		api.setProgram("LEGS");

		return true;
	},
});
