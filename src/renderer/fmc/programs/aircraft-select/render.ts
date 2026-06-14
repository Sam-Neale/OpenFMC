import type {
	AircraftDefinition,
	FmcScreenModel,
	FmcScreenSlot,
	FmcState,
} from "../../types";

type ProgramScreen = Omit<FmcScreenModel, "scratchpad" | "execLight">;

export const AIRCRAFT_PER_PAGE = 5;

export function getAircraftForPage(
	aircraft: readonly AircraftDefinition[],
	pageIndex: number,
): AircraftDefinition[] {
	const start = pageIndex * AIRCRAFT_PER_PAGE;

	return aircraft.slice(start, start + AIRCRAFT_PER_PAGE);
}

export function getAircraftPageCount(state: Readonly<FmcState>): number {
	if (
		state.aircraftSelect.status !== "READY" ||
		state.aircraftSelect.aircraft.length === 0
	) {
		return 1;
	}
	return Math.ceil(state.aircraftSelect.aircraft.length / AIRCRAFT_PER_PAGE);
}

export function renderAircraftSelect(state: Readonly<FmcState>): ProgramScreen {
	const pageCount = getAircraftPageCount(state);

	const pageIndex = Math.max(0, Math.min(state.pageIndex, pageCount - 1));

	if (state.aircraftSelect.status === "LOADING") {
		return {
			title: "SELECT AIRCRAFT",
			page: "1/1",

			slots: [
				{},
				{},
				{
					valueCenter: "LOADING...",
				},
				{},
				{},
				{
					valueLeft: "<SETUP",
				},
			],
		};
	}

	if (state.aircraftSelect.status === "ERROR") {
		return {
			title: "SELECT AIRCRAFT",
			page: "1/1",

			slots: [
				{},
				{
					valueCenter: "LOAD FAILED",
				},
				{
					valueCenter: "<RETRY",
				},
				{},
				{},
				{
					valueLeft: "<SETUP",
				},
			],
		};
	}

	const pageAircraft = getAircraftForPage(
		state.aircraftSelect.aircraft,
		pageIndex,
	);

	const slots: FmcScreenSlot[] = pageAircraft.map((aircraft) => ({
		valueLeft: `<${aircraft.name}`,
	}));

	while (slots.length < AIRCRAFT_PER_PAGE) {
		slots.push({});
	}

	slots.push({
		valueLeft: "<SETUP",
		valueRight: state.setup.selectedAircraft
			? `${state.setup.selectedAircraft.id}>`
			: undefined,
	});

	return {
		title: "SELECT AIRCRAFT",
		page: `${pageIndex + 1}/${pageCount}`,
		slots,
	};
}
