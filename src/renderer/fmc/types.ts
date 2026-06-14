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

	setup: SetupProgramState;
	aircraftSelect: AircraftSelectState;

	route: {
		origin: string;
		destination: string;
		flightNumber: string;
	};
}

export type FmcProgramId = "SETUP" | "AIRCRAFT_SELECT";

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

export type ConnectApiStatus =
	| "DISCONNECTED"
	| "CONNECTING"
	| "CONNECTED"
	| "ERROR";

export type NavigationDatabaseStatus =
	| "INTACT"
	| "MISSING"
	| "INVALID_CYCLE"
	| "MISSING_DATABASE"
	| "CORRUPT"
	| "ERROR";

export interface NavigationDatabaseInfo {
	cycle: string | null;
	revision: string | null;
	name: string | null;
	status: NavigationDatabaseStatus;
	error?: string;
}

export interface AircraftDefinition {
	id: string;
	name: string;
}

export interface AircraftSelectState {
	aircraft: AircraftDefinition[];
	status: "IDLE" | "LOADING" | "READY" | "ERROR";
	error: string | null;
}

export interface SetupProgramState {
	connectApiStatus: ConnectApiStatus;
	connectApiError: string | null;

	navigationDatabase: NavigationDatabaseInfo | null;

	selectedAircraft: AircraftDefinition | null;
}
