import started from "electron-squirrel-startup";
import { app, BrowserWindow, ipcMain, shell } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Vite define-plugin globals (injected at build time). Declare for TypeScript.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

import {
	airportExists,
	expandAirway,
	getNavigationDataDirectory,
	getApproachProcedure,
	getProcedurePreview,
	getSidProcedure,
	getStarProcedure,
	inspectNavigationDatabase,
	listApproaches,
	listArrivalStars,
	listDepartureSids,
	listRunways,
	resolveFlightPlanForIf,
	resolveWaypoint,
	runwayExists,
	waypointExists,
} from "./main/navigation-database";
import { getSimBriefAircraft } from "./main/simbrief-aircraft";
import {
	connectToInfiniteFlight,
	disconnectFromInfiniteFlight,
	getInfiniteFlightState,
	runInfiniteFlightCommand,
	setInfiniteFlightState,
} from "./main/connect-api";
import { loadRoute, saveRoute } from "./main/route-storage";
import {
	getAutopilotStatus,
	setAutopilotLogFilePath,
	setAutopilotLoggingEnabled,
	setAutopilotSettings,
	shutdownAutopilotWorker,
	type AutopilotSettings,
} from "./main/autopilot-controller";
import type { RoutePlanState, RoutePointReference } from "./renderer/fmc/types";
import type { StateValue } from "ifc-node";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
	app.quit();
}

function registerNavigationDatabaseIpc(): void {
	ipcMain.handle("navdata:inspect", async () => inspectNavigationDatabase());
	ipcMain.handle("navdata:airport-exists", (_event, airport: string) =>
		airportExists(airport),
	);
	ipcMain.handle("navdata:waypoint-exists", (_event, waypoint: string) =>
		waypointExists(waypoint),
	);
	ipcMain.handle("navdata:resolve-waypoint", (_event, waypoint: string) =>
		resolveWaypoint(waypoint),
	);
	ipcMain.handle(
		"navdata:resolve-waypoint-for-route",
		(_event, waypoint: string, previousReference: RoutePointReference) =>
			resolveWaypoint(waypoint, previousReference),
	);
	ipcMain.handle("navdata:list-runways", (_event, airport: string) =>
		listRunways(airport),
	);
	ipcMain.handle(
		"navdata:runway-exists",
		(_event, airport: string, runway: string) => runwayExists(airport, runway),
	);
	ipcMain.handle(
		"navdata:procedure-preview",
		(_event, origin: string, destination: string, runway: string) =>
			getProcedurePreview(origin, destination, runway),
	);
	ipcMain.handle(
		"navdata:list-departure-sids",
		(_event, airport: string, runway: string) =>
			listDepartureSids(airport, runway),
	);
	ipcMain.handle("navdata:list-arrival-stars", (_event, airport: string) =>
		listArrivalStars(airport),
	);
	ipcMain.handle("navdata:list-approaches", (_event, airport: string) =>
		listApproaches(airport),
	);
	ipcMain.handle(
		"navdata:get-sid-procedure",
		(_event, airport: string, identifier: string, transition: string) =>
			getSidProcedure(airport, identifier, transition),
	);
	ipcMain.handle(
		"navdata:get-star-procedure",
		(
			_event,
			airport: string,
			identifier: string,
			commonTransition: string,
			runwayTransition: string,
		) =>
			getStarProcedure(airport, identifier, commonTransition, runwayTransition),
	);
	ipcMain.handle(
		"navdata:get-approach-procedure",
		(_event, airport: string, identifier: string, transition: string) =>
			getApproachProcedure(airport, identifier, transition),
	);
	ipcMain.handle(
		"navdata:expand-airway",
		(_event, airway: string, from: string, to: string) =>
			expandAirway(airway, from, to),
	);
	ipcMain.handle(
		"navdata:resolve-flightplan-for-if",
		(_event, waypoints: string[]) => resolveFlightPlanForIf(waypoints),
	);
}

function registerAircraftIpc(): void {
	ipcMain.handle("aircraft:list", async () => {
		return getSimBriefAircraft(false);
	});

	ipcMain.handle("aircraft:refresh", async () => {
		return getSimBriefAircraft(true);
	});
}

function registerConnectApiIpc(): void {
	ipcMain.handle("connect-api:connect", async () => connectToInfiniteFlight());
	ipcMain.handle("connect-api:disconnect", async () =>
		disconnectFromInfiniteFlight(),
	);
	ipcMain.handle("connect-api:get", async (_event, pathName: string) =>
		getInfiniteFlightState(pathName),
	);
	ipcMain.handle(
		"connect-api:set",
		async (_event, pathName: string, value: unknown) =>
			setInfiniteFlightState(pathName, value as StateValue),
	);
	ipcMain.handle("connect-api:command", async (_event, commandName: string) =>
		runInfiniteFlightCommand(commandName),
	);
}

function registerRouteStorageIpc(): void {
	ipcMain.handle(
		"route-storage:save",
		(_event, name: string, route: RoutePlanState) => saveRoute(name, route),
	);
	ipcMain.handle("route-storage:load", (_event, name: string) =>
		loadRoute(name),
	);
}

function registerSystemIpc(): void {
	ipcMain.handle("system:open-external", async (_event, url: string) => {
		const parsedUrl = new URL(url);

		if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
			throw new Error("Unsupported external URL protocol");
		}

		await shell.openExternal(url);
	});
}

function registerAutopilotIpc(): void {
	ipcMain.handle("autopilot:get-status", () => getAutopilotStatus());
	ipcMain.handle("autopilot:set-logging-enabled", (_event, enabled: boolean) =>
		setAutopilotLoggingEnabled(enabled),
	);
	ipcMain.handle(
		"autopilot:set-settings",
		(_event, settings: Partial<AutopilotSettings>) =>
			setAutopilotSettings(settings),
	);
}

const createWindow = () => {
	// Create the browser window.
	const mainWindow = new BrowserWindow({
		width: 560,
		height: 1040,
		minWidth: 560,
		minHeight: 780,
		maxWidth: 560,
		backgroundColor: "#111111",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});

	mainWindow.center();

	// and load the index.html of the app.
	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(
			path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
		);
	}

	// Open the DevTools.
	//mainWindow.webContents.openDevTools();
};

const createAutopilotWindow = () => {
	const autopilotWindow = new BrowserWindow({
		width: 360,
		height: 430,
		minWidth: 320,
		minHeight: 390,
		backgroundColor: "#101111",
		title: "OpenFMC Autopilot",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});

	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		autopilotWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}#/autopilot`);
	} else {
		autopilotWindow.loadFile(
			path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
			{ hash: "/autopilot" },
		);
	}
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
export async function ensureNavDataDirectory(): Promise<string> {
	const navDataPath = path.join(app.getPath("home"), "openFMC-navdata");
	await mkdir(navDataPath, {
		recursive: true,
	});
	return navDataPath;
}

app.whenReady().then(async () => {
	await mkdir(getNavigationDataDirectory(), { recursive: true });
	const autopilotLogDirectory = path.join(app.getPath("userData"), "logs");
	await mkdir(autopilotLogDirectory, { recursive: true });
	setAutopilotLogFilePath(path.join(autopilotLogDirectory, "autopilot.log"));

	registerNavigationDatabaseIpc();
	registerAircraftIpc();
	registerConnectApiIpc();
	registerRouteStorageIpc();
	registerSystemIpc();
	registerAutopilotIpc();
	createWindow();
	createAutopilotWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
	shutdownAutopilotWorker();

	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("before-quit", () => {
	shutdownAutopilotWorker();
});

app.on("activate", () => {
	// On OS X it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
