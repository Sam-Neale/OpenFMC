import type {
	FmcKey,
	FmcProgramId,
	FmcScreenModel,
	FmcScreenSlot,
	FmcState,
} from "./types";
import type {
	FmcProgram,
	FmcProgramContext,
	FmcServices,
} from "./engine/context";

type MaybePromise<T> = T | Promise<T>;
type ProgramScreen = Omit<FmcScreenModel, "scratchpad" | "execLight">;
type FmcSlotSide = "left" | "right";
type FmcSlotRow = 1 | 2 | 3 | 4 | 5 | 6;
type FmcLskKey = `LSK_${"L" | "R"}${FmcSlotRow}`;

export interface FmcProgramApi {
	store: Readonly<FmcState>;
	state: Readonly<FmcState>;
	pageIndex: number;
	scratchpad: string;
	services: FmcServices;
	updateStore(
		update: Partial<FmcState> | ((state: Readonly<FmcState>) => FmcState),
	): void;
	setProgram(program: FmcProgramId): void;
	setScratchpad(value: string): void;
	clearScratchpad(): void;
	showMessage(message: string): void;
	setExecPending(pending: boolean): void;
}

export interface FmcScratchpadKeyInput {
	key: FmcKey;
	value: string;
	current: string;
}

export interface FmcSlotInput {
	key: FmcLskKey;
	row: FmcSlotRow;
	side: FmcSlotSide;
	scratchpad: string;
	clearScratchpad(): void;
}

export type FmcSlotHandler = (
	input: FmcSlotInput,
	api: FmcProgramApi,
) => MaybePromise<boolean | void>;

export interface FmcSdkSlot extends FmcScreenSlot {
	onLeft?: FmcSlotHandler;
	onRight?: FmcSlotHandler;
}

export interface FmcSdkPage {
	title: string;
	slots: FmcSdkSlot[] | ((api: FmcProgramApi) => FmcSdkSlot[]);
	page?: string | ((api: FmcProgramApi) => string | undefined);
	onKey?(key: FmcKey, api: FmcProgramApi): MaybePromise<boolean | void>;
	onScratchpadKey?(
		input: FmcScratchpadKeyInput,
		api: FmcProgramApi,
	): MaybePromise<boolean | void>;
	onEnter?(api: FmcProgramApi): MaybePromise<void>;
	onExit?(api: FmcProgramApi): MaybePromise<void>;
	onExec?(api: FmcProgramApi): MaybePromise<boolean | void>;
}

export interface FmcSdkProgramDefinition {
	id: FmcProgramId;
	pages: FmcSdkPage[] | ((api: FmcProgramApi) => FmcSdkPage[]);
	onKey?(key: FmcKey, api: FmcProgramApi): MaybePromise<boolean | void>;
	onEnter?(api: FmcProgramApi): MaybePromise<void>;
	onExit?(api: FmcProgramApi): MaybePromise<void>;
	onExec?(api: FmcProgramApi): MaybePromise<boolean | void>;
}

const emptySlots = Array.from({ length: 6 }, () => ({}));

function createApi(context: FmcProgramContext): FmcProgramApi {
	const state = context.getState();

	return {
		store: state,
		state,
		pageIndex: state.pageIndex,
		scratchpad: state.scratchpad,
		services: context.services,
		updateStore: context.updateState,
		setProgram: context.setProgram,
		setScratchpad: context.setScratchpad,
		clearScratchpad: context.clearScratchpad,
		showMessage: context.showMessage,
		setExecPending: context.setExecPending,
	};
}

function createRenderApi(state: Readonly<FmcState>): FmcProgramApi {
	return {
		store: state,
		state,
		pageIndex: state.pageIndex,
		scratchpad: state.scratchpad,
		services: undefined as never,
		updateStore: () => {
			throw new Error("Cannot update the FMC store while rendering");
		},
		setProgram: () => {
			throw new Error("Cannot change programs while rendering");
		},
		setScratchpad: () => {
			throw new Error("Cannot update the scratchpad while rendering");
		},
		clearScratchpad: () => {
			throw new Error("Cannot clear the scratchpad while rendering");
		},
		showMessage: () => {
			throw new Error("Cannot show a message while rendering");
		},
		setExecPending: () => {
			throw new Error("Cannot set EXEC state while rendering");
		},
	};
}

function resolvePages(
	definition: FmcSdkProgramDefinition,
	api: FmcProgramApi,
): FmcSdkPage[] {
	const pages =
		typeof definition.pages === "function"
			? definition.pages(api)
			: definition.pages;

	return pages.length > 0 ? pages : [{ title: definition.id, slots: emptySlots }];
}

function getActivePage(
	definition: FmcSdkProgramDefinition,
	api: FmcProgramApi,
): FmcSdkPage {
	const pages = resolvePages(definition, api);
	const pageIndex = Math.max(0, Math.min(api.pageIndex, pages.length - 1));

	return pages[pageIndex];
}

function normalizeSlots(slots: FmcSdkSlot[]): FmcSdkSlot[] {
	return [...slots, ...emptySlots].slice(0, 6);
}

function toScreenSlot(slot: FmcSdkSlot): FmcScreenSlot {
	return {
		labelLeft: slot.labelLeft,
		labelCenter: slot.labelCenter,
		labelRight: slot.labelRight,
		valueLeft: slot.valueLeft,
		valueCenter: slot.valueCenter,
		valueRight: slot.valueRight,
		disabled: slot.disabled,
		disabledLeft: slot.disabledLeft,
		disabledCenter: slot.disabledCenter,
		disabledRight: slot.disabledRight,
		boxedLeft: slot.boxedLeft,
		boxedCenter: slot.boxedCenter,
		boxedRight: slot.boxedRight,
		colorLeft: slot.colorLeft,
		colorCenter: slot.colorCenter,
		colorRight: slot.colorRight,
		sizeLeft: slot.sizeLeft,
		sizeCenter: slot.sizeCenter,
		sizeRight: slot.sizeRight,
	};
}

function parseLskKey(key: FmcKey): { row: FmcSlotRow; side: FmcSlotSide } | null {
	const match = key.match(/^LSK_([LR])([1-6])$/);

	if (!match) {
		return null;
	}

	return {
		side: match[1] === "L" ? "left" : "right",
		row: Number(match[2]) as FmcSlotRow,
	};
}

function getScratchpadKeyValue(key: FmcKey): string | null {
	if (/^[A-Z0-9]$/.test(key)) {
		return key;
	}

	switch (key) {
		case "SP":
			return " ";
		case "DOT":
			return ".";
		case "SLASH":
			return "/";
		default:
			return null;
	}
}

async function handleSlotKey(
	key: FmcKey,
	page: FmcSdkPage,
	api: FmcProgramApi,
): Promise<boolean> {
	const lsk = parseLskKey(key);

	if (!lsk) {
		return false;
	}

	const slots =
		typeof page.slots === "function" ? page.slots(api) : page.slots;
	const slot = normalizeSlots(slots)[lsk.row - 1];
	const handler = lsk.side === "left" ? slot.onLeft : slot.onRight;

	if (!handler) {
		return false;
	}

	const handled = await handler(
		{
			key: key as FmcLskKey,
			row: lsk.row,
			side: lsk.side,
			scratchpad: api.scratchpad,
			clearScratchpad: api.clearScratchpad,
		},
		api,
	);

	return handled !== false;
}

export function createFmcProgram(
	definition: FmcSdkProgramDefinition,
): FmcProgram {
	return {
		id: definition.id,

		getPageCount(state) {
			const api = createRenderApi(state);

			return resolvePages(definition, api).length;
		},

		render(state): ProgramScreen {
			const api = createRenderApi(state);
			const pages = resolvePages(definition, api);
			const pageIndex = Math.max(0, Math.min(api.pageIndex, pages.length - 1));
			const page = pages[pageIndex];
			const slots =
				typeof page.slots === "function" ? page.slots(api) : page.slots;
			const pageLabel =
				typeof page.page === "function" ? page.page(api) : page.page;

			return {
				title: page.title,
				page: pageLabel ?? `${pageIndex + 1}/${pages.length}`,
				slots: normalizeSlots(slots).map(toScreenSlot),
			};
		},

		async handleKey(key, context) {
			const api = createApi(context);
			const page = getActivePage(definition, api);
			const scratchpadValue = getScratchpadKeyValue(key);

			if (scratchpadValue && page.onScratchpadKey) {
				const handled = await page.onScratchpadKey(
					{
						key,
						value: scratchpadValue,
						current: api.scratchpad,
					},
					api,
				);

				if (handled !== false) {
					return true;
				}
			}

			if (await handleSlotKey(key, page, api)) {
				return true;
			}

			const pageHandled = await page.onKey?.(key, api);

			if (pageHandled !== undefined) {
				return pageHandled !== false;
			}

			const programHandled = await definition.onKey?.(key, api);

			return programHandled !== undefined && programHandled !== false;
		},

		onEnter(context) {
			const api = createApi(context);
			const page = getActivePage(definition, api);

			return definition.onEnter?.(api) ?? page.onEnter?.(api);
		},

		onExit(context) {
			const api = createApi(context);
			const page = getActivePage(definition, api);

			return page.onExit?.(api) ?? definition.onExit?.(api);
		},

		async onExec(context) {
			const api = createApi(context);
			const page = getActivePage(definition, api);
			const pageHandled = await page.onExec?.(api);

			if (pageHandled !== undefined) {
				return pageHandled !== false;
			}

			const programHandled = await definition.onExec?.(api);

			return programHandled !== undefined && programHandled !== false;
		},
	};
}
