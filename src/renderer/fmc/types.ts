export type FmcPageId =
	| "PERF_INIT"
	| "RTE"
	| "LEGS"
	| "DEP_ARR"
	| "PROG"
	| "MENU";

export type FmcTextColor = "white" | "green" | "cyan" | "amber" | "magenta";
export type FmcTextSize = "small" | "large";

export interface FmcLine {
	left?: string;
	center?: string;
	right?: string;
	color?: FmcTextColor;
	size?: FmcTextSize;
}

export interface FmcScreenSlot {
	labelLeft?: string;
	labelCenter?: string;
	labelRight?: string;

	valueLeft?: string;
	valueCenter?: string;
	valueRight?: string;
}

export interface FmcScreenModel {
	title: string;
	page?: string;
	slots: FmcScreenSlot[];
	scratchpad: string;
	execLight: boolean;
}

export interface FmcState {
	activeProgram: FmcProgramId;
	pageIndex: number;
	scratchpad: string;
	message: string | null;
	execPending: boolean;

	route: {
		origin: string;
		destination: string;
		flightNumber: string;
	};
}

export type FmcProgramId = "PERF_INIT";

export type FmcKey =
	| "INIT_REF"
	| "RTE"
	| "DEP_ARR"
	| "ATC"
	| "VNAV"
	| "FIX"
	| "LEGS"
	| "HOLD"
	| "FMC_COMM"
	| "PROG"
	| "MENU"
	| "NAV_RAD"
	| "PREV_PAGE"
	| "NEXT_PAGE"
	| "EXEC"
	| "DEL"
	| "CLR"
	| "SP"
	| "SLASH"
	| "DOT"
	| "PLUS_MINUS"
	| `LSK_L${1 | 2 | 3 | 4 | 5 | 6}`
	| `LSK_R${1 | 2 | 3 | 4 | 5 | 6}`
	| `${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
	| "A"
	| "B"
	| "C"
	| "D"
	| "E"
	| "F"
	| "G"
	| "H"
	| "I"
	| "J"
	| "K"
	| "L"
	| "M"
	| "N"
	| "O"
	| "P"
	| "Q"
	| "R"
	| "S"
	| "T"
	| "U"
	| "V"
	| "W"
	| "X"
	| "Y"
	| "Z";

export interface FmcScreenSlot {
	labelLeft?: string;
	labelCenter?: string;
	labelRight?: string;

	valueLeft?: string;
	valueCenter?: string;
	valueRight?: string;
}

export interface FmcScreenModel {
	title: string;
	page?: string;
	slots: FmcScreenSlot[];
	scratchpad: string;
	execLight: boolean;
}

export interface RouteState {
	origin: string;
	destination: string;
	flightNumber: string;
}

export interface FmcState {
	activeProgram: FmcProgramId;
	pageIndex: number;

	scratchpad: string;
	message: string | null;
	execPending: boolean;

	route: RouteState;
}
