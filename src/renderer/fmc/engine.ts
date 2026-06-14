import type { FmcKey, FmcPageId, FmcScreenModel, FmcState } from "./types";

export type FmcListener = (state: Readonly<FmcState>) => void;

const initialState: FmcState = {
	activePage: "PERF_INIT",
	pageIndex: 0,
	scratchpad: "",
	message: null,
	execPending: false,
	route: {
		origin: "YMML",
		destination: "YSSY",
		flightNumber: "QF402",
	},
};

let state: FmcState = structuredClone(initialState);
const listeners = new Set<FmcListener>();

function notify(): void {
	for (const listener of listeners) listener(state);
}

function setState(update: Partial<FmcState>): void {
	state = { ...state, ...update };
	notify();
}

function showMessage(message: string): void {
	setState({ message });
}

function appendScratchpad(value: string): void {
	if (state.scratchpad.length >= 24) return;

	setState({
		scratchpad: state.scratchpad + value,
		message: null,
	});
}

function clearScratchpad(): void {
	if (state.message) {
		setState({ message: null });
		return;
	}

	setState({
		scratchpad: "",
	});
}

function setPage(page: FmcPageId): void {
	setState({
		activePage: page,
		pageIndex: 0,
		message: null,
	});
}

function processLineSelectKey(key: FmcKey): void {
	if (key === "LSK_L1" && state.activePage === "RTE") {
		if (!state.scratchpad) {
			appendScratchpad(state.route.origin);
			return;
		}

		state = {
			...state,
			route: { ...state.route, origin: state.scratchpad.toUpperCase() },
			scratchpad: "",
			execPending: true,
			message: null,
		};
		notify();
		return;
	}

	if (key === "LSK_R1" && state.activePage === "RTE") {
		if (!state.scratchpad) {
			appendScratchpad(state.route.destination);
			return;
		}

		state = {
			...state,
			route: { ...state.route, destination: state.scratchpad.toUpperCase() },
			scratchpad: "",
			execPending: true,
			message: null,
		};
		notify();
		return;
	}

	if (key === "LSK_L6") {
		setPage("MENU");
		return;
	}

	showMessage("KEY NOT ACTIVE");
}

export function getFmcState(): Readonly<FmcState> {
	return state;
}

export function subscribeFmc(listener: FmcListener): () => void {
	listeners.add(listener);
	listener(state);

	return () => listeners.delete(listener);
}

export function pressFmcKey(key: FmcKey): void {
	if (/^[A-Z0-9]$/.test(key)) {
		appendScratchpad(key);
		return;
	}

	if (key.startsWith("LSK_")) {
		processLineSelectKey(key);
		return;
	}

	switch (key) {
		case "INIT_REF":
			setPage("PERF_INIT");
			return;
		case "RTE":
			setPage("RTE");
			return;
		case "LEGS":
			setPage("LEGS");
			return;
		case "DEP_ARR":
			setPage("DEP_ARR");
			return;
		case "PROG":
			setPage("PROG");
			return;
		case "MENU":
			setPage("MENU");
			return;
		case "SP":
			appendScratchpad(" ");
			return;
		case "DOT":
			appendScratchpad(".");
			return;
		case "SLASH":
			appendScratchpad("/");
			return;
		case "PLUS_MINUS":
			try {
				const scratchPadValue = parseFloat(state.scratchpad);
				if (isNaN(scratchPadValue)) {
					showMessage("INVALID NUMBER");
					return;
				}
				const newValue = -scratchPadValue;
				setState({ scratchpad: newValue.toString(), message: null });
				return;
			} catch (e) {
				showMessage("INVALID NUMBER");
				return;
			}
		case "CLR":
			clearScratchpad();
			return;
		case "DEL":
			setState({ scratchpad: state.scratchpad.slice(0, -1), message: null });
			return;
		case "PREV_PAGE":
			setState({ pageIndex: Math.max(0, state.pageIndex - 1) });
			return;
		case "NEXT_PAGE":
			setState({ pageIndex: state.pageIndex + 1 });
			return;
		case "EXEC":
			if (!state.execPending) {
				showMessage("NOTHING TO EXECUTE");
				return;
			}
			setState({
				execPending: false,
				message: "MOD EXECUTED",
			});
			return;
		default:
			showMessage(`${key.replaceAll("_", " ")} NOT IMPLEMENTED`);
	}
}

export function renderFmcScreen(current: Readonly<FmcState>): FmcScreenModel {
	const scratchpad = current.message ?? current.scratchpad;

	switch (current.activePage) {
		case "RTE":
			return {
				title: "RTE 1",
				page: "1/2",
				execLight: current.execPending,
				scratchpad,
				rows: [
					{ left: "ORIGIN", right: "DEST", size: "small" },
					{ left: current.route.origin, right: current.route.destination },
					{ left: "RUNWAY", right: "FLT NO", size: "small" },
					{ left: "----", right: current.route.flightNumber },
					{ left: "CO ROUTE", right: "REQUEST", size: "small" },
					{ left: "----------", right: "SEND>" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "<RTE 2", right: "ACTIVATE>" },
					{ left: "<INDEX", right: "PERF INIT>" },
				],
			};

		case "LEGS":
			return {
				title: "ACT RTE 1 LEGS",
				page: "1/1",
				execLight: current.execPending,
				scratchpad,
				rows: [
					{ left: "SEQ", right: "DIST", size: "small" },
					{ left: "01  DCT", right: "----" },
					{ left: "YMML", right: "0" },
					{ left: "02  DCT", right: "----" },
					{ left: "YSSY", right: "384" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "<RTE DATA", right: "STEP>" },
					{ left: "<INDEX", right: "RTE>" },
				],
			};

		case "DEP_ARR":
			return {
				title: "DEP/ARR INDEX",
				page: "1/1",
				execLight: current.execPending,
				scratchpad,
				rows: [
					{ left: "RTE 1", right: "RTE 1", size: "small" },
					{
						left: `<DEP ${current.route.origin}`,
						right: `${current.route.destination} ARR>`,
					},
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "<INDEX", right: "" },
				],
			};

		case "PROG":
			return {
				title: "PROGRESS",
				page: "1/2",
				execLight: current.execPending,
				scratchpad,
				rows: [
					{ left: "FROM", center: "ALT", right: "ATA", size: "small" },
					{ left: current.route.origin, center: "120", right: "----" },
					{ left: "TO", center: "DTG", right: "ETA", size: "small" },
					{ left: current.route.destination, center: "384", right: "0125" },
					{ left: "FUEL QTY", right: "23.6", size: "small" },
					{ left: "WIND", right: "250/18" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "<INDEX", right: "POS REPORT>" },
				],
			};

		case "MENU":
			return {
				title: "FMC MENU",
				page: "1/1",
				execLight: current.execPending,
				scratchpad,
				rows: [
					{ left: "<FMC", right: "" },
					{ left: "", right: "" },
					{ left: "<NAV DATA", right: "" },
					{ left: "", right: "" },
					{ left: "<SETTINGS", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
					{ left: "", right: "" },
				],
			};

		case "PERF_INIT":
		default:
			return {
				title: "PERF INIT",
				page: "1/1",
				execLight: current.execPending,
				scratchpad,
				slots: [
					{
						labelLeft: "GR WT",
						labelRight: "CRZ ALT",
						valueLeft: "244.1",
						valueRight: "FL310",
					},
					{
						labelLeft: "FUEL",
						labelRight: "COST INDEX",
						valueLeft: "23.6KG CALC",
						valueRight: "80",
					},
					{
						labelLeft: "ZFW",
						labelRight: "MIN FUEL TEMP",
						valueLeft: "220.5",
						valueRight: "-37°C",
					},
					{
						labelLeft: "RESERVES",
						labelRight: "CRZ CG",
						valueLeft: "10.0",
						valueRight: "7.5%",
					},
					{
						labelLeft: "PERF INIT",
						labelRight: "STEP SIZE",
						valueLeft: "<REQUEST",
						valueRight: "RVSM",
					},
					{
						valueLeft: "<INDEX",
						valueRight: "THRUST LIM>",
					},
				],
			};
	}
}
