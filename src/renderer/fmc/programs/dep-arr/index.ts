import {
	createFmcProgram,
	type FmcProgramApi,
	type FmcSdkPage,
	type FmcSdkSlot,
} from "../../sdk";
import type {
	ApproachOption,
	FmcState,
	ProcedureOption,
	RoutePlanState,
	StructuredRoute,
} from "../../types";

const SID_ROWS_PER_PAGE = 5;
const RUNWAY_ROWS_PER_PAGE = 4;
const ARRIVAL_ROWS_PER_PAGE = 5;

function getRoutePlan(state: Readonly<FmcState>): RoutePlanState {
	return state.route.plans[state.route.selectedRoute];
}

function formatRunway(runway: string): string {
	return runway.replace(/^RW/i, "");
}

function normalizeRunway(runway: string): string {
	const normalized = runway.trim().toUpperCase();

	if (!normalized) {
		return "";
	}

	return normalized.startsWith("RW") ? normalized : `RW${normalized}`;
}

function getArrivalRunwayFromApproach(identifier: string): string {
	const match = identifier.match(/^[A-Z]?(\d{2}[LRC]?)$/);

	return match ? match[1] : "";
}

function createStructuredRoute(plan: RoutePlanState): StructuredRoute {
	return {
		departure: {
			icao: plan.origin,
			runway: formatRunway(plan.departureRunway),
			sid: plan.structuredRoute.departure.sid,
		},
		enroute: plan.segments.map((segment) => ({
			airway: segment.via,
			fixes: segment.fixes,
		})),
		arrival: {
			icao: plan.destination,
			runway: plan.structuredRoute.arrival.runway,
			star: plan.structuredRoute.arrival.star,
			approach: plan.structuredRoute.arrival.approach,
		},
	};
}

function updateSelectedRoutePlan(
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
						structuredRoute: createStructuredRoute(nextPlan),
					};
				})(),
			},
		},
	}));
}

function getOrderedDepartureRunways(api: FmcProgramApi) {
	const routeRunway = getRoutePlan(api.store).departureRunway;
	const runways = [...api.store.depArr.departureRunways].sort((a, b) =>
		a.identifier.localeCompare(b.identifier),
	);

	if (!routeRunway) {
		return runways;
	}

	return runways.sort((a, b) => {
		if (a.identifier === routeRunway) {
			return -1;
		}

		if (b.identifier === routeRunway) {
			return 1;
		}

		return a.identifier.localeCompare(b.identifier);
	});
}

async function loadDepartureData(api: FmcProgramApi): Promise<void> {
	const plan = getRoutePlan(api.store);

	if (!plan.origin) {
		api.showMessage("ORIGIN REQUIRED");
		return;
	}

	api.updateStore((current) => ({
		...current,
		depArr: {
			...current.depArr,
			status: "LOADING",
			error: null,
		},
	}));

	try {
		const selectedDepartureRunway =
			api.store.depArr.selectedDepartureRunway === plan.departureRunway
				? api.store.depArr.selectedDepartureRunway
				: "";
		const [runways, sids] = await Promise.all([
			api.services.navigationDatabase.listRunways(plan.origin),
			selectedDepartureRunway
				? api.services.navigationDatabase.listDepartureSids(
						plan.origin,
						selectedDepartureRunway,
					)
				: Promise.resolve([]),
		]);

		api.updateStore((current) => ({
			...current,
			depArr: {
				...current.depArr,
				selectedDepartureRunway,
				departureRunways: runways,
				departureSids: sids,
				status: "READY",
				error: null,
			},
		}));
	} catch (error) {
		api.updateStore((current) => ({
			...current,
			depArr: {
				...current.depArr,
				status: "ERROR",
				error: error instanceof Error ? error.message : "DEP DATA ERROR",
			},
			message: "DEP DATA ERROR",
		}));
	}
}

async function confirmDepartureRunway(
	api: FmcProgramApi,
	runway: string,
): Promise<void> {
	const plan = getRoutePlan(api.store);

	if (!plan.origin) {
		api.showMessage("ORIGIN REQUIRED");
		return;
	}

	const normalizedRunway = normalizeRunway(runway);
	const sids = await api.services.navigationDatabase.listDepartureSids(
		plan.origin,
		normalizedRunway,
	);

	updateSelectedRoutePlan(api, (currentPlan) => ({
		...currentPlan,
		departureRunway: normalizedRunway,
		structuredRoute: {
			...currentPlan.structuredRoute,
			departure: {
				...currentPlan.structuredRoute.departure,
				runway: formatRunway(normalizedRunway),
				sid: null,
			},
		},
		isActive: false,
	}));
	api.updateStore((current) => ({
		...current,
		pageIndex: 0,
		depArr: {
			...current.depArr,
			selectedDepartureRunway: normalizedRunway,
			departureSids: sids,
		},
	}));
	api.showMessage(`${normalizedRunway} SELECTED`);
}

async function selectSid(
	api: FmcProgramApi,
	sid: ProcedureOption,
): Promise<void> {
	const plan = getRoutePlan(api.store);
	const transition = api.store.depArr.selectedDepartureRunway;

	if (!plan.origin || !transition) {
		api.showMessage("RUNWAY REQUIRED");
		return;
	}

	const procedure = await api.services.navigationDatabase.getSidProcedure(
		plan.origin,
		sid.identifier,
		transition,
	);

	updateSelectedRoutePlan(api, (currentPlan) => ({
		...currentPlan,
		structuredRoute: {
			...currentPlan.structuredRoute,
			departure: {
				icao: currentPlan.origin,
				runway: formatRunway(currentPlan.departureRunway),
				sid: procedure,
			},
		},
		isActive: false,
	}));
	api.showMessage(`${sid.identifier} SELECTED`);
}

function eraseDeparture(api: FmcProgramApi): void {
	updateSelectedRoutePlan(api, (plan) => ({
		...plan,
		departureRunway: "",
		structuredRoute: {
			...plan.structuredRoute,
			departure: {
				icao: plan.origin,
				runway: "",
				sid: null,
			},
		},
		isActive: false,
	}));
	api.updateStore((current) => ({
		...current,
		pageIndex: 0,
		depArr: {
			...current.depArr,
			selectedDepartureRunway: "",
			departureSids: [],
		},
	}));
	api.showMessage("DEP ERASED");
}

async function loadArrivalData(api: FmcProgramApi): Promise<void> {
	const plan = getRoutePlan(api.store);

	if (!plan.destination) {
		api.showMessage("DEST REQUIRED");
		return;
	}

	api.updateStore((current) => ({
		...current,
		depArr: {
			...current.depArr,
			status: "LOADING",
			error: null,
		},
	}));

	try {
		const [stars, approaches] = await Promise.all([
			api.services.navigationDatabase.listArrivalStars(plan.destination),
			api.services.navigationDatabase.listApproaches(plan.destination),
		]);

		api.updateStore((current) => ({
			...current,
			depArr: {
				...current.depArr,
				arrivalStars: stars,
				arrivalApproaches: approaches,
				status: "READY",
				error: null,
			},
		}));
	} catch (error) {
		api.updateStore((current) => ({
			...current,
			depArr: {
				...current.depArr,
				status: "ERROR",
				error: error instanceof Error ? error.message : "ARR DATA ERROR",
			},
			message: "ARR DATA ERROR",
		}));
	}
}

async function selectApproach(
	api: FmcProgramApi,
	approach: ApproachOption,
): Promise<void> {
	const plan = getRoutePlan(api.store);

	if (!plan.destination) {
		api.showMessage("DEST REQUIRED");
		return;
	}

	const procedure = await api.services.navigationDatabase.getApproachProcedure(
		plan.destination,
		approach.identifier,
		approach.transition,
	);
	const runway = getArrivalRunwayFromApproach(approach.identifier);
	const selectedStar = plan.structuredRoute.arrival.star;
	const starOption = selectedStar
		? api.store.depArr.arrivalStars.find(
				(star) => star.identifier === selectedStar.identifier,
			)
		: null;
	const refreshedStar =
		selectedStar && starOption
			? await getStarProcedureForRunway(api, plan.destination, starOption, runway)
			: selectedStar;

	updateSelectedRoutePlan(api, (currentPlan) => ({
		...currentPlan,
		structuredRoute: {
			...currentPlan.structuredRoute,
			arrival: {
				...currentPlan.structuredRoute.arrival,
				icao: currentPlan.destination,
				runway,
				star: refreshedStar,
				approach: procedure,
			},
		},
		isActive: false,
	}));
	api.showMessage(`${approach.transition || approach.identifier} SELECTED`);
}

function getStarCommonTransition(star: ProcedureOption): string {
	return (
		star.transitions.find(
			(transition) =>
				transition !== "" &&
				transition !== "ALL" &&
				!transition.startsWith("RW"),
		) ??
		star.transitions.find((transition) => transition === "") ??
		star.transitions.find((transition) => transition === "ALL") ??
		""
	);
}

function getStarRunwayTransition(
	star: ProcedureOption,
	arrivalRunway: string,
): string {
	const normalizedRunway = normalizeRunway(arrivalRunway);

	const exactTransition = star.transitions.find(
		(transition) => transition === normalizedRunway,
	);

	if (exactTransition) {
		return exactTransition;
	}

	const runwayNumber = normalizedRunway.match(/^RW(\d{2})[LRC]?$/)?.[1];

	if (!runwayNumber) {
		return "";
	}

	return (
		star.transitions.find((transition) => transition === `RW${runwayNumber}B`) ??
		""
	);
}

async function getStarProcedureForRunway(
	api: FmcProgramApi,
	airport: string,
	star: ProcedureOption,
	arrivalRunway: string,
) {
	const commonTransition = getStarCommonTransition(star);
	const runwayTransition = getStarRunwayTransition(star, arrivalRunway);

	return api.services.navigationDatabase.getStarProcedure(
		airport,
		star.identifier,
		commonTransition,
		runwayTransition,
	);
}

async function selectStar(
	api: FmcProgramApi,
	star: ProcedureOption,
): Promise<void> {
	const plan = getRoutePlan(api.store);

	if (!plan.destination) {
		api.showMessage("DEST REQUIRED");
		return;
	}

	const arrivalRunway = plan.structuredRoute.arrival.runway;
	const runwayTransition = getStarRunwayTransition(star, arrivalRunway);
	const hasRunwayTransitions = star.transitions.some((transition) =>
		transition.startsWith("RW"),
	);

	if (hasRunwayTransitions && arrivalRunway && !runwayTransition) {
		api.showMessage("NO STAR RW TRANS");
	}

	const procedure = await getStarProcedureForRunway(
		api,
		plan.destination,
		star,
		arrivalRunway,
	);

	updateSelectedRoutePlan(api, (currentPlan) => ({
		...currentPlan,
		structuredRoute: {
			...currentPlan.structuredRoute,
			arrival: {
				...currentPlan.structuredRoute.arrival,
				icao: currentPlan.destination,
				star: procedure,
			},
		},
		isActive: false,
	}));

	if (!(hasRunwayTransitions && arrivalRunway && !runwayTransition)) {
		api.showMessage(`${star.identifier} SELECTED`);
	}
}

function eraseArrival(api: FmcProgramApi): void {
	updateSelectedRoutePlan(api, (plan) => ({
		...plan,
		structuredRoute: {
			...plan.structuredRoute,
			arrival: {
				icao: plan.destination,
				runway: "",
				star: null,
				approach: null,
			},
		},
		isActive: false,
	}));
	api.showMessage("ARR ERASED");
}

function createDeparturePage(pageIndex: number, pageCount: number): FmcSdkPage {
	return {
		title: "DEP/ARR",
		page: `${pageIndex + 1}/${pageCount}`,
		slots(api) {
			const runways = getOrderedDepartureRunways(api).slice(
				pageIndex * RUNWAY_ROWS_PER_PAGE,
				pageIndex * RUNWAY_ROWS_PER_PAGE + RUNWAY_ROWS_PER_PAGE,
			);
			const sids = api.store.depArr.departureSids.slice(
				pageIndex * SID_ROWS_PER_PAGE,
				pageIndex * SID_ROWS_PER_PAGE + SID_ROWS_PER_PAGE,
			);
			const slots: FmcSdkSlot[] = Array.from({ length: 5 }, (_, rowIndex) => {
				const sid = sids[rowIndex];
				const runway = runways[rowIndex - 1];

				return {
					labelLeft: rowIndex === 0 ? "SIDS" : undefined,
					labelCenter: rowIndex === 0 ? `RTE${api.store.route.selectedRoute}` : undefined,
					labelRight: rowIndex === 0 ? "RUNWAYS" : undefined,
					valueLeft: sid ? `<${sid.identifier}` : undefined,
					valueRight: runway ? `${runway.identifier}>` : undefined,
					onLeft: sid ? () => selectSid(api, sid) : undefined,
					onRight: runway
						? () => confirmDepartureRunway(api, runway.identifier)
						: undefined,
				};
			});

			slots.push({
				valueLeft: "<ERASE",
				valueRight: "ROUTE>",
				onLeft: () => eraseDeparture(api),
				onRight: () => api.setProgram("RTE"),
			});

			return slots;
		},
	};
}

function createArrivalPage(pageIndex: number, pageCount: number): FmcSdkPage {
	return {
		title: "DEP/ARR",
		page: `${pageIndex + 1}/${pageCount}`,
		slots(api) {
			const stars = api.store.depArr.arrivalStars.slice(
				pageIndex * ARRIVAL_ROWS_PER_PAGE,
				pageIndex * ARRIVAL_ROWS_PER_PAGE + ARRIVAL_ROWS_PER_PAGE,
			);
			const approaches = api.store.depArr.arrivalApproaches.slice(
				pageIndex * ARRIVAL_ROWS_PER_PAGE,
				pageIndex * ARRIVAL_ROWS_PER_PAGE + ARRIVAL_ROWS_PER_PAGE,
			);
			const slots: FmcSdkSlot[] = Array.from({ length: 5 }, (_, rowIndex) => {
				const star = stars[rowIndex];
				const approach = approaches[rowIndex];

				return {
					labelLeft: rowIndex === 0 ? "STARS" : undefined,
					labelCenter: rowIndex === 0 ? `RTE${api.store.route.selectedRoute}` : undefined,
					labelRight: rowIndex === 0 ? "IAPS" : undefined,
					valueLeft: star ? `<${star.identifier}` : undefined,
					valueRight: approach
						? `${approach.identifier}${approach.transition ? `/${approach.transition}` : ""}>`
						: undefined,
					onLeft: star ? () => selectStar(api, star) : undefined,
					onRight: approach ? () => selectApproach(api, approach) : undefined,
				};
			});

			slots.push({
				valueLeft: "<ERASE",
				valueRight: "ROUTE>",
				onLeft: () => eraseArrival(api),
				onRight: () => api.setProgram("RTE"),
			});

			return slots;
		},
	};
}

export const depArrProgram = createFmcProgram({
	id: "DEP_ARR",

	pages(api) {
		if (api.store.depArr.mode === "ARRIVALS") {
			const pageCount = Math.max(
				1,
				Math.ceil(
					Math.max(
						api.store.depArr.arrivalStars.length,
						api.store.depArr.arrivalApproaches.length,
					) / ARRIVAL_ROWS_PER_PAGE,
				),
			);

			return Array.from({ length: pageCount }, (_, pageIndex) =>
				createArrivalPage(pageIndex, pageCount),
			);
		}

		const pageCount = Math.max(
			1,
			Math.max(
				Math.ceil(api.store.depArr.departureSids.length / SID_ROWS_PER_PAGE),
				Math.ceil(
					api.store.depArr.departureRunways.length / RUNWAY_ROWS_PER_PAGE,
				),
			),
		);

		return Array.from({ length: pageCount }, (_, pageIndex) =>
			createDeparturePage(pageIndex, pageCount),
		);
	},

	onEnter(api) {
		return api.store.depArr.mode === "ARRIVALS"
			? loadArrivalData(api)
			: loadDepartureData(api);
	},
});
