import type {
	FmcProgramId,
	FmcScreenModel,
	FmcKey,
	FmcState,
	NavigationDatabaseInfo,
	AircraftDefinition,
} from "../types";

export interface FmcServices {
	connectApi: {
		connect(): Promise<void>;
		disconnect(): Promise<void>;
	};
	navigationDatabase: {
		getLoadedDatabase(): Promise<NavigationDatabaseInfo>;
	};
	aircraft: {
		list(): Promise<AircraftDefinition[]>;
		refresh(): Promise<AircraftDefinition[]>;
	};
}

export interface FmcProgramContext {
	getState(): Readonly<FmcState>;
	updateState(
		update: Partial<FmcState> | ((state: Readonly<FmcState>) => FmcState),
	): void;
	setProgram(program: FmcProgramId): void;
	setScratchpad(value: string): void;
	clearScratchpad(): void;
	showMessage(message: string): void;
	setExecPending(pending: boolean): void;
	services: FmcServices;
}

export interface FmcProgram {
	id: FmcProgramId;

	getPageCount?(state: Readonly<FmcState>): number;

	render(
		state: Readonly<FmcState>,
	): Omit<FmcScreenModel, "scratchpad" | "execLight">;

	handleKey?(
		key: FmcKey,
		context: FmcProgramContext,
	): boolean | Promise<boolean>;

	onEnter?(context: FmcProgramContext): void | Promise<void>;

	onExit?(context: FmcProgramContext): void | Promise<void>;

	onExec?(context: FmcProgramContext): boolean | Promise<boolean>;
}
