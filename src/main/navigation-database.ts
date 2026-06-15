import { app } from "electron";
import { DatabaseSync } from "node:sqlite";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
	AirwayExpansion,
	AltitudeRestrictionType,
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
} from "../renderer/fmc/types";

interface CycleFile {
	cycle: string;
	revision: string;
	name: string;
}

interface RoutePointCandidate {
	areaCode: string | null;
	latitude: number | null;
	longitude: number | null;
}

interface ResolvedRoutePointReference {
	areaCode: string | null;
	latitude: number;
	longitude: number;
}

const MAX_AMBIGUOUS_FIX_DISTANCE_NM = 1000;
const EARTH_RADIUS_NM = 3440.065;

export function getNavigationDataDirectory(): string {
	return path.join(app.getPath("home"), "openFMC-navdata");
}

function isCycleFile(value: unknown): value is CycleFile {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;

	return (
		typeof candidate.cycle === "string" &&
		/^\d{4}$/.test(candidate.cycle) &&
		typeof candidate.revision === "string" &&
		candidate.revision.trim().length > 0 &&
		typeof candidate.name === "string" &&
		candidate.name.trim().length > 0
	);
}

async function readCycleFile(filePath: string): Promise<CycleFile | null> {
	try {
		const contents = await readFile(filePath, "utf8");
		const parsed: unknown = JSON.parse(contents);

		return isCycleFile(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function checkSqliteIntegrity(databasePath: string): {
	intact: boolean;
	error?: string;
} {
	let database: DatabaseSync | null = null;

	try {
		database = new DatabaseSync(databasePath, {
			readOnly: true,
			open: true,
		});

		const result = database.prepare("PRAGMA quick_check").all() as Array<
			Record<string, unknown>
		>;

		const messages = result.flatMap((row) => Object.values(row).map(String));

		const intact =
			messages.length > 0 &&
			messages.every((message) => message.toLowerCase() === "ok");

		if (!intact) {
			return {
				intact: false,
				error: messages.join("; ") || "SQLite quick_check failed",
			};
		}

		return {
			intact: true,
		};
	} catch (error) {
		return {
			intact: false,
			error:
				error instanceof Error
					? error.message
					: "Unable to open navigation database",
		};
	} finally {
		database?.close();
	}
}

function openNavigationDatabase(): DatabaseSync {
	return new DatabaseSync(
		path.join(getNavigationDataDirectory(), "navdb.s3db"),
		{
			readOnly: true,
			open: true,
		},
	);
}

function normalizeIdentifier(value: string): string {
	return value.trim().toUpperCase();
}

function normalizeRunwayIdentifier(value: string): string {
	const normalized = normalizeIdentifier(value);

	if (normalized.startsWith("RW")) {
		return normalized;
	}

	return `RW${normalized}`;
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

function toRadians(value: number): number {
	return (value * Math.PI) / 180;
}

function getDistanceNm(
	from: ResolvedRoutePointReference,
	to: ResolvedRoutePointReference,
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

function toRoutePointReference(
	candidate: RoutePointCandidate,
): ResolvedRoutePointReference | null {
	if (
		typeof candidate.latitude !== "number" ||
		typeof candidate.longitude !== "number"
	) {
		return null;
	}

	return {
		areaCode: candidate.areaCode,
		latitude: candidate.latitude,
		longitude: candidate.longitude,
	};
}

function toProcedureLeg(row: {
	seqno: number | null;
	waypoint_identifier: string;
	waypoint_latitude: number | null;
	waypoint_longitude: number | null;
	path_termination?: string | null;
	magnetic_course?: number | null;
	altitude_description?: string | null;
	altitude1?: number | null;
	altitude2?: number | null;
}): RouteProcedureLeg | null {
	if (
		typeof row.waypoint_latitude !== "number" ||
		typeof row.waypoint_longitude !== "number"
	) {
		return null;
	}

	const leg: RouteProcedureLeg = {
		seqno: row.seqno ?? 0,
		waypoint: {
			latitude: row.waypoint_latitude,
			longitude: row.waypoint_longitude,
			name: row.waypoint_identifier,
		},
	};

	if (row.path_termination) {
		leg.tracking = {
			type: row.path_termination,
		};

		if (typeof row.magnetic_course === "number") {
			leg.tracking.course = row.magnetic_course;
		}
	}

	if (typeof row.altitude1 === "number" && row.altitude_description) {
		const typeByDescription: Record<string, AltitudeRestrictionType> = {
			"+": "AT_OR_ABOVE",
			"-": "AT_OR_BELOW",
			"B": "BETWEEN",
			" ": "AT",
		};
		const type = typeByDescription[row.altitude_description] ?? "AT";

		leg.altitudeRestriction = {
			altitude: row.altitude1,
			type,
		};

		if (type === "BETWEEN" && typeof row.altitude2 === "number") {
			leg.altitudeRestriction.altitude2 = row.altitude2;
		}
	}

	return leg;
}

function getWaypointLegCandidates(
	database: DatabaseSync,
	identifier: string,
): Array<
	RoutePointCandidate & {
		seqno: number | null;
		waypoint_identifier: string;
		waypoint_latitude: number | null;
		waypoint_longitude: number | null;
		path_termination: string | null;
		magnetic_course: number | null;
		altitude_description: string | null;
		altitude1: number | null;
		altitude2: number | null;
	}
> {
	return database
		.prepare(
			`SELECT area_code AS areaCode,
				waypoint_latitude AS latitude,
				waypoint_longitude AS longitude,
				0 AS seqno,
				waypoint_identifier,
				waypoint_latitude,
				waypoint_longitude,
				NULL AS path_termination,
				NULL AS magnetic_course,
				NULL AS altitude_description,
				NULL AS altitude1,
				NULL AS altitude2
			FROM tbl_enroute_waypoints
			WHERE waypoint_identifier = ?
			UNION ALL
			SELECT area_code AS areaCode,
				waypoint_latitude AS latitude,
				waypoint_longitude AS longitude,
				0 AS seqno,
				waypoint_identifier,
				waypoint_latitude,
				waypoint_longitude,
				NULL AS path_termination,
				NULL AS magnetic_course,
				NULL AS altitude_description,
				NULL AS altitude1,
				NULL AS altitude2
			FROM tbl_terminal_waypoints
			WHERE waypoint_identifier = ?
			UNION ALL
			SELECT area_code AS areaCode,
				vor_latitude AS latitude,
				vor_longitude AS longitude,
				0 AS seqno,
				vor_identifier AS waypoint_identifier,
				vor_latitude AS waypoint_latitude,
				vor_longitude AS waypoint_longitude,
				NULL AS path_termination,
				NULL AS magnetic_course,
				NULL AS altitude_description,
				NULL AS altitude1,
				NULL AS altitude2
			FROM tbl_vhfnavaids
			WHERE vor_identifier = ?
			UNION ALL
			SELECT area_code AS areaCode,
				ndb_latitude AS latitude,
				ndb_longitude AS longitude,
				0 AS seqno,
				ndb_identifier AS waypoint_identifier,
				ndb_latitude AS waypoint_latitude,
				ndb_longitude AS waypoint_longitude,
				NULL AS path_termination,
				NULL AS magnetic_course,
				NULL AS altitude_description,
				NULL AS altitude1,
				NULL AS altitude2
			FROM tbl_enroute_ndbnavaids
			WHERE ndb_identifier = ?`,
		)
		.all(identifier, identifier, identifier, identifier) as unknown as Array<
		RoutePointCandidate & {
			seqno: number | null;
			waypoint_identifier: string;
			waypoint_latitude: number | null;
			waypoint_longitude: number | null;
			path_termination: string | null;
			magnetic_course: number | null;
			altitude_description: string | null;
			altitude1: number | null;
			altitude2: number | null;
		}
	>;
}

export async function inspectNavigationDatabase(): Promise<NavigationDatabaseInfo> {
	const directory = getNavigationDataDirectory();

	const cyclePath = path.join(directory, "cycle.json");

	const databasePath = path.join(directory, "navdb.s3db");

	const cycle = await readCycleFile(cyclePath);

	if (!cycle) {
		return {
			cycle: null,
			revision: null,
			name: null,
			status: "INVALID_CYCLE",
			error: "cycle.json is missing or invalid",
		};
	}

	try {
		const databaseStats = await stat(databasePath);

		if (!databaseStats.isFile() || databaseStats.size === 0) {
			return {
				cycle: cycle.cycle,
				revision: cycle.revision,
				name: cycle.name,
				status: "MISSING_DATABASE",
				error: "navdb.s3db is missing or empty",
			};
		}
	} catch {
		return {
			cycle: cycle.cycle,
			revision: cycle.revision,
			name: cycle.name,
			status: "MISSING_DATABASE",
			error: "navdb.s3db was not found",
		};
	}

	const integrity = checkSqliteIntegrity(databasePath);

	if (!integrity.intact) {
		return {
			cycle: cycle.cycle,
			revision: cycle.revision,
			name: cycle.name,
			status: "CORRUPT",
			error: integrity.error,
		};
	}

	return {
		cycle: cycle.cycle,
		revision: cycle.revision,
		name: cycle.name,
		status: "INTACT",
	};
}

export function airportExists(airportIdentifier: string): boolean {
	const database = openNavigationDatabase();

	try {
		const airport = database
			.prepare(
				"SELECT 1 FROM tbl_airports WHERE airport_identifier = ? LIMIT 1",
			)
			.get(normalizeIdentifier(airportIdentifier));

		return Boolean(airport);
	} finally {
		database.close();
	}
}

export function waypointExists(waypointIdentifier: string): boolean {
	const database = openNavigationDatabase();
	const identifier = normalizeIdentifier(waypointIdentifier);

	try {
		const waypoint = database
			.prepare(
				`SELECT 1 FROM tbl_enroute_waypoints WHERE waypoint_identifier = ?
				UNION
				SELECT 1 FROM tbl_terminal_waypoints WHERE waypoint_identifier = ?
				UNION
				SELECT 1 FROM tbl_vhfnavaids WHERE vor_identifier = ?
				UNION
				SELECT 1 FROM tbl_enroute_ndbnavaids WHERE ndb_identifier = ?
				LIMIT 1`,
			)
			.get(identifier, identifier, identifier, identifier);

		return Boolean(waypoint);
	} finally {
		database.close();
	}
}

export function resolveWaypoint(
	waypointIdentifier: string,
	previous?: RoutePointReference,
): RouteProcedureLeg | null {
	const database = openNavigationDatabase();
	const identifier = normalizeIdentifier(waypointIdentifier);

	try {
		const rows = getWaypointLegCandidates(database, identifier);
		const previousReference = resolveRoutePointReference(database, previous);
		const selectedCandidate = selectAmbiguousWaypointCandidate(
			rows,
			previousReference,
		);
		const selectedRow =
			selectedCandidate === null
				? rows[0]
				: (rows.find(
						(row) =>
							row.areaCode === selectedCandidate.areaCode &&
							row.waypoint_latitude === selectedCandidate.latitude &&
							row.waypoint_longitude === selectedCandidate.longitude,
					) ?? rows[0]);

		return selectedRow ? toProcedureLeg(selectedRow) : null;
	} finally {
		database.close();
	}
}

function getWaypointCandidates(
	database: DatabaseSync,
	identifier: string,
): RoutePointCandidate[] {
	return database
		.prepare(
			`SELECT area_code AS areaCode, waypoint_latitude AS latitude, waypoint_longitude AS longitude
			FROM tbl_enroute_waypoints
			WHERE waypoint_identifier = ?
			UNION ALL
			SELECT area_code AS areaCode, waypoint_latitude AS latitude, waypoint_longitude AS longitude
			FROM tbl_terminal_waypoints
			WHERE waypoint_identifier = ?
			UNION ALL
			SELECT area_code AS areaCode, vor_latitude AS latitude, vor_longitude AS longitude
			FROM tbl_vhfnavaids
			WHERE vor_identifier = ?
			UNION ALL
			SELECT area_code AS areaCode, ndb_latitude AS latitude, ndb_longitude AS longitude
			FROM tbl_enroute_ndbnavaids
			WHERE ndb_identifier = ?
			UNION ALL
			SELECT area_code AS areaCode, ndb_latitude AS latitude, ndb_longitude AS longitude
			FROM tbl_terminal_ndbnavaids
			WHERE ndb_identifier = ?
			UNION ALL
			SELECT area_code AS areaCode, llz_latitude AS latitude, llz_longitude AS longitude
			FROM tbl_localizers_glideslopes
			WHERE llz_identifier = ?`,
		)
		.all(
			identifier,
			identifier,
			identifier,
			identifier,
			identifier,
			identifier,
		) as unknown as RoutePointCandidate[];
}

function getAirportCandidate(
	database: DatabaseSync,
	identifier: string,
): RoutePointCandidate | null {
	const airport = database
		.prepare(
			`SELECT area_code AS areaCode,
				airport_ref_latitude AS latitude,
				airport_ref_longitude AS longitude
			FROM tbl_airports
			WHERE airport_identifier = ?
			LIMIT 1`,
		)
		.get(identifier) as unknown as RoutePointCandidate | undefined;

	return airport ?? null;
}

function resolveRoutePointReference(
	database: DatabaseSync,
	reference?: RoutePointReference,
): ResolvedRoutePointReference | null {
	if (
		typeof reference?.latitude === "number" &&
		typeof reference.longitude === "number"
	) {
		return {
			areaCode: reference.areaCode ?? null,
			latitude: reference.latitude,
			longitude: reference.longitude,
		};
	}

	const identifier = normalizeIdentifier(reference?.identifier ?? "");

	if (!identifier) {
		return null;
	}

	const airportReference = getAirportCandidate(database, identifier);

	return (
		(airportReference ? toRoutePointReference(airportReference) : null) ??
		getWaypointCandidates(database, identifier)
			.map(toRoutePointReference)
			.find((candidate): candidate is ResolvedRoutePointReference =>
				Boolean(candidate),
			) ??
		null
	);
}

function selectAmbiguousWaypointCandidate(
	candidates: RoutePointCandidate[],
	previousReference: ResolvedRoutePointReference | null,
): ResolvedRoutePointReference | null {
	const coordinateCandidates = candidates
		.map(toRoutePointReference)
		.filter((candidate): candidate is ResolvedRoutePointReference =>
			Boolean(candidate),
		);

	if (coordinateCandidates.length === 0) {
		return null;
	}

	if (!previousReference) {
		return coordinateCandidates[0];
	}

	const getNearestCandidate = (
		eligibleCandidates: ResolvedRoutePointReference[],
	): ResolvedRoutePointReference | null =>
		eligibleCandidates.reduce<ResolvedRoutePointReference | null>(
			(nearest, candidate) => {
				if (!nearest) {
					return candidate;
				}

				return getDistanceNm(previousReference, candidate) <
					getDistanceNm(previousReference, nearest)
					? candidate
					: nearest;
			},
			null,
		);

	const sameAreaCandidate = getNearestCandidate(
		coordinateCandidates.filter(
			(candidate) =>
				candidate.areaCode !== null &&
				candidate.areaCode === previousReference.areaCode,
		),
	);

	if (sameAreaCandidate) {
		return sameAreaCandidate;
	}

	return getNearestCandidate(
		coordinateCandidates.filter(
			(candidate) =>
				getDistanceNm(previousReference, candidate) <=
				MAX_AMBIGUOUS_FIX_DISTANCE_NM,
		),
	);
}

export function resolveFlightPlanForIf(
	waypoints: string[],
): IfFlightPlanResolution {
	const database = openNavigationDatabase();
	const ambiguousFixes = new Set<string>();
	let previousReference: ResolvedRoutePointReference | null = null;

	try {
		const resolvedWaypoints = waypoints.map((waypoint) => {
			const identifier = normalizeIdentifier(waypoint);
			const airportCandidate = getAirportCandidate(database, identifier);

			if (airportCandidate) {
				previousReference = toRoutePointReference(airportCandidate);
				return waypoint;
			}

			const candidates = getWaypointCandidates(database, identifier);

				const firstReference = candidates
					.map(toRoutePointReference)
					.find((candidate): candidate is ResolvedRoutePointReference =>
						Boolean(candidate),
					);

			if (candidates.length <= 1) {
				previousReference = firstReference ?? previousReference;
				return waypoint;
			}

			const coordinateCandidate = selectAmbiguousWaypointCandidate(
				candidates,
				previousReference,
			);

			if (!coordinateCandidate) {
				return waypoint;
			}

			ambiguousFixes.add(identifier);
			previousReference = coordinateCandidate;

			return formatIfCoordinate(
				coordinateCandidate.latitude,
				coordinateCandidate.longitude,
			);
		});

		return {
			waypoints: resolvedWaypoints,
			ambiguousFixes: Array.from(ambiguousFixes),
		};
	} finally {
		database.close();
	}
}

export function listRunways(airportIdentifier: string): RunwayDefinition[] {
	const database = openNavigationDatabase();

	try {
		const rows = database
			.prepare(
				`SELECT runway_identifier, runway_length
				FROM tbl_runways
				WHERE airport_identifier = ?
				ORDER BY runway_identifier`,
			)
			.all(normalizeIdentifier(airportIdentifier)) as Array<{
			runway_identifier: string;
			runway_length: number | null;
		}>;

		return rows.map((row) => ({
			identifier: row.runway_identifier,
			length: row.runway_length,
		}));
	} finally {
		database.close();
	}
}

export function runwayExists(
	airportIdentifier: string,
	runwayIdentifier: string,
): boolean {
	const database = openNavigationDatabase();

	try {
		const runway = database
			.prepare(
				`SELECT 1 FROM tbl_runways
				WHERE airport_identifier = ? AND runway_identifier = ?
				LIMIT 1`,
			)
			.get(
				normalizeIdentifier(airportIdentifier),
				normalizeRunwayIdentifier(runwayIdentifier),
			);

		return Boolean(runway);
	} finally {
		database.close();
	}
}

export function getProcedurePreview(
	origin: string,
	destination: string,
	runway: string,
): RouteProcedurePreview {
	const database = openNavigationDatabase();
	const normalizedRunway = normalizeRunwayIdentifier(runway);

	try {
		const sid = database
			.prepare(
				`SELECT procedure_identifier
				FROM tbl_sids
				WHERE airport_identifier = ?
					AND (? = 'RW' OR transition_identifier = ? OR transition_identifier = '')
				ORDER BY procedure_identifier
				LIMIT 1`,
			)
			.get(normalizeIdentifier(origin), normalizedRunway, normalizedRunway) as
			| { procedure_identifier: string }
			| undefined;

		const star = database
			.prepare(
				`SELECT procedure_identifier
				FROM tbl_stars
				WHERE airport_identifier = ?
				ORDER BY procedure_identifier
				LIMIT 1`,
			)
			.get(normalizeIdentifier(destination)) as
			| { procedure_identifier: string }
			| undefined;

		return {
			sid: sid?.procedure_identifier ?? null,
			star: star?.procedure_identifier ?? null,
		};
	} finally {
		database.close();
	}
}

function getTerminalProcedureLegs(
	database: DatabaseSync,
	tableName: "tbl_sids" | "tbl_stars" | "tbl_iaps",
	airport: string,
	procedure: string,
	routeType: string | null,
	transition: string | null,
): RouteProcedureLeg[] {
	const routeTypeFilter = routeType ? "AND route_type = ?" : "";
	const transitionFilter = transition ? "AND transition_identifier = ?" : "";
	const parameters = [
		normalizeIdentifier(airport),
		normalizeIdentifier(procedure),
		...(routeType ? [routeType] : []),
		...(transition ? [normalizeIdentifier(transition)] : []),
	];

	const rows = database
		.prepare(
			`SELECT seqno,
				waypoint_identifier,
				waypoint_latitude,
				waypoint_longitude,
				path_termination,
				magnetic_course,
				altitude_description,
				altitude1,
				altitude2
			FROM ${tableName}
			WHERE airport_identifier = ?
				AND procedure_identifier = ?
				${routeTypeFilter}
				${transitionFilter}
			ORDER BY seqno`,
		)
		.all(...parameters) as unknown as Array<{
		seqno: number | null;
		waypoint_identifier: string;
		waypoint_latitude: number | null;
		waypoint_longitude: number | null;
		path_termination: string | null;
		magnetic_course: number | null;
		altitude_description: string | null;
		altitude1: number | null;
		altitude2: number | null;
	}>;

	return rows
		.map((row) => toProcedureLeg(row))
		.filter((leg): leg is RouteProcedureLeg => Boolean(leg));
}

function dedupeAdjacentProcedureLegs(
	legs: RouteProcedureLeg[],
): RouteProcedureLeg[] {
	return legs.filter(
		(leg, index) =>
			index === 0 || leg.waypoint.name !== legs[index - 1].waypoint.name,
	);
}

export function getSidProcedure(
	airport: string,
	identifier: string,
	transition: string,
): StructuredRouteProcedure {
	const database = openNavigationDatabase();

	try {
		return {
			identifier: normalizeIdentifier(identifier),
			transition: normalizeIdentifier(transition),
			procedure: getTerminalProcedureLegs(
				database,
				"tbl_sids",
				airport,
				identifier,
				null,
				transition,
			),
		};
	} finally {
		database.close();
	}
}

function groupProcedureOptions(rows: Array<{
	procedure_identifier: string;
	transition_identifier: string | null;
}>): ProcedureOption[] {
	const grouped = new Map<string, Set<string>>();

	for (const row of rows) {
		if (!row.procedure_identifier) {
			continue;
		}

		const transitions = grouped.get(row.procedure_identifier) ?? new Set<string>();

		transitions.add(row.transition_identifier ?? "");

		grouped.set(row.procedure_identifier, transitions);
	}

	return Array.from(grouped.entries()).map(([identifier, transitions]) => ({
		identifier,
		transitions: Array.from(transitions).sort(),
	}));
}

export function listDepartureSids(
	airport: string,
	runway: string,
): ProcedureOption[] {
	if (!airport || !runway) {
		return [];
	}

	const database = openNavigationDatabase();
	const transition = normalizeRunwayIdentifier(runway);

	try {
		const rows = database
			.prepare(
				`SELECT DISTINCT procedure_identifier, transition_identifier
				FROM tbl_sids
				WHERE airport_identifier = ?
					AND transition_identifier = ?
					AND waypoint_identifier <> ''
				ORDER BY procedure_identifier`,
			)
			.all(normalizeIdentifier(airport), transition) as unknown as Array<{
			procedure_identifier: string;
			transition_identifier: string | null;
		}>;

		return groupProcedureOptions(rows);
	} finally {
		database.close();
	}
}

export function listArrivalStars(airport: string): ProcedureOption[] {
	if (!airport) {
		return [];
	}

	const database = openNavigationDatabase();

	try {
		const rows = database
			.prepare(
				`SELECT DISTINCT procedure_identifier, transition_identifier
				FROM tbl_stars
				WHERE airport_identifier = ?
					AND waypoint_identifier <> ''
				ORDER BY procedure_identifier, transition_identifier`,
			)
			.all(normalizeIdentifier(airport)) as unknown as Array<{
			procedure_identifier: string;
			transition_identifier: string | null;
		}>;

		return groupProcedureOptions(rows);
	} finally {
		database.close();
	}
}

export function listApproaches(airport: string): ApproachOption[] {
	if (!airport) {
		return [];
	}

	const database = openNavigationDatabase();

	try {
		const rows = database
			.prepare(
				`SELECT DISTINCT procedure_identifier, route_type, transition_identifier
				FROM tbl_iaps
				WHERE airport_identifier = ?
					AND waypoint_identifier <> ''
				ORDER BY procedure_identifier, route_type, transition_identifier`,
			)
			.all(normalizeIdentifier(airport)) as unknown as Array<{
			procedure_identifier: string;
			route_type: string | null;
			transition_identifier: string | null;
		}>;
		const grouped = new Map<
			string,
			{
				routeTypes: Set<string>;
				transitions: Set<string>;
			}
		>();

		for (const row of rows) {
			const approach = grouped.get(row.procedure_identifier) ?? {
				routeTypes: new Set<string>(),
				transitions: new Set<string>(),
			};

			if (row.route_type) {
				approach.routeTypes.add(row.route_type);
			}

			if (row.route_type !== "R" && row.transition_identifier) {
				approach.transitions.add(row.transition_identifier);
			}

			grouped.set(row.procedure_identifier, approach);
		}

		return Array.from(grouped.entries()).flatMap(
			([identifier, { routeTypes, transitions }]) => {
				const transitionList = Array.from(transitions).sort();

				if (transitionList.length === 0) {
					return [
						{
							identifier,
							routeTypes: Array.from(routeTypes).sort(),
							transition: "",
						},
					];
				}

				return transitionList.map((transition) => ({
					identifier,
					routeTypes: Array.from(routeTypes).sort(),
					transition,
				}));
			},
		);
	} finally {
		database.close();
	}
}

export function getStarProcedure(
	airport: string,
	identifier: string,
	commonTransition: string,
	runwayTransition: string,
): StructuredArrivalProcedure {
	const database = openNavigationDatabase();

	try {
		const transitionRoute =
			commonTransition && commonTransition !== "ALL"
				? getTerminalProcedureLegs(
						database,
						"tbl_stars",
						airport,
						identifier,
						"4",
						commonTransition,
					)
				: [];
		const commonRoute = getTerminalProcedureLegs(
			database,
			"tbl_stars",
			airport,
			identifier,
			"5",
			null,
		);

		return {
			identifier: normalizeIdentifier(identifier),
			transition: normalizeIdentifier(runwayTransition),
			commonRoute: dedupeAdjacentProcedureLegs([
				...transitionRoute,
				...commonRoute,
			]),
			runwayTransitionRoute: runwayTransition
				? getTerminalProcedureLegs(
						database,
						"tbl_stars",
						airport,
						identifier,
						"6",
						runwayTransition,
					)
				: [],
		};
	} finally {
		database.close();
	}
}

export function getApproachProcedure(
	airport: string,
	identifier: string,
	transition = "",
): StructuredApproachProcedure {
	const database = openNavigationDatabase();
	const normalizedIdentifier = normalizeIdentifier(identifier);
	const normalizedTransition = normalizeIdentifier(transition);

	try {
		const localizer = database
			.prepare(
				`SELECT recommanded_navaid
				FROM tbl_iaps
				WHERE airport_identifier = ?
					AND procedure_identifier = ?
					AND recommanded_navaid IS NOT NULL
					AND recommanded_navaid <> ''
				LIMIT 1`,
			)
			.get(normalizeIdentifier(airport), normalizedIdentifier) as unknown as
			| { recommanded_navaid: string }
			| undefined;

		return {
			identifier: normalizedIdentifier,
			localiserIdentifier: localizer?.recommanded_navaid ?? null,
			procedure: dedupeAdjacentProcedureLegs([
				...(normalizedTransition
					? getTerminalProcedureLegs(
							database,
							"tbl_iaps",
							airport,
							identifier,
							"A",
							normalizedTransition,
						)
					: []),
				...getTerminalProcedureLegs(
					database,
					"tbl_iaps",
					airport,
					identifier,
					"R",
					null,
				),
			]),
			missedApproachProcedure: [],
		};
	} finally {
		database.close();
	}
}

export function expandAirway(
	routeIdentifier: string,
	fromWaypoint: string,
	toWaypoint: string,
): AirwayExpansion | null {
	const database = openNavigationDatabase();
	const route = normalizeIdentifier(routeIdentifier);
	const from = normalizeIdentifier(fromWaypoint);
	const to = normalizeIdentifier(toWaypoint);

	try {
		const rows = database
			.prepare(
				`SELECT seqno,
					waypoint_identifier,
					waypoint_latitude,
					waypoint_longitude,
					NULL AS path_termination,
					outbound_course AS magnetic_course,
					NULL AS altitude_description,
					minimum_altitude1 AS altitude1,
					minimum_altitude2 AS altitude2
				FROM tbl_enroute_airways
				WHERE route_identifier = ?
				ORDER BY seqno`,
			)
			.all(route) as Array<{
			seqno: number;
			waypoint_identifier: string;
			waypoint_latitude: number | null;
			waypoint_longitude: number | null;
			path_termination: string | null;
			magnetic_course: number | null;
			altitude_description: string | null;
			altitude1: number | null;
			altitude2: number | null;
		}>;

		const fromIndex = rows.findIndex((row) => row.waypoint_identifier === from);
		const toIndex = rows.findIndex((row) => row.waypoint_identifier === to);

		if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
			return null;
		}

		const range =
			fromIndex < toIndex
				? rows.slice(fromIndex + 1, toIndex + 1)
				: rows.slice(toIndex, fromIndex).reverse();

		return {
			routeIdentifier: route,
			waypoints: range.map((row) => row.waypoint_identifier),
			fixes: range
				.map((row) => toProcedureLeg(row))
				.filter((leg): leg is RouteProcedureLeg => Boolean(leg)),
		};
	} finally {
		database.close();
	}
}
