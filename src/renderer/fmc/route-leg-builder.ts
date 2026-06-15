import type { RoutePlanState, RouteProcedureLeg } from "./types";

export interface BuiltRouteLeg {
	key: string;
	name: string;
	leg: RouteProcedureLeg;
	previous: { latitude: number; longitude: number } | null;
	index: number;
	holdId?: string;
}

function createBaseRows(plan: RoutePlanState): BuiltRouteLeg[] {
	const legs = [
		...(plan.structuredRoute.departure.sid?.procedure ?? []),
		...plan.segments.flatMap((segment) => segment.fixes),
		...(plan.structuredRoute.arrival.star?.commonRoute ?? []),
		...(plan.structuredRoute.arrival.star?.runwayTransitionRoute ?? []),
		...(plan.structuredRoute.arrival.approach?.procedure ?? []),
	].filter((leg) => Boolean(leg.waypoint.name));
	const counts = new Map<string, number>();
	let previous: { latitude: number; longitude: number } | null = null;

	return legs.map((leg, index) => {
		const name = leg.waypoint.name;
		const count = (counts.get(name) ?? 0) + 1;
		counts.set(name, count);
		const row = {
			key: `${name}#${count}`,
			name,
			leg,
			previous,
			index,
		};

		previous = {
			latitude: leg.waypoint.latitude,
			longitude: leg.waypoint.longitude,
		};

		return row;
	});
}

function createHoldRows(
	plan: RoutePlanState,
	previous: { latitude: number; longitude: number } | null,
	holdId: string,
): BuiltRouteLeg[] {
	const hold = (plan.holds ?? []).find((candidate) => candidate.id === holdId);

	if (!hold) {
		return [];
	}

	const rows: BuiltRouteLeg[] = [];
	let holdPrevious = previous;

	if (hold.kind !== "ON_ROUTE") {
		rows.push({
			key: `${hold.id}:DIRECT`,
			name: hold.fixName,
			holdId: hold.id,
			leg: {
				seqno: 0,
				waypoint: hold.waypoint,
				tracking: { type: "DIRECT" },
			},
			previous: holdPrevious,
			index: -1,
		});
		holdPrevious = {
			latitude: hold.waypoint.latitude,
			longitude: hold.waypoint.longitude,
		};
	}

	rows.push({
		key: `${hold.id}:HOLD`,
		name: hold.fixName,
		holdId: hold.id,
		leg: {
			seqno: 0,
			waypoint: hold.waypoint,
			tracking: {
				type: "HOLD",
				course: hold.inboundCourse,
			},
			holdId: hold.id,
		},
		previous: holdPrevious,
		index: -1,
	});

	return rows;
}

export function buildRouteLegRows(plan: RoutePlanState): BuiltRouteLeg[] {
	const baseRows = createBaseRows(plan);
	const rows: BuiltRouteLeg[] = [];
	const holdsByInsertionKey = new Map<string, string[]>();

	for (const hold of plan.holds ?? []) {
		if (!hold.insertionAfterLegKey) {
			continue;
		}

		holdsByInsertionKey.set(hold.insertionAfterLegKey, [
			...(holdsByInsertionKey.get(hold.insertionAfterLegKey) ?? []),
			hold.id,
		]);
	}

	for (const row of baseRows) {
		rows.push(row);

		for (const holdId of holdsByInsertionKey.get(row.key) ?? []) {
			rows.push(
				...createHoldRows(plan, row.leg.waypoint, holdId),
			);
		}
	}

	return rows.map((row, index) => ({
		...row,
		index,
	}));
}
