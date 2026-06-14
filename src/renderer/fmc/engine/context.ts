import type { FmcKey, FmcProgramId, FmcScreenModel, FmcState } from "../types";

export interface FmcProgramContext {
	getState(): Readonly<FmcState>;

	updateState(update: Partial<FmcState>): void;

	updateState(updater: (state: Readonly<FmcState>) => FmcState): void;

	setProgram(program: FmcProgramId): void;

	setScratchpad(value: string): void;

	clearScratchpad(): void;

	showMessage(message: string): void;

	setExecPending(pending: boolean): void;
}

export interface FmcProgram {
	id: FmcProgramId;

	render(
		state: Readonly<FmcState>,
	): Omit<FmcScreenModel, "scratchpad" | "execLight">;

	handleKey?(key: FmcKey, context: FmcProgramContext): boolean;

	onEnter?(context: FmcProgramContext): void;

	onExit?(context: FmcProgramContext): void;

	onExec?(context: FmcProgramContext): boolean;
}
