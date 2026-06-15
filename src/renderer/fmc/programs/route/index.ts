import {
	createFmcProgram,
	type FmcProgramApi,
	type FmcSdkPage,
	type FmcSdkSlot,
} from "../../sdk";
import type {
	FmcState,
	RouteProcedureLeg,
	RoutePlanState,
	RoutePointReference,
	RouteSegment,
	StructuredRoute,
} from "../../types";
import { buildRouteLegRows } from "../../route-leg-builder";

const ROUTE_ROWS_PER_PAGE = 5;
const DIRECT = "DIRECT";
const IF_POSITION_MISMATCH_THRESHOLD_NM = 750;
const IF_NAMED_FIX_RETRY_TIMEOUT_MS = 20_000;
const IF_NAMED_FIX_RETRY_INTERVAL_MS = 500;
const EARTH_RADIUS_NM = 3440.065;

interface RouteDisplayRow {
	via: string;
	to: string;
	segmentIndex: number | null;
	displayIndex: number;
	disabled?: boolean;
}

interface FlightPlanPoint {
	name: string;
	token: string;
	latitude: number | null;
	longitude: number | null;
}

interface IfFlightPlanItem {
	identifier?: string | null;
	Identifier?: string | null;
	name?: string | null;
	Name?: string | null;
	location?: {
		Latitude?: number;
		Longitude?: number;
		latitude?: number;
		longitude?: number;
	};
	Location?: {
		Latitude?: number;
		Longitude?: number;
		latitude?: number;
		longitude?: number;
	};
}

interface IfFlightPlanFullInfo {
	detailedInfo?: {
		flightPlanItems?: IfFlightPlanItem[];
		waypoints?: string[];
	};
	DetailedInfo?: {
		FlightPlanItems?: IfFlightPlanItem[];
		Waypoints?: string[];
	};
}

interface LoadFlightPlanResult {
	correctedCount: number;
	retryCount: number;
}

interface IfFlightPlanProblems {
	missingIndexes: Set<number>;
	mismatchedIndexes: Set<number>;
}

function normalizeIdentifier(value: string): string {
	return value.trim().toUpperCase();
}

function normalizeRunway(value: string): string {
	const normalized = normalizeIdentifier(value);

	return normalized.startsWith("RW") ? normalized : `RW${normalized}`;
}

function getRoutePlan(state: Readonly<FmcState>): RoutePlanState {
	return state.route.plans[state.route.selectedRoute];
}

function displayValue(value: string, placeholder: string): string {
	return value.trim() || placeholder;
}

function formatDegreesMinutes(
	value: number,
	degreeWidth: number,
	hemispheres: [string, string],
): string {
	const hemisphere = value >= 0 ? hemispheres[0] : hemispheres[1];
	const absoluteValue = Math.abs(value);
	let degrees = Math.floor(absoluteValue);
	let minutes = Math.round((absoluteValue - degrees) * 60);

	if (minutes === 60) {
		degrees += 1;
		minutes = 0;
	}

	return `${String(degrees).padStart(degreeWidth, "0")}${String(minutes).padStart(2, "0")}${hemisphere}`;
}

function formatIfCoordinate(latitude: number, longitude: number): string {
	return `${formatDegreesMinutes(latitude, 2, ["N", "S"])}/${formatDegreesMinutes(longitude, 3, ["E", "W"])}`;
}

function parseCoordinateWaypoint(value: string): RouteProcedureLeg | null {
	const match = value.match(/^(\d{1,4})([NS])(\d{1,5})([EW])$/);

	if (!match) {
		return null;
	}

	const latitude = parseCoordinateComponent(match[1], match[2], 2);
	const longitude = parseCoordinateComponent(match[3], match[4], 3);

	if (
		latitude === null ||
		longitude === null ||
		Math.abs(latitude) > 90 ||
		Math.abs(longitude) > 180
	) {
		return null;
	}

	return {
		seqno: 0,
		waypoint: {
			latitude,
			longitude,
			name: value,
		},
	};
}

function parseCoordinateComponent(
	value: string,
	hemisphere: string,
	wholeDegreeWidth: 2 | 3,
): number | null {
	const sign = hemisphere === "S" || hemisphere === "W" ? -1 : 1;

	if (value.length <= wholeDegreeWidth) {
		const degrees = Number(value);

		return Number.isFinite(degrees) ? sign * degrees : null;
	}

	const degreeText = value.slice(0, -2);
	const minuteText = value.slice(-2);
	const degrees = Number(degreeText);
	const minutes = Number(minuteText);

	if (
		!Number.isFinite(degrees) ||
		!Number.isFinite(minutes) ||
		minutes >= 60
	) {
		return null;
	}

	return sign * (degrees + minutes / 60);
}

function toRadians(value: number): number {
	return (value * Math.PI) / 180;
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

function formatStructuredRunway(runway: string): string {
	return runway.replace(/^RW/i, "");
}

function buildStructuredRoute(plan: RoutePlanState): StructuredRoute {
	return {
		departure: {
			icao: plan.origin,
			runway: formatStructuredRunway(plan.departureRunway),
			sid: plan.structuredRoute.departure.sid,
		},
		enroute: plan.segments.map((segment) => ({
			airway: segment.via,
			fixes: segment.fixes,
		})),
		arrival: {
			icao: plan.destination,
			runway: formatStructuredRunway(plan.structuredRoute.arrival.runway),
			star: plan.structuredRoute.arrival.star,
			approach: plan.structuredRoute.arrival.approach,
		},
	};
}

function routeTitle(api: FmcProgramApi): string {
	const active = api.store.route.activeRoute === api.store.route.selectedRoute;
	const prefix = active ? "ACT " : "";

	return `${prefix}RTE${api.store.route.selectedRoute}`;
}

function setSelectedRoute(api: FmcProgramApi, routeNumber: 1 | 2): void {
	api.updateStore((current) => ({
		...current,
		pageIndex: 0,
		route: {
			...current.route,
			selectedRoute: routeNumber,
			pendingVia: null,
			pendingViaRowIndex: null,
		},
	}));
}

function updateSelectedPlan(
	api: FmcProgramApi,
	update: (plan: RoutePlanState) => RoutePlanState,
): void {
	const selectedRoute = api.store.route.selectedRoute;

	api.updateStore((current) => ({
		...current,
		route: {
			...current.route,
			plans: {
				...current.route.plans,
				[selectedRoute]: (() => {
					const nextPlan = update(current.route.plans[selectedRoute]);

					return {
						...nextPlan,
						structuredRoute: buildStructuredRoute(nextPlan),
					};
				})(),
			},
		},
	}));
}

function replaceSelectedPlan(api: FmcProgramApi, plan: RoutePlanState): void {
	const selectedRoute = api.store.route.selectedRoute;

	api.updateStore((current) => ({
		...current,
		route: {
			...current.route,
			plans: {
				...current.route.plans,
				[selectedRoute]: {
					...plan,
					structuredRoute: buildStructuredRoute(plan),
				},
			},
		},
	}));
}

async function refreshProcedurePreview(
	api: FmcProgramApi,
	plan: RoutePlanState,
): Promise<void> {
	if (!plan.origin || !plan.destination) {
		return;
	}

	try {
		const procedurePreview =
			await api.services.navigationDatabase.getProcedurePreview(
				plan.origin,
				plan.destination,
				plan.departureRunway,
			);

		updateSelectedPlan(api, (currentPlan) => ({
			...currentPlan,
			procedurePreview,
		}));
	} catch {
		updateSelectedPlan(api, (currentPlan) => ({
			...currentPlan,
			procedurePreview: {
				sid: null,
				star: null,
			},
		}));
	}
}

async function setAirportField(
	api: FmcProgramApi,
	field: "origin" | "destination" | "alternate",
	label: string,
): Promise<void> {
	const value = normalizeIdentifier(api.scratchpad);

	if (!value) {
		api.showMessage(`ENTER ${label}`);
		return;
	}

	if (!(await api.services.navigationDatabase.airportExists(value))) {
		api.showMessage(`${label} NOT IN DB`);
		return;
	}

	const plan = getRoutePlan(api.store);
	const nextPlan = {
		...plan,
		[field]: value,
		departureRunway: field === "origin" ? "" : plan.departureRunway,
		procedurePreview:
			field === "origin" || field === "destination"
				? { sid: null, star: null }
				: plan.procedurePreview,
		isActive: false,
	};

	updateSelectedPlan(api, () => nextPlan);
	api.setScratchpad("");
	api.showMessage(`${label} SET`);

	await refreshProcedurePreview(api, nextPlan);
}

async function selectRunway(api: FmcProgramApi): Promise<void> {
	const plan = getRoutePlan(api.store);

	if (!plan.origin) {
		api.showMessage("ORIGIN REQUIRED");
		return;
	}

	const typedRunway = normalizeIdentifier(api.scratchpad);

	if (typedRunway) {
		const runway = normalizeRunway(typedRunway);

		if (
			!(await api.services.navigationDatabase.runwayExists(plan.origin, runway))
		) {
			api.showMessage("RUNWAY NOT IN DB");
			return;
		}

		const nextPlan = {
			...plan,
			departureRunway: runway,
			isActive: false,
		};

		updateSelectedPlan(api, () => nextPlan);
		api.setScratchpad("");
		api.showMessage(`${runway} SELECTED`);
		await refreshProcedurePreview(api, nextPlan);
		return;
	}

	const runways = await api.services.navigationDatabase.listRunways(
		plan.origin,
	);

	if (runways.length === 0) {
		api.showMessage("NO RUNWAYS");
		return;
	}

	const currentIndex = runways.findIndex(
		(runway) => runway.identifier === plan.departureRunway,
	);
	const nextRunway = runways[(currentIndex + 1) % runways.length];

	const nextPlan = {
		...plan,
		departureRunway: nextRunway.identifier,
		isActive: false,
	};

	updateSelectedPlan(api, () => nextPlan);
	api.showMessage(`${nextRunway.identifier} SELECTED`);
	await refreshProcedurePreview(api, nextPlan);
}

function setTextField(
	api: FmcProgramApi,
	field: "flightNumber",
	label: string,
): void {
	const value = normalizeIdentifier(api.scratchpad);

	if (!value) {
		api.showMessage(`ENTER ${label}`);
		return;
	}

	updateSelectedPlan(api, (plan) => ({
		...plan,
		[field]: value,
		isActive: false,
	}));
	api.setScratchpad("");
	api.showMessage(`${label} SET`);
}

async function saveCurrentRoute(api: FmcProgramApi): Promise<void> {
	const name = normalizeIdentifier(api.scratchpad);

	if (!name) {
		api.showMessage("ENTER SAVE NAME");
		return;
	}

	try {
		const plan = await resolveDirectFixesForRoute(api, getRoutePlan(api.store));

		await api.services.routeStorage.save(name, plan);
		replaceSelectedPlan(api, {
			...plan,
			routeRequest: name,
		});
		api.setScratchpad("");
		api.showMessage("ROUTE SAVED");
	} catch {
		api.showMessage("SAVE FAILED");
	}
}

async function loadSavedRoute(api: FmcProgramApi): Promise<void> {
	const name = normalizeIdentifier(api.scratchpad);

	if (!name) {
		api.showMessage("ENTER ROUTE NAME");
		return;
	}

	try {
		const result = await api.services.routeStorage.load(name);

		if (result.status === "DUPLICATE") {
			api.showMessage("DUPLICATE ROUTE");
			return;
		}

		if (result.status === "NOT_FOUND" || !result.route) {
			api.showMessage("ROUTE NOT FOUND");
			return;
		}

		const loadedRoute = result.route;
		const resolvedRoute = await resolveDirectFixesForRoute(api, loadedRoute);
		const selectedRoute = api.store.route.selectedRoute;

		api.updateStore((current) => ({
			...current,
			pageIndex: 0,
			route: {
				...current.route,
				activeRoute:
					current.route.activeRoute === selectedRoute
						? null
						: current.route.activeRoute,
				pendingVia: null,
				pendingViaRowIndex: null,
					plans: {
						...current.route.plans,
						[selectedRoute]: {
							...resolvedRoute,
							routeRequest: name,
							isActive: false,
							structuredRoute: buildStructuredRoute(resolvedRoute),
						},
					},
			},
		}));
		api.setScratchpad("");
		api.showMessage("ROUTE LOADED");
	} catch {
		api.showMessage("LOAD FAILED");
	}
}

function getRouteEndpoint(
	plan: RoutePlanState,
	beforeSegmentIndex: number,
): string {
	if (beforeSegmentIndex <= 0) {
		const sidProcedure = plan.structuredRoute.departure.sid?.procedure ?? [];
		const lastSidLeg = sidProcedure[sidProcedure.length - 1];

		return lastSidLeg?.waypoint.name ?? plan.origin;
	}

	return plan.segments[beforeSegmentIndex - 1]?.to ?? plan.origin;
}

function legToRoutePointReference(leg: RouteProcedureLeg): RoutePointReference {
	return {
		identifier: leg.waypoint.name,
		latitude: leg.waypoint.latitude,
		longitude: leg.waypoint.longitude,
	};
}

function getRouteEndpointReference(
	plan: RoutePlanState,
	beforeSegmentIndex: number,
): RoutePointReference {
	if (beforeSegmentIndex <= 0) {
		const sidProcedure = plan.structuredRoute.departure.sid?.procedure ?? [];
		const lastSidLeg = sidProcedure[sidProcedure.length - 1];

		return lastSidLeg
			? legToRoutePointReference(lastSidLeg)
			: { identifier: plan.origin };
	}

	const previousSegment = plan.segments[beforeSegmentIndex - 1];
	const previousFix = previousSegment?.fixes[previousSegment.fixes.length - 1];

	return previousFix
		? legToRoutePointReference(previousFix)
		: { identifier: previousSegment?.to ?? plan.origin };
}

async function resolveDirectFixesForRoute(
	api: FmcProgramApi,
	plan: RoutePlanState,
): Promise<RoutePlanState> {
	const segments: RouteSegment[] = [];
	let changed = false;

	for (const segment of plan.segments) {
		const segmentIndex = segments.length;
		const planWithResolvedSegments = {
			...plan,
			segments,
			structuredRoute: {
				...plan.structuredRoute,
				enroute: segments.map((resolvedSegment) => ({
					airway: resolvedSegment.via,
					fixes: resolvedSegment.fixes,
				})),
			},
		};

		if (segment.via !== DIRECT || parseCoordinateWaypoint(segment.to)) {
			segments.push(segment);
			continue;
		}

		const fix = await api.services.navigationDatabase.resolveWaypointForRoute(
			segment.to,
			getRouteEndpointReference(planWithResolvedSegments, segmentIndex),
		);

		if (!fix) {
			segments.push(segment);
			continue;
		}

		const currentFix = segment.fixes[segment.fixes.length - 1];

		if (
			currentFix?.waypoint.latitude !== fix.waypoint.latitude ||
			currentFix?.waypoint.longitude !== fix.waypoint.longitude
		) {
			changed = true;
		}

		segments.push({
			...segment,
			fixes: [fix],
		});
	}

	if (!changed) {
		return plan;
	}

	const resolvedPlan = {
		...plan,
		segments,
		isActive: false,
	};

	return {
		...resolvedPlan,
		structuredRoute: buildStructuredRoute(resolvedPlan),
	};
}

function getDisplayRows(
	plan: RoutePlanState,
	pendingVia?: string | null,
	pendingViaRowIndex?: number | null,
): RouteDisplayRow[] {
	const rows: RouteDisplayRow[] = [];
	const selectedSid = plan.structuredRoute.departure.sid;
	const selectedStar = plan.structuredRoute.arrival.star;

	if (selectedSid ?? plan.procedurePreview.sid) {
		const sidProcedure = selectedSid?.procedure ?? [];
		const lastSidLeg = sidProcedure[sidProcedure.length - 1];

		rows.push({
			via: selectedSid?.identifier ?? plan.procedurePreview.sid ?? "",
			to: lastSidLeg?.waypoint.name ?? "",
			segmentIndex: null,
			displayIndex: rows.length,
			disabled: true,
		});
	}

	rows.push(
		...plan.segments.map((segment, segmentIndex) => ({
			via: segment.via,
			to: segment.to,
			segmentIndex,
			displayIndex: rows.length + segmentIndex,
		})),
	);

	if (selectedStar ?? plan.procedurePreview.star) {
		const firstStarLeg =
			selectedStar?.commonRoute[0] ?? selectedStar?.runwayTransitionRoute[0];
		const displayIndex = rows.length;

		rows.push({
			via: pendingVia && pendingViaRowIndex === displayIndex ? pendingVia : "",
			to: "",
			segmentIndex: plan.segments.length,
			displayIndex,
		});

		rows.push({
			via: selectedStar?.identifier ?? plan.procedurePreview.star ?? "",
			to: firstStarLeg?.waypoint.name ?? plan.destination,
			segmentIndex: null,
			displayIndex: rows.length,
			disabled: true,
		});
	}

	while (rows.length < ROUTE_ROWS_PER_PAGE) {
		const displayIndex = rows.length;
		rows.push({
			via: pendingVia && pendingViaRowIndex === displayIndex ? pendingVia : "",
			to: "",
			segmentIndex: plan.segments.length,
			displayIndex,
		});
	}

	return rows;
}

function getRoutePageCount(state: Readonly<FmcState>): number {
	const plan = getRoutePlan(state);
	const rowCount = Math.max(
		ROUTE_ROWS_PER_PAGE,
		getDisplayRows(plan, state.route.pendingVia, state.route.pendingViaRowIndex)
			.length,
	);

	return 1 + Math.ceil(rowCount / ROUTE_ROWS_PER_PAGE);
}

function setSegmentVia(api: FmcProgramApi, displayRow: RouteDisplayRow): void {
	if (isDeleteCommand(api.scratchpad)) {
		deleteSegment(api, displayRow);
		return;
	}

	if (displayRow.disabled) {
		api.showMessage("NOT SETTABLE");
		return;
	}

	const via = normalizeIdentifier(api.scratchpad) || DIRECT;

	api.updateStore((current) => ({
		...current,
		route: {
			...current.route,
			pendingVia: via,
			pendingViaRowIndex: displayRow.displayIndex,
		},
	}));
	api.setScratchpad("");
}

async function setSegmentTo(
	api: FmcProgramApi,
	displayRow: RouteDisplayRow,
): Promise<void> {
	if (isDeleteCommand(api.scratchpad)) {
		deleteSegment(api, displayRow);
		return;
	}

	if (displayRow.disabled) {
		api.showMessage("NOT SETTABLE");
		return;
	}

	const plan = getRoutePlan(api.store);
	const to = normalizeIdentifier(api.scratchpad);
	const segmentIndex = displayRow.segmentIndex ?? plan.segments.length;
	const via = (api.store.route.pendingVia ?? displayRow.via) || DIRECT;

	if (!to) {
		api.showMessage("ENTER FIX");
		return;
	}

	let segment: RouteSegment;

	if (via === DIRECT) {
		const coordinateFix = parseCoordinateWaypoint(to);
		const fix =
			coordinateFix ??
			(await api.services.navigationDatabase.resolveWaypointForRoute(
				to,
				getRouteEndpointReference(plan, segmentIndex),
			));

		if (!fix) {
			api.showMessage("FIX NOT IN DB");
			return;
		}

		segment = {
			via,
			to,
			expandedWaypoints: [
				coordinateFix
					? formatIfCoordinate(
							coordinateFix.waypoint.latitude,
							coordinateFix.waypoint.longitude,
						)
					: to,
			],
			fixes: [fix],
		};
	} else {
		if (parseCoordinateWaypoint(to)) {
			api.showMessage("COORD MUST BE DIRECT");
			return;
		}

		const previousWaypoint = getRouteEndpoint(plan, segmentIndex);
		const expansion = await api.services.navigationDatabase.expandAirway(
			via,
			previousWaypoint,
			to,
		);

		if (!expansion) {
			api.showMessage("INVALID AIRWAY");
			return;
		}

		segment = {
			via: expansion.routeIdentifier,
			to,
			expandedWaypoints: expansion.waypoints,
			fixes: expansion.fixes,
		};
	}

	updateSelectedPlan(api, (currentPlan) => {
		const segments = [...currentPlan.segments];
		segments[segmentIndex] = segment;

		return {
			...currentPlan,
			segments,
			isActive: false,
		};
	});

	api.updateStore((current) => ({
		...current,
		route: {
			...current.route,
			pendingVia: null,
			pendingViaRowIndex: null,
		},
	}));
	api.setScratchpad("");
	api.showMessage(`${to} SET`);
}

function isDeleteCommand(value: string): boolean {
	return value.trim().toUpperCase() === "DELETE";
}

function deleteSegment(api: FmcProgramApi, displayRow: RouteDisplayRow): void {
	if (displayRow.disabled) {
		api.showMessage("USE DEP ARR ERASE");
		return;
	}

	if (displayRow.segmentIndex === null) {
		api.showMessage("NOTHING TO DELETE");
		return;
	}

	const plan = getRoutePlan(api.store);

	if (
		displayRow.segmentIndex < 0 ||
		displayRow.segmentIndex >= plan.segments.length
	) {
		api.showMessage("NOTHING TO DELETE");
		return;
	}

	updateSelectedPlan(api, (currentPlan) => ({
		...currentPlan,
		segments: currentPlan.segments.filter(
			(_segment, index) => index !== displayRow.segmentIndex,
		),
		isActive: false,
	}));

	api.updateStore((current) => ({
		...current,
		route: {
			...current.route,
			pendingVia: null,
			pendingViaRowIndex: null,
		},
	}));
	api.setScratchpad("");
	api.showMessage("WAYPOINT DELETED");
}

function legToFlightPlanPoint(leg: RouteProcedureLeg): FlightPlanPoint {
	const coordinateFix = parseCoordinateWaypoint(leg.waypoint.name);

	return {
		name: leg.waypoint.name,
		token: coordinateFix
			? formatIfCoordinate(
					coordinateFix.waypoint.latitude,
					coordinateFix.waypoint.longitude,
				)
			: leg.waypoint.name,
		latitude: leg.waypoint.latitude,
		longitude: leg.waypoint.longitude,
	};
}

function buildFlightPlanPoints(plan: RoutePlanState): FlightPlanPoint[] {
	const points: FlightPlanPoint[] = [
		{
			name: plan.origin,
			token: plan.origin,
			latitude: null,
			longitude: null,
		},
		...buildRouteLegRows(plan).map((row) => legToFlightPlanPoint(row.leg)),
		{
			name: plan.destination,
			token: plan.destination,
			latitude: null,
			longitude: null,
		},
	].filter((point) => Boolean(point.name));

	return points.filter(
		(point, index) => index === 0 || point.name !== points[index - 1].name,
	);
}

function parseIfFlightPlanFullInfo(
	value: unknown,
): IfFlightPlanFullInfo | null {
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as IfFlightPlanFullInfo;
		} catch {
			return null;
		}
	}

	if (typeof value === "object" && value !== null) {
		return value as IfFlightPlanFullInfo;
	}

	return null;
}

function getIfFlightPlanItems(
	fullInfo: IfFlightPlanFullInfo,
): IfFlightPlanItem[] {
	return [
		...(fullInfo.detailedInfo?.flightPlanItems ?? []),
		...(fullInfo.DetailedInfo?.FlightPlanItems ?? []),
	];
}

function getIfFlightPlanWaypoints(fullInfo: IfFlightPlanFullInfo): string[] {
	return [
		...(fullInfo.detailedInfo?.waypoints ?? []),
		...(fullInfo.DetailedInfo?.Waypoints ?? []),
	];
}

function getIfItemName(item: IfFlightPlanItem, fallback?: string): string {
	return (
		item.identifier ??
		item.Identifier ??
		fallback ??
		item.name ??
		item.Name ??
		""
	).toUpperCase();
}

function getIfItemLocation(
	item: IfFlightPlanItem,
): { latitude: number; longitude: number } | null {
	const location = item.location ?? item.Location;
	const latitude = location?.Latitude ?? location?.latitude;
	const longitude = location?.Longitude ?? location?.longitude;

	if (typeof latitude !== "number" || typeof longitude !== "number") {
		return null;
	}

	return {
		latitude,
		longitude,
	};
}

function isSameIfWaypointName(
	point: FlightPlanPoint,
	ifName: string,
): boolean {
	const expectedNames = [
		point.name.toUpperCase(),
		point.token.toUpperCase(),
	].filter(Boolean);

	return expectedNames.includes(ifName);
}

function findIfFlightPlanProblems(
	points: FlightPlanPoint[],
	fullInfo: IfFlightPlanFullInfo,
): IfFlightPlanProblems {
	let items = getIfFlightPlanItems(fullInfo);
	const waypoints = getIfFlightPlanWaypoints(fullInfo);
	const missingIndexes = new Set<number>();
	const mismatchedIndexes = new Set<number>();

	if (items.length > 0 && (items[0].name ?? items[0].Name) === "WPT") {
		items = items.slice(1);
	}

	let itemIndex = 0;

	for (let index = 0; index < points.length; index += 1) {
		const point = points[index];
		const item = items[itemIndex];

		if (!item) {
			if (
				typeof point.latitude === "number" &&
				typeof point.longitude === "number"
			) {
				missingIndexes.add(index);
			}
			continue;
		}

		const ifName = getIfItemName(item, waypoints[itemIndex]);

		if (!isSameIfWaypointName(point, ifName)) {
			if (
				typeof point.latitude === "number" &&
				typeof point.longitude === "number"
			) {
				mismatchedIndexes.add(index);
			}

			const nextMatchingPoint = points
				.slice(index + 1)
				.find((candidate) => isSameIfWaypointName(candidate, ifName));

			if (nextMatchingPoint) {
				mismatchedIndexes.delete(index);
				missingIndexes.add(index);
			} else {
				itemIndex += 1;
			}
			continue;
		}

		itemIndex += 1;
		const location = getIfItemLocation(item);

		if (
			typeof point.latitude !== "number" ||
			typeof point.longitude !== "number" ||
			!location
		) {
			continue;
		}

		const distanceNm = getDistanceNm(
			{
				latitude: point.latitude,
				longitude: point.longitude,
			},
			location,
		);

		if (distanceNm > IF_POSITION_MISMATCH_THRESHOLD_NM) {
			mismatchedIndexes.add(index);
		}
	}

	return {
		missingIndexes,
		mismatchedIndexes,
	};
}

function mergeProblemIndexes(problems: IfFlightPlanProblems): Set<number> {
	return new Set([
		...problems.missingIndexes,
		...problems.mismatchedIndexes,
	]);
}

function wait(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}

function createCoordinateFallbackTokens(
	points: FlightPlanPoint[],
	baseTokens: string[],
	badIndexes: Set<number>,
): string[] {
	return baseTokens.map((token, index) => {
		const point = points[index];

		if (
			!badIndexes.has(index) ||
			typeof point.latitude !== "number" ||
			typeof point.longitude !== "number"
		) {
			return token;
		}

		return formatIfCoordinate(point.latitude, point.longitude);
	});
}

async function loadFlightPlanIntoIf(
	api: FmcProgramApi,
	points: FlightPlanPoint[],
	namedTokens: string[],
	fallbackTokens: string[],
): Promise<LoadFlightPlanResult> {
	const retryStartedAt = Date.now();
	let retryCount = 0;
	let lastBadIndexes = new Set<number>();

	while (Date.now() - retryStartedAt < IF_NAMED_FIX_RETRY_TIMEOUT_MS) {
		retryCount += 1;

		await api.services.connectApi.set(
			"aircraft/0/flightplan",
			namedTokens.join(" "),
		);
		await wait(IF_NAMED_FIX_RETRY_INTERVAL_MS);

		const fullInfo = parseIfFlightPlanFullInfo(
			await api.services.connectApi.get("aircraft/0/flightplan/full_info"),
		);

		if (!fullInfo) {
			continue;
		}

		const problems = findIfFlightPlanProblems(points, fullInfo);
		lastBadIndexes = mergeProblemIndexes(problems);

		if (lastBadIndexes.size === 0) {
			return {
				correctedCount: 0,
				retryCount,
			};
		}

		if (problems.missingIndexes.size > 0) {
			break;
		}
	}

	if (lastBadIndexes.size === 0) {
		lastBadIndexes = new Set(
			points.flatMap((point, index) =>
				typeof point.latitude === "number" &&
				typeof point.longitude === "number"
					? [index]
					: [],
			),
		);
	}

	const correctedTokens = createCoordinateFallbackTokens(
		points,
		fallbackTokens,
		lastBadIndexes,
	);

	await api.services.connectApi.set(
		"aircraft/0/flightplan",
		correctedTokens.join(" "),
	);

	return {
		correctedCount: lastBadIndexes.size,
		retryCount,
	};
}

async function activateRoute(api: FmcProgramApi): Promise<void> {
	const plan = await resolveDirectFixesForRoute(api, getRoutePlan(api.store));

	if (!plan.origin || !plan.destination) {
		api.showMessage("ROUTE INCOMPLETE");
		return;
	}

	const flightPlanPoints = buildFlightPlanPoints(plan);
	const flightPlan = flightPlanPoints.map((point) => point.token);

	if (flightPlan.length < 2) {
		api.showMessage("ROUTE INCOMPLETE");
		return;
	}

	try {
		replaceSelectedPlan(api, plan);
		const ifFlightPlan =
			await api.services.navigationDatabase.resolveFlightPlanForIf(flightPlan);
		const loadResult = await loadFlightPlanIntoIf(
			api,
			flightPlanPoints,
			flightPlan,
			ifFlightPlan.waypoints,
		);

		const selectedRoute = api.store.route.selectedRoute;
		const message =
			loadResult.correctedCount > 0
				? "ROUTE ACTIVE IF FIXES"
				: ifFlightPlan.ambiguousFixes.length > 0
					? "ROUTE ACTIVE COORD FIXES"
					: "ROUTE ACTIVE";

		api.updateStore((current) => ({
			...current,
			route: {
				...current.route,
				activeRoute: selectedRoute,
				plans: {
					...current.route.plans,
					1: {
						...current.route.plans[1],
						isActive: selectedRoute === 1,
					},
					2: {
						...current.route.plans[2],
						isActive: selectedRoute === 2,
					},
				},
			},
			message,
		}));
	} catch {
		api.showMessage("IF UPDATE FAILED");
	}
}

function createIndexPage(title: string): FmcSdkPage {
	return {
		title,
		page(api) {
			return `1/${getRoutePageCount(api.store)}`;
		},
		slots(api) {
			const plan = getRoutePlan(api.store);
			const otherRoute = api.store.route.selectedRoute === 1 ? 2 : 1;

			return [
				{
					labelLeft: "ORIGIN",
					valueLeft: displayValue(plan.origin, "----"),
					labelRight: "DEST",
					valueRight: displayValue(plan.destination, "----"),
					onLeft: () => setAirportField(api, "origin", "ORIGIN"),
					onRight: () => setAirportField(api, "destination", "DEST"),
				},
				{
					labelLeft: "RUNWAY",
					valueLeft: displayValue(plan.departureRunway, "-----"),
					labelRight: "FLT NO",
					valueRight: displayValue(plan.flightNumber, "--------"),
					onLeft: () => selectRunway(api),
					onRight: () => setTextField(api, "flightNumber", "FLT NO"),
				},
				{
					labelLeft: "ROUTE REQUEST",
					valueLeft: displayValue(plan.routeRequest, "--------"),
					onLeft: () => loadSavedRoute(api),
				},
				{
					labelLeft: "ROUTE SAVE",
					valueLeft: "<SAVE",
					labelRight: "ALTN",
					valueRight: displayValue(plan.alternate, "----"),
					onLeft: () => saveCurrentRoute(api),
					onRight: () => setAirportField(api, "alternate", "ALTN"),
				},
				{},
				{
					valueLeft: `<RTE ${otherRoute}`,
					valueRight: plan.isActive ? "ACTIVE" : "ACTIVATE>",
					onLeft: () => setSelectedRoute(api, otherRoute),
					onRight: () => activateRoute(api),
				},
			];
		},
	};
}

function createRouteRowsPage(
	title: string,
	routePageIndex: number,
): FmcSdkPage {
	return {
		title,
		page(api) {
			return `${routePageIndex + 1}/${getRoutePageCount(api.store)}`;
		},
		slots(api) {
			const plan = getRoutePlan(api.store);
			const rows = getDisplayRows(
				plan,
				api.store.route.pendingVia,
				api.store.route.pendingViaRowIndex,
			).slice(
				(routePageIndex - 1) * ROUTE_ROWS_PER_PAGE,
				routePageIndex * ROUTE_ROWS_PER_PAGE,
			);
			const slots: FmcSdkSlot[] = rows.map((row, rowIndex) => ({
				labelLeft: rowIndex === 0 ? "VIA" : undefined,
				labelRight: rowIndex === 0 ? "TO" : undefined,
				valueLeft: row.via || "-----",
				valueRight: row.to || "-----",
				disabledLeft: row.disabled,
				disabledRight: row.disabled,
				onLeft: () => setSegmentVia(api, row),
				onRight: () => setSegmentTo(api, row),
			}));
			const otherRoute = api.store.route.selectedRoute === 1 ? 2 : 1;

			slots.push({
				valueLeft: `<RTE ${otherRoute}`,
				valueCenter: "----------------",
				valueRight: plan.isActive ? "ACTIVE" : "ACTIVATE>",
				onLeft: () => setSelectedRoute(api, otherRoute),
				onRight: () => activateRoute(api),
			});

			return slots;
		},
	};
}

export const routeProgram = createFmcProgram({
	id: "RTE",

	pages(api) {
		const pageCount = getRoutePageCount(api.store);
		const title = routeTitle(api);

		return [
			createIndexPage(title),
			...Array.from({ length: pageCount - 1 }, (_, index) =>
				createRouteRowsPage(title, index + 1),
			),
		];
	},

	onKey(key, api) {
		if (key !== "DEL") {
			return false;
		}

		if (api.scratchpad.trim() !== "") {
			return false;
		}

		api.setScratchpad("DELETE");
		return true;
	},
});
