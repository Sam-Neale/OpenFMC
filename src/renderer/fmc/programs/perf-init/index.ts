import { createFmcProgram, type FmcProgramApi } from "../../sdk";
import type { FmcState, PerfInitField } from "../../types";

interface PerfFieldRule {
	validate(value: string): string | null;
	invalidMessage: string;
}

const perfFieldRules: Record<PerfInitField, PerfFieldRule> = {
	grossWeight: {
		validate: (value) => validateWeight(value, 1, 999.9),
		invalidMessage: "INVALID GR WT",
	},
	cruiseAltitude: {
		validate: validateFlightLevel,
		invalidMessage: "INVALID CRZ ALT",
	},
	costIndex: {
		validate: validateCostIndex,
		invalidMessage: "INVALID COST INDEX",
	},
	zeroFuelWeight: {
		validate: (value) => validateWeight(value, 1, 999.9),
		invalidMessage: "INVALID ZFW",
	},
	reserves: {
		validate: (value) => validateWeight(value, 0.1, 99.9),
		invalidMessage: "INVALID RESERVES",
	},
};

function displayValue(value: string, placeholder: string): string {
	return value.trim() || placeholder;
}

function isEmptyValue(value: string): boolean {
	return value.trim().length === 0;
}

function isActiveField(api: FmcProgramApi, field: PerfInitField): boolean {
	return api.store.perfInit.activeField === field;
}

function validateWeight(
	value: string,
	minimum: number,
	maximum: number,
): string | null {
	const normalized = value.toUpperCase().replace(/\s+/g, "");
	const match = normalized.match(/^(\d{1,3})(?:\.(\d))?(?:KG)?$/);

	if (!match) {
		return null;
	}

	const weight = Number(`${match[1]}.${match[2] ?? "0"}`);

	if (weight < minimum || weight > maximum) {
		return null;
	}

	return weight.toFixed(1);
}

function validateFlightLevel(value: string): string | null {
	const normalized = value.toUpperCase().replace(/\s+/g, "");
	const match = normalized.match(/^FL(\d{3})$/);

	if (!match) {
		return null;
	}

	const flightLevel = Number(match[1]);

	if (flightLevel < 10 || flightLevel > 600) {
		return null;
	}

	return `FL${match[1]}`;
}

function validateCostIndex(value: string): string | null {
	const normalized = value.trim();

	if (!/^\d{1,3}$/.test(normalized)) {
		return null;
	}

	const costIndex = Number(normalized);

	if (costIndex < 0 || costIndex > 999) {
		return null;
	}

	return String(costIndex);
}

function formatConnectionStatus(state: Readonly<FmcState>): string {
	switch (state.setup.connectApiStatus) {
		case "CONNECTED":
			return "CONNECTED";

		case "CONNECTING":
			return "CONNECTING";

		case "ERROR":
			return "FAILED";

		case "DISCONNECTED":
		default:
			return "DISCONNECTED";
	}
}

function formatNavData(state: Readonly<FmcState>): string {
	const database = state.setup.navigationDatabase;

	if (!database) {
		return "NOT LOADED";
	}

	if (database.status === "INTACT" && database.cycle) {
		return `AIRAC${database.cycle}`;
	}

	return database.status.replaceAll("_", " ");
}

function setPage(api: FmcProgramApi, pageIndex: number): void {
	api.updateStore({ pageIndex });
}

function openAircraftSelect(api: FmcProgramApi): void {
	api.updateStore((current) => ({
		...current,
		aircraftSelect: {
			...current.aircraftSelect,
			returnProgram: "PERF_INIT",
		},
	}));

	api.setProgram("AIRCRAFT_SELECT");
}

function openPerfInit(api: FmcProgramApi): void {
	if (!api.store.setup.selectedAircraft) {
		api.showMessage("SELECT AIRCRAFT");
		return;
	}

	setPage(api, 1);
}

function setPerfField(
	api: FmcProgramApi,
	field: PerfInitField,
	label: string,
): void {
	const value = api.scratchpad.trim();

	if (api.store.perfInit.activeField !== field) {
		api.updateStore((current) => ({
			...current,
			perfInit: {
				...current.perfInit,
				activeField: field,
			},
		}));
		return;
	}

	if (!value) {
		return;
	}

	const validatedValue = perfFieldRules[field].validate(value);

	if (!validatedValue) {
		api.showMessage(perfFieldRules[field].invalidMessage);
		return;
	}

	api.updateStore((current) => ({
		...current,
		perfInit: {
			...current.perfInit,
			[field]: validatedValue,
			activeField: null,
		},
	}));
	api.setScratchpad("");
	api.showMessage(`${label} SET`);
}

function showNotAvailable(api: FmcProgramApi): void {
	api.showMessage("NOT AVAILABLE");
}

function getSelectedRouteSummary(state: Readonly<FmcState>): string {
	const route = state.route.plans[state.route.selectedRoute];

	if (!route.origin && !route.destination) {
		return "----/----";
	}

	return `${route.origin || "----"}/${route.destination || "----"}`;
}

export const perfInitProgram = createFmcProgram({
	id: "PERF_INIT",

	pages: [
		{
			title: "IDENT INIT",
			page: "1/2",
			onKey(key, api) {
				if (key !== "NEXT_PAGE") {
					return false;
				}

				openPerfInit(api);
				return true;
			},
			slots(api) {
				const aircraft = api.store.setup.selectedAircraft;

				return [
					{
						labelLeft: "AIRCRAFT TYPE",
						valueLeft: aircraft ? `<${aircraft.name}` : "<SELECT",
						onLeft: () => openAircraftSelect(api),
					},
					{
						labelLeft: "IF CONNECT",
						valueLeft: formatConnectionStatus(api.store),
						labelRight: "NAV DATA",
						valueRight: formatNavData(api.store),
					},
					{
						labelLeft: "ROUTE",
						valueLeft: getSelectedRouteSummary(api.store),
						labelRight: "FLT NO",
						valueRight:
							api.store.route.plans[api.store.route.selectedRoute].flightNumber,
					},
					{},
					{},
					{
						valueLeft: "<MENU",
						valueRight: "PERF INIT>",
						onLeft: () => api.setProgram("MENU"),
						onRight: () => openPerfInit(api),
					},
				];
			},
		},
		{
			title: "PERF INIT",
			page: "2/2",
			slots(api) {
				return [
					{
						labelLeft: "GR WT",
						valueLeft: displayValue(api.store.perfInit.grossWeight, "---.-"),
						boxedLeft:
							isEmptyValue(api.store.perfInit.grossWeight) &&
							isActiveField(api, "grossWeight"),
						labelRight: "CRZ ALT",
						valueRight: displayValue(api.store.perfInit.cruiseAltitude, "-----"),
						boxedRight:
							isEmptyValue(api.store.perfInit.cruiseAltitude) &&
							isActiveField(api, "cruiseAltitude"),
						onLeft: () => setPerfField(api, "grossWeight", "GR WT"),
						onRight: () => setPerfField(api, "cruiseAltitude", "CRZ ALT"),
					},
					{
						labelLeft: "FUEL",
						valueLeft: "97.5KG CALC",
						labelRight: "COST INDEX",
						valueRight: displayValue(api.store.perfInit.costIndex, "---"),
						boxedRight:
							isEmptyValue(api.store.perfInit.costIndex) &&
							isActiveField(api, "costIndex"),
						onRight: () => setPerfField(api, "costIndex", "COST INDEX"),
					},
					{
						labelLeft: "ZFW",
						valueLeft: displayValue(api.store.perfInit.zeroFuelWeight, "---.-"),
						boxedLeft:
							isEmptyValue(api.store.perfInit.zeroFuelWeight) &&
							isActiveField(api, "zeroFuelWeight"),
						labelCenter: "MIN FUEL TEMP",
						valueCenter: "-37C",
						onLeft: () => setPerfField(api, "zeroFuelWeight", "ZFW"),
					},
					{
						labelLeft: "RESERVES",
						valueLeft: displayValue(api.store.perfInit.reserves, "---.-"),
						boxedLeft:
							isEmptyValue(api.store.perfInit.reserves) &&
							isActiveField(api, "reserves"),
						labelRight: "CRZ CG",
						valueRight: "30.0%",
						onLeft: () => setPerfField(api, "reserves", "RESERVES"),
					},
					{
						labelLeft: "PERF INIT",
						valueLeft: "<REQUEST",
						labelRight: "STEP SIZE",
						valueRight: "RVSM",
						onLeft: () => showNotAvailable(api),
					},
				{
						valueLeft: "<IDENT",
						valueCenter: "-----------",
						valueRight: "THRUST LIM>",
						onLeft: () => api.setProgram("IDENT"),
						onRight: () => showNotAvailable(api),
					},
				];
			},
		},
	],
});
