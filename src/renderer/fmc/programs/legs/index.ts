import {
	createFmcProgram,
	type FmcProgramApi,
	type FmcSdkSlot,
} from "../../sdk";
import type {
	FmcState,
	RouteAltitudeRestrictionType,
	RouteLegConstraint,
	RoutePlanState,
	RouteProcedureLeg,
} from "../../types";
import { buildRouteLegRows, type BuiltRouteLeg } from "../../route-leg-builder";

const LEGS_PER_PAGE = 5;
const EARTH_RADIUS_NM = 3440.065;
const DELETE_COMMAND = "DELETE";

function getRoutePlan(state: Readonly<FmcState>): RoutePlanState {
	return state.route.plans[state.route.selectedRoute];
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
		Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);

	return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

function formatTrack(value: number): string {
	return `${String(Math.round(normalizeDegrees(value))).padStart(3, "0")}°M`;
}

function formatDistance(distance: number): string {
	if (distance >= 100) {
		return `${Math.round(distance)}NM`;
	}

	return `${distance.toFixed(1)}NM`;
}

function formatAltitude(altitude: number): string {
	if (altitude >= 18000 && altitude % 100 === 0) {
		return `FL${String(Math.round(altitude / 100)).padStart(3, "0")}`;
	}

	return String(altitude);
}

function formatConstraint(constraint: RouteLegConstraint | null): string {
	if (!constraint) {
		return "-----/-----";
	}

	const speed = constraint.speed ? String(constraint.speed) : "---";
	let altitude = "-----";

	if (constraint.altitude) {
		const suffix =
			constraint.altitudeType === "AT_OR_ABOVE"
				? "A"
				: constraint.altitudeType === "AT_OR_BELOW"
					? "B"
					: "";
		altitude = `${formatAltitude(constraint.altitude)}${suffix}`;
	}

	return `${speed} / ${altitude}`;
}

function getProcedureConstraint(
	leg: RouteProcedureLeg,
): RouteLegConstraint | null {
	if (!leg.altitudeRestriction) {
		return null;
	}

	const typeByRestriction = {
		AT: "AT",
		AT_OR_ABOVE: "AT_OR_ABOVE",
		AT_OR_BELOW: "AT_OR_BELOW",
		BETWEEN: "AT",
	} satisfies Record<string, RouteAltitudeRestrictionType>;

	return {
		altitude: leg.altitudeRestriction.altitude,
		altitudeType: typeByRestriction[leg.altitudeRestriction.type],
		source: "PROCEDURE",
	};
}

function getLegRows(plan: RoutePlanState): BuiltRouteLeg[] {
	return buildRouteLegRows(plan);
}

function getActiveLegIndex(api: FmcProgramApi, rows: BuiltRouteLeg[]): number {
	if (rows.length === 0) {
		return 0;
	}

	return Math.max(
		0,
		Math.min(
			api.store.legs.activeLegIndexByRoute[api.store.route.selectedRoute],
			rows.length - 1,
		),
	);
}

function getConstraint(
	api: FmcProgramApi,
	plan: RoutePlanState,
	row: BuiltRouteLeg,
): RouteLegConstraint | null {
	const pending = api.store.legs.pendingModification;

	if (
		pending &&
		pending.route === api.store.route.selectedRoute &&
		pending.legKey === row.key
	) {
		return pending.constraint;
	}

	const constraints = plan.legConstraints ?? {};
	const predicted =
		api.store.legs.predictionsByRoute[api.store.route.selectedRoute][row.key] ??
		null;

	if (Object.prototype.hasOwnProperty.call(constraints, row.key)) {
		return constraints[row.key] ?? predicted;
	}

	return getProcedureConstraint(row.leg) ?? predicted;
}

function parseAltitude(value: string): {
	altitude: number;
	altitudeType: RouteAltitudeRestrictionType;
} | null {
	const match = value.match(/^(?:FL)?(\d{1,5})([AB])?$/);

	if (!match) {
		return null;
	}

	const altitude = value.startsWith("FL")
		? Number(match[1]) * 100
		: Number(match[1]);

	if (!Number.isFinite(altitude) || altitude <= 0) {
		return null;
	}

	return {
		altitude,
		altitudeType:
			match[2] === "A"
				? "AT_OR_ABOVE"
				: match[2] === "B"
					? "AT_OR_BELOW"
					: "AT",
	};
}

function parseConstraintEntry(
	value: string,
	existing: RouteLegConstraint | null,
): RouteLegConstraint | null {
	const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
	const match = normalized.match(/^(\d{1,3})?\/((?:FL)?\d{1,5}[AB]?)?$/);

	if (!match) {
		return null;
	}

	const speed = match[1] ? Number(match[1]) : undefined;
	const altitudeText = match[2] ?? "";
	const altitude = altitudeText ? parseAltitude(altitudeText) : null;

	if (speed && !altitude && !existing?.altitude) {
		return null;
	}

	if (speed && (speed < 50 || speed > 399)) {
		return null;
	}

	return {
		speed: speed ?? existing?.speed,
		altitude: altitude?.altitude ?? existing?.altitude,
		altitudeType: altitude?.altitudeType ?? existing?.altitudeType ?? "AT",
		source: "MANUAL",
	};
}

function setPendingModification(
	api: FmcProgramApi,
	row: BuiltRouteLeg,
	constraint: RouteLegConstraint | null,
): void {
	api.updateStore((current) => ({
		...current,
		legs: {
			...current.legs,
			pendingModification: {
				route: current.route.selectedRoute,
				legKey: row.key,
				constraint,
			},
		},
	}));
	api.setExecPending(true);
	api.setScratchpad("");
}

function setConstraint(api: FmcProgramApi, row: BuiltRouteLeg): void {
	const plan = getRoutePlan(api.store);

	if (api.scratchpad.trim().toUpperCase() === DELETE_COMMAND) {
		setPendingModification(api, row, null);
		api.showMessage("DELETE PENDING");
		return;
	}

	const existing = getConstraint(api, plan, row);
	const constraint = parseConstraintEntry(api.scratchpad, existing);

	if (!constraint || (constraint.speed && !constraint.altitude)) {
		api.showMessage("INVALID RESTR");
		return;
	}

	setPendingModification(api, row, constraint);
	api.showMessage("MOD PENDING");
}

function erasePending(api: FmcProgramApi): void {
	api.updateStore((current) => ({
		...current,
		legs: {
			...current.legs,
			pendingModification: null,
		},
	}));
	api.setExecPending(false);
	api.showMessage("MOD ERASED");
}

function setSelectedRoute(api: FmcProgramApi, routeNumber: 1 | 2): void {
	api.updateStore((current) => ({
		...current,
		pageIndex: 0,
		route: {
			...current.route,
			selectedRoute: routeNumber,
		},
		legs: {
			...current.legs,
			pendingModification: null,
		},
	}));
	api.setExecPending(false);
}

function insertPendingHold(api: FmcProgramApi, row: BuiltRouteLeg): boolean {
	const pendingHold = api.store.hold.pendingInsertion;

	if (!pendingHold) {
		return false;
	}

	const selectedRoute = api.store.route.selectedRoute;

	api.updateStore((current) => {
		const plan = current.route.plans[selectedRoute];
		const hold = {
			...pendingHold,
			route: selectedRoute,
			insertionAfterLegKey: row.key,
		};

		return {
			...current,
			message: `${hold.fixName} HOLD INSERTED`,
			hold: {
				...current.hold,
				pendingInsertion: null,
				selectedHoldId: hold.id,
			},
			route: {
				...current.route,
				plans: {
					...current.route.plans,
					[selectedRoute]: {
						...plan,
						holds: [...(plan.holds ?? []), hold],
						isActive: false,
					},
				},
			},
		};
	});

	return true;
}

function deleteHold(api: FmcProgramApi, row: BuiltRouteLeg): boolean {
	if (!isDeleteCommand(api.scratchpad) || !row.holdId) {
		return false;
	}

	const selectedRoute = api.store.route.selectedRoute;

	api.setScratchpad("");
	api.updateStore((current) => {
		const plan = current.route.plans[selectedRoute];

		return {
			...current,
			message: "HOLD DELETED",
			hold: {
				...current.hold,
				selectedHoldId:
					current.hold.selectedHoldId === row.holdId
						? null
						: current.hold.selectedHoldId,
			},
			route: {
				...current.route,
				plans: {
					...current.route.plans,
					[selectedRoute]: {
						...plan,
						holds: (plan.holds ?? []).filter(
							(hold) => hold.id !== row.holdId,
						),
						isActive: false,
					},
				},
			},
		};
	});
	return true;
}

function setActiveLeg(api: FmcProgramApi, row: BuiltRouteLeg): void {
	if (deleteHold(api, row)) {
		return;
	}

	if (insertPendingHold(api, row)) {
		return;
	}

	const selectedRoute = api.store.route.selectedRoute;

	api.updateStore((current) => ({
		...current,
		legs: {
			...current.legs,
			activeLegIndexByRoute: {
				...current.legs.activeLegIndexByRoute,
				[selectedRoute]: row.index,
			},
			manualActiveLegByRoute: {
				...current.legs.manualActiveLegByRoute,
				[selectedRoute]: true,
			},
			activeDistanceByRoute: {
				...current.legs.activeDistanceByRoute,
				[selectedRoute]: current.legs.position
					? getDistanceNm(current.legs.position, row.leg.waypoint)
					: current.legs.activeDistanceByRoute[selectedRoute],
			},
		},
	}));
	api.showMessage(`${row.name} ACTIVE`);
}

function isDeleteCommand(value: string): boolean {
	return value.trim().toUpperCase() === DELETE_COMMAND;
}

export const legsProgram = createFmcProgram({
	id: "LEGS",

	pages(api) {
		const rows = getLegRows(getRoutePlan(api.store));
		const pageCount = Math.max(1, Math.ceil(rows.length / LEGS_PER_PAGE));

		return Array.from({ length: pageCount }, (_, pageIndex) => ({
			title: `RTE ${api.store.route.selectedRoute} LEGS`,
			page: `${pageIndex + 1}/${pageCount}`,
			slots(slotApi) {
				const plan = getRoutePlan(slotApi.store);
				const currentRows = getLegRows(plan);
				const activeIndex = getActiveLegIndex(slotApi, currentRows);
				const visibleRows = currentRows.slice(
					pageIndex * LEGS_PER_PAGE,
					pageIndex * LEGS_PER_PAGE + LEGS_PER_PAGE,
				);
				const slots: FmcSdkSlot[] = visibleRows.map((row) => {
					const isActive = row.index === activeIndex;
					const from =
						isActive && slotApi.store.legs.position
							? slotApi.store.legs.position
							: row.previous;
					const distance = from
						? isActive &&
							slotApi.store.legs.activeDistanceByRoute[
								slotApi.store.route.selectedRoute
							] !== null
							? slotApi.store.legs.activeDistanceByRoute[
									slotApi.store.route.selectedRoute
								]!
							: getDistanceNm(from, row.leg.waypoint)
						: 0;
					const track = row.holdId
						? "HOLD AT"
						: from
							? formatTrack(
									getBearingDegrees(from, row.leg.waypoint) -
										slotApi.store.legs.magneticVariation,
								)
							: "-----";
					const constraint = getConstraint(slotApi, plan, row);
					const pending =
						slotApi.store.legs.pendingModification?.route ===
							slotApi.store.route.selectedRoute &&
						slotApi.store.legs.pendingModification.legKey === row.key;

					return {
						labelLeft: track,
						labelCenter: formatDistance(distance),
						valueLeft: row.name,
						valueRight: formatConstraint(constraint),
						colorLeft: isActive ? "magenta" : undefined,
						colorRight: pending ? "amber" : undefined,
						sizeRight: constraint?.source === "PREDICTED" ? "small" : undefined,
						onLeft: () => setActiveLeg(slotApi, row),
						onRight: () => setConstraint(slotApi, row),
					};
				});
				const otherRoute = slotApi.store.route.selectedRoute === 1 ? 2 : 1;
				const hasPending = Boolean(slotApi.store.legs.pendingModification);

				while (slots.length < LEGS_PER_PAGE) {
					slots.push({});
				}

				slots.push({
					valueLeft: hasPending ? "<ERASE" : `<RTE ${otherRoute}`,
					onLeft: () =>
						hasPending
							? erasePending(slotApi)
							: setSelectedRoute(slotApi, otherRoute),
				});

				return slots;
			},
		}));
	},

	onKey(key, api) {
		if (key !== "DEL") {
			return false;
		}

		if (api.scratchpad.trim() !== "") {
			return false;
		}

		api.setScratchpad(DELETE_COMMAND);
		return true;
	},

	onExec(api) {
		const pending = api.store.legs.pendingModification;

		if (!pending) {
			return false;
		}

		api.updateStore((current) => {
			const plan = current.route.plans[pending.route];
			const nextConstraints = { ...(plan.legConstraints ?? {}) };

			nextConstraints[pending.legKey] = pending.constraint;

			return {
				...current,
				execPending: false,
				message: "MOD EXECUTED",
				legs: {
					...current.legs,
					pendingModification: null,
				},
				route: {
					...current.route,
					plans: {
						...current.route.plans,
						[pending.route]: {
							...plan,
							legConstraints: nextConstraints,
							isActive: false,
						},
					},
				},
			};
		});

		return true;
	},
});
