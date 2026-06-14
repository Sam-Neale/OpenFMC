import type { FmcKey, FmcProgramId, FmcScreenModel, FmcState } from "../types";

import type { FmcProgramContext } from "./context";

import { getProgram } from "./registry";

export type FmcListener = (state: Readonly<FmcState>) => void;

const initialState: FmcState = {
	activeProgram: "PERF_INIT",
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
	for (const listener of listeners) {
		listener(state);
	}
}

function replaceState(nextState: FmcState): void {
	state = nextState;
	notify();
}

function updateState(
	update: Partial<FmcState> | ((state: Readonly<FmcState>) => FmcState),
): void {
	if (typeof update === "function") {
		replaceState(update(state));
		return;
	}

	replaceState({
		...state,
		...update,
	});
}

function showMessage(message: string): void {
	updateState({ message });
}

function setScratchpad(value: string): void {
	updateState({
		scratchpad: value.slice(0, 24),
		message: null,
	});
}

function appendScratchpad(value: string): void {
	if (state.scratchpad.length >= 24) {
		return;
	}

	setScratchpad(state.scratchpad + value);
}

function clearScratchpad(): void {
	if (state.message) {
		updateState({ message: null });
		return;
	}

	setScratchpad("");
}

function deleteScratchpadCharacter(): void {
	setScratchpad(state.scratchpad.slice(0, -1));
}

function setExecPending(pending: boolean): void {
	updateState({ execPending: pending });
}

const context: FmcProgramContext = {
	getState() {
		return state;
	},

	updateState,

	setProgram,

	setScratchpad,

	clearScratchpad,

	showMessage,

	setExecPending,
};

function setProgram(programId: FmcProgramId): void {
	const currentProgram = getProgram(state.activeProgram);
	const nextProgram = getProgram(programId);

	currentProgram.onExit?.(context);

	updateState({
		activeProgram: programId,
		pageIndex: 0,
		message: null,
	});

	nextProgram.onEnter?.(context);
}

function processPlusMinus(): void {
	const value = Number(state.scratchpad);

	if (state.scratchpad.trim() === "" || !Number.isFinite(value)) {
		showMessage("INVALID NUMBER");
		return;
	}

	setScratchpad(String(-value));
}

function processExec(): void {
	const program = getProgram(state.activeProgram);

	if (program.onExec?.(context)) {
		return;
	}

	if (!state.execPending) {
		showMessage("NOTHING TO EXECUTE");
		return;
	}

	updateState({
		execPending: false,
		message: "MOD EXECUTED",
	});
}

function processGlobalNavigation(key: FmcKey): boolean {
	const destinations: Partial<Record<FmcKey, FmcProgramId>> = {
		INIT_REF: "PERF_INIT",
		/*RTE: "RTE",
		LEGS: "LEGS",
		DEP_ARR: "DEP_ARR",
		PROG: "PROG",
		MENU: "MENU",*/
	};

	const destination = destinations[key];

	if (!destination) {
		return false;
	}

	setProgram(destination);
	return true;
}

function processSharedKey(key: FmcKey): boolean {
	if (/^[A-Z0-9]$/.test(key)) {
		appendScratchpad(key);
		return true;
	}

	switch (key) {
		case "SP":
			appendScratchpad(" ");
			return true;

		case "DOT":
			appendScratchpad(".");
			return true;

		case "SLASH":
			appendScratchpad("/");
			return true;

		case "PLUS_MINUS":
			processPlusMinus();
			return true;

		case "CLR":
			clearScratchpad();
			return true;

		case "DEL":
			deleteScratchpadCharacter();
			return true;

		case "PREV_PAGE":
			updateState({
				pageIndex: Math.max(0, state.pageIndex - 1),
			});
			return true;

		case "NEXT_PAGE":
			updateState({
				pageIndex: state.pageIndex + 1,
			});
			return true;

		case "EXEC":
			processExec();
			return true;

		default:
			return false;
	}
}

export function getFmcState(): Readonly<FmcState> {
	return state;
}

export function subscribeFmc(listener: FmcListener): () => void {
	listeners.add(listener);
	listener(state);

	return () => {
		listeners.delete(listener);
	};
}

export function pressFmcKey(key: FmcKey): void {
	if (processGlobalNavigation(key)) {
		return;
	}

	const activeProgram = getProgram(state.activeProgram);

	if (activeProgram.handleKey?.(key, context)) {
		return;
	}

	if (processSharedKey(key)) {
		return;
	}

	showMessage(`${key.replaceAll("_", " ")} NOT IMPLEMENTED`);
}

export function renderFmcScreen(current: Readonly<FmcState>): FmcScreenModel {
	const program = getProgram(current.activeProgram);

	const rendered = program.render(current);

	return {
		...rendered,
		scratchpad: current.message ?? current.scratchpad,
		execLight: current.execPending,
	};
}
