// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("openFmc", {
	navData: {
		inspect: () => ipcRenderer.invoke("navdata:inspect"),
		airportExists: (airport: string) =>
			ipcRenderer.invoke("navdata:airport-exists", airport),
		waypointExists: (waypoint: string) =>
			ipcRenderer.invoke("navdata:waypoint-exists", waypoint),
		resolveWaypoint: (waypoint: string) =>
			ipcRenderer.invoke("navdata:resolve-waypoint", waypoint),
		resolveWaypointForRoute: (waypoint: string, previousReference: unknown) =>
			ipcRenderer.invoke(
				"navdata:resolve-waypoint-for-route",
				waypoint,
				previousReference,
			),
		listRunways: (airport: string) =>
			ipcRenderer.invoke("navdata:list-runways", airport),
		runwayExists: (airport: string, runway: string) =>
			ipcRenderer.invoke("navdata:runway-exists", airport, runway),
		getProcedurePreview: (
			origin: string,
			destination: string,
			runway: string,
		) =>
			ipcRenderer.invoke(
				"navdata:procedure-preview",
				origin,
				destination,
				runway,
			),
		listDepartureSids: (airport: string, runway: string) =>
			ipcRenderer.invoke("navdata:list-departure-sids", airport, runway),
		listArrivalStars: (airport: string) =>
			ipcRenderer.invoke("navdata:list-arrival-stars", airport),
		listApproaches: (airport: string) =>
			ipcRenderer.invoke("navdata:list-approaches", airport),
		getSidProcedure: (
			airport: string,
			identifier: string,
			transition: string,
		) =>
			ipcRenderer.invoke(
				"navdata:get-sid-procedure",
				airport,
				identifier,
				transition,
			),
		getStarProcedure: (
			airport: string,
			identifier: string,
			commonTransition: string,
			runwayTransition: string,
		) =>
			ipcRenderer.invoke(
				"navdata:get-star-procedure",
				airport,
				identifier,
				commonTransition,
				runwayTransition,
			),
		getApproachProcedure: (
			airport: string,
			identifier: string,
			transition: string,
		) =>
			ipcRenderer.invoke(
				"navdata:get-approach-procedure",
				airport,
				identifier,
				transition,
			),
		expandAirway: (airway: string, from: string, to: string) =>
			ipcRenderer.invoke("navdata:expand-airway", airway, from, to),
		resolveFlightPlanForIf: (waypoints: string[]) =>
			ipcRenderer.invoke("navdata:resolve-flightplan-for-if", waypoints),
	},
	aircraft: {
		list: () => ipcRenderer.invoke("aircraft:list"),
		refresh: () => ipcRenderer.invoke("aircraft:refresh"),
	},
	connectApi: {
		connect: () => ipcRenderer.invoke("connect-api:connect"),
		disconnect: () => ipcRenderer.invoke("connect-api:disconnect"),
		get: (pathName: string) => ipcRenderer.invoke("connect-api:get", pathName),
		set: (pathName: string, value: unknown) =>
			ipcRenderer.invoke("connect-api:set", pathName, value),
		command: (commandName: string) =>
			ipcRenderer.invoke("connect-api:command", commandName),
	},
	routeStorage: {
		save: (name: string, route: unknown) =>
			ipcRenderer.invoke("route-storage:save", name, route),
		load: (name: string) => ipcRenderer.invoke("route-storage:load", name),
	},
	system: {
		openExternal: (url: string) =>
			ipcRenderer.invoke("system:open-external", url),
	},
	autopilot: {
		getStatus: () => ipcRenderer.invoke("autopilot:get-status"),
		setLoggingEnabled: (enabled: boolean) =>
			ipcRenderer.invoke("autopilot:set-logging-enabled", enabled),
		setSettings: (settings: unknown) =>
			ipcRenderer.invoke("autopilot:set-settings", settings),
	},
});
