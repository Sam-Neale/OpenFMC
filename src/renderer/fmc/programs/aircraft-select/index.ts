import {
	createFmcProgram,
	type FmcProgramApi,
	type FmcSdkSlot,
} from "../../sdk";
import type { AircraftDefinition } from "../../types";

const AIRCRAFT_PER_PAGE = 5;

function getAircraftForPage(
	aircraft: readonly AircraftDefinition[],
	pageIndex: number,
): AircraftDefinition[] {
	const start = pageIndex * AIRCRAFT_PER_PAGE;

	return aircraft.slice(start, start + AIRCRAFT_PER_PAGE);
}

function getAircraftPageCount(api: FmcProgramApi): number {
	if (
		api.store.aircraftSelect.status !== "READY" ||
		api.store.aircraftSelect.aircraft.length === 0
	) {
		return 1;
	}

	return Math.ceil(
		api.store.aircraftSelect.aircraft.length / AIRCRAFT_PER_PAGE,
	);
}

function incrementErrorMessage(currentMessage: string | null): string {
	const baseMessage = "AIRCRAFT LIST ERROR";

	if (!currentMessage) {
		return `${baseMessage} (x1)`;
	}

	const match = currentMessage.match(/\(x(\d+)\)\s*$/);

	if (!match) {
		return `${baseMessage} (x1)`;
	}

	const currentCount = Number(match[1]);

	return `${baseMessage} (x${currentCount + 1})`;
}

async function reloadAircraftList(api: FmcProgramApi): Promise<void> {
	const previousMessage = api.store.message;

	api.updateStore((current) => ({
		...current,
		aircraftSelect: {
			...current.aircraftSelect,
			status: "LOADING",
			error: null,
		},
		message: "LOADING AIRCRAFT",
	}));

	try {
		const aircraft = await api.services.aircraft.refresh();

		api.updateStore((current) => ({
			...current,
			pageIndex: 0,
			aircraftSelect: {
				aircraft,
				status: "READY",
				error: null,
				returnProgram: current.aircraftSelect.returnProgram,
			},
			message: "AIRCRAFT LIST UPDATED",
		}));
	} catch (error) {
		const errorMessage = incrementErrorMessage(previousMessage);

		api.updateStore((current) => ({
			...current,
			aircraftSelect: {
				...current.aircraftSelect,
				status: "ERROR",
				error:
					error instanceof Error
						? error.message
						: "Unknown aircraft list error",
			},
			message: errorMessage,
		}));
	}
}

function selectAircraft(api: FmcProgramApi, aircraft: AircraftDefinition): void {
	const returnProgram = api.store.aircraftSelect.returnProgram ?? "MENU";

	api.updateStore((current) => ({
		...current,
		setup: {
			...current.setup,
			selectedAircraft: {
				id: aircraft.id,
				name: aircraft.name,
			},
		},
		aircraftSelect: {
			...current.aircraftSelect,
			returnProgram: null,
		},
		message: null,
	}));

	api.setProgram(returnProgram);
	api.showMessage(`${aircraft.id} SELECTED`);
}

function renderLoadingSlots(): FmcSdkSlot[] {
	return [
		{},
		{},
		{
			valueCenter: "LOADING...",
		},
		{},
		{},
		{
			valueLeft: "<RETURN",
			valueRight: "RELOAD>",
		},
	];
}

function renderErrorSlots(api: FmcProgramApi): FmcSdkSlot[] {
	return [
		{},
		{},
		{
			valueLeft: "<RETRY",
			valueCenter: "LOAD FAILED",
			onLeft: () => reloadAircraftList(api),
		},
		{},
		{},
		{
			valueLeft: "<RETURN",
			valueRight: "RELOAD>",
			onLeft: () => api.setProgram(api.store.aircraftSelect.returnProgram ?? "MENU"),
			onRight: () => reloadAircraftList(api),
		},
	];
}

export const aircraftSelectProgram = createFmcProgram({
	id: "AIRCRAFT_SELECT",

	pages(api) {
		const pageCount = getAircraftPageCount(api);

		return Array.from({ length: pageCount }, (_, pageIndex) => ({
			title: "SELECT AIRCRAFT",
			slots(pageApi: FmcProgramApi) {
				if (pageApi.store.aircraftSelect.status === "LOADING") {
					return renderLoadingSlots();
				}

				if (pageApi.store.aircraftSelect.status === "ERROR") {
					return renderErrorSlots(pageApi);
				}

				const pageAircraft = getAircraftForPage(
					pageApi.store.aircraftSelect.aircraft,
					pageIndex,
				);

				const slots: FmcSdkSlot[] = pageAircraft.map((aircraft) => ({
					valueLeft: `<${aircraft.name}`,
					onLeft: () => selectAircraft(pageApi, aircraft),
				}));

				while (slots.length < AIRCRAFT_PER_PAGE) {
					slots.push({});
				}

				slots.push({
					valueLeft: "<RETURN",
					valueRight: pageApi.store.setup.selectedAircraft
						? `${pageApi.store.setup.selectedAircraft.id}>`
						: "RELOAD>",
					onLeft: () =>
						pageApi.setProgram(pageApi.store.aircraftSelect.returnProgram ?? "MENU"),
					onRight: () =>
						pageApi.store.setup.selectedAircraft
							? pageApi.setProgram(
									pageApi.store.aircraftSelect.returnProgram ?? "MENU",
								)
							: reloadAircraftList(pageApi),
				});

				return slots;
			},
		}));
	},

	async onEnter(api) {
		if (
			api.store.aircraftSelect.status === "READY" &&
			api.store.aircraftSelect.aircraft.length > 0
		) {
			return;
		}

		api.updateStore((current) => ({
			...current,
			aircraftSelect: {
				...current.aircraftSelect,
				status: "LOADING",
				error: null,
			},
			message: "LOADING AIRCRAFT",
		}));

		try {
			const aircraft = await api.services.aircraft.list();

			api.updateStore((current) => ({
				...current,
				pageIndex: 0,
				aircraftSelect: {
					aircraft,
					status: "READY",
					error: null,
					returnProgram: current.aircraftSelect.returnProgram,
				},
				message: null,
			}));
		} catch (error) {
			api.updateStore((current) => ({
				...current,
				aircraftSelect: {
					aircraft: [],
					status: "ERROR",
					returnProgram: current.aircraftSelect.returnProgram,
					error:
						error instanceof Error
							? error.message
							: "Unknown aircraft list error",
				},
				message: "AIRCRAFT LIST ERROR",
			}));
		}
	},
});
