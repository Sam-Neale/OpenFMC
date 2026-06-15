import { utilityProcess } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export interface AutopilotSettings {
	autopilotOn: boolean;
	targetHeading: number;
	targetSpeed: number;
	targetAltitude: number;
	verticalSpeed: number;
	maxBankDegrees: number;
	standardTurnRateDegreesPerMinute: number;
	bankSmoothnessDegreesPerSecond: number;
	headingKp: number;
	headingKi: number;
	headingKd: number;
	headingCaptureStartDegrees: number;
	headingCaptureMinScale: number;
	headingIntegralDecayStartDegrees: number;
	altitudeKp: number;
	altitudeKi: number;
	altitudeKd: number;
	altitudeCaptureBandMeters: number;
	altitudeCaptureStartMeters: number;
	altitudeCaptureMinScale: number;
	initialVerticalSpeedFpm: number;
	verticalSpeedRampFpmPerSecond: number;
	verticalSpeedReductionFpmPerSecond: number;
}

export interface AutopilotStatus extends AutopilotSettings {
	workerRunning: boolean;
	status: string;
	pid: number | null;
	logFilePath: string | null;
}

let settings: AutopilotSettings = {
	autopilotOn: false,
	targetHeading: 0,
	targetSpeed: 180,
	targetAltitude: 1000,
	verticalSpeed: 1000,
	maxBankDegrees: 15,
	standardTurnRateDegreesPerMinute: 180,
	bankSmoothnessDegreesPerSecond: 5,
	headingKp: 0.018,
	headingKi: 0.0008,
	headingKd: 0.004,
	headingCaptureStartDegrees: 30,
	headingCaptureMinScale: 0.35,
	headingIntegralDecayStartDegrees: 12,
	altitudeKp: 2.4,
	altitudeKi: 0.015,
	altitudeKd: 0.6,
	altitudeCaptureBandMeters: 23,
	altitudeCaptureStartMeters: 300,
	altitudeCaptureMinScale: 0.15,
	initialVerticalSpeedFpm: 500,
	verticalSpeedRampFpmPerSecond: 150,
	verticalSpeedReductionFpmPerSecond: 650,
};
let status = "STANDBY";
let worker: Electron.UtilityProcess | null = null;
let logFilePath: string | null = null;
let defaultLogFilePath: string | null = null;

function stringifyDetails(details: unknown): string {
	if (details === undefined) {
		return "";
	}

	try {
		return ` ${JSON.stringify(details)}`;
	} catch {
		return ` ${String(details)}`;
	}
}

function appendAutopilotLog(
	scope: string,
	message: string,
	details?: unknown,
): void {
	if (!logFilePath) {
		return;
	}

	try {
		mkdirSync(path.dirname(logFilePath), { recursive: true });
		appendFileSync(
			logFilePath,
			`${new Date().toISOString()} [${scope}] ${message}${stringifyDetails(details)}\n`,
			"utf8",
		);
	} catch (error) {
		console.error("[autopilot:controller] failed to write log file", error);
	}
}

function logController(message: string, details?: unknown): void {
	appendAutopilotLog("controller", message, details);

	if (details === undefined) {
		console.log(`[autopilot:controller] ${message}`);
		return;
	}

	console.log(`[autopilot:controller] ${message}`, details);
}

function getWorkerPath(): string {
	return path.join(__dirname, "autopilot-worker.js");
}

function finiteOrCurrent(
	value: number | undefined,
	current: number,
	min = -Infinity,
	max = Infinity,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return current;
	}

	return Math.max(min, Math.min(max, value));
}

function sanitizeSettings(
	nextSettings: Partial<AutopilotSettings>,
): AutopilotSettings {
	return {
		autopilotOn: nextSettings.autopilotOn ?? settings.autopilotOn,
		targetHeading:
			typeof nextSettings.targetHeading === "number" &&
			Number.isFinite(nextSettings.targetHeading)
				? ((nextSettings.targetHeading % 360) + 360) % 360
				: settings.targetHeading,
		targetSpeed:
			typeof nextSettings.targetSpeed === "number" &&
			Number.isFinite(nextSettings.targetSpeed)
				? Math.max(0, nextSettings.targetSpeed)
				: settings.targetSpeed,
		targetAltitude:
			typeof nextSettings.targetAltitude === "number" &&
			Number.isFinite(nextSettings.targetAltitude)
				? Math.max(0, nextSettings.targetAltitude)
				: settings.targetAltitude,
		verticalSpeed:
			typeof nextSettings.verticalSpeed === "number" &&
			Number.isFinite(nextSettings.verticalSpeed)
				? nextSettings.verticalSpeed
				: settings.verticalSpeed,
		maxBankDegrees: finiteOrCurrent(
			nextSettings.maxBankDegrees,
			settings.maxBankDegrees,
			1,
			45,
		),
		standardTurnRateDegreesPerMinute: finiteOrCurrent(
			nextSettings.standardTurnRateDegreesPerMinute,
			settings.standardTurnRateDegreesPerMinute,
			30,
			540,
		),
		bankSmoothnessDegreesPerSecond: finiteOrCurrent(
			nextSettings.bankSmoothnessDegreesPerSecond,
			settings.bankSmoothnessDegreesPerSecond,
			0.5,
			90,
		),
		headingKp: finiteOrCurrent(nextSettings.headingKp, settings.headingKp),
		headingKi: finiteOrCurrent(nextSettings.headingKi, settings.headingKi),
		headingKd: finiteOrCurrent(nextSettings.headingKd, settings.headingKd),
		headingCaptureStartDegrees: finiteOrCurrent(
			nextSettings.headingCaptureStartDegrees,
			settings.headingCaptureStartDegrees,
			1,
			180,
		),
		headingCaptureMinScale: finiteOrCurrent(
			nextSettings.headingCaptureMinScale,
			settings.headingCaptureMinScale,
			0,
			1,
		),
		headingIntegralDecayStartDegrees: finiteOrCurrent(
			nextSettings.headingIntegralDecayStartDegrees,
			settings.headingIntegralDecayStartDegrees,
			1,
			180,
		),
		altitudeKp: finiteOrCurrent(nextSettings.altitudeKp, settings.altitudeKp),
		altitudeKi: finiteOrCurrent(nextSettings.altitudeKi, settings.altitudeKi),
		altitudeKd: finiteOrCurrent(nextSettings.altitudeKd, settings.altitudeKd),
		altitudeCaptureBandMeters: finiteOrCurrent(
			nextSettings.altitudeCaptureBandMeters,
			settings.altitudeCaptureBandMeters,
			1,
			1000,
		),
		altitudeCaptureStartMeters: finiteOrCurrent(
			nextSettings.altitudeCaptureStartMeters,
			settings.altitudeCaptureStartMeters,
			1,
			5000,
		),
		altitudeCaptureMinScale: finiteOrCurrent(
			nextSettings.altitudeCaptureMinScale,
			settings.altitudeCaptureMinScale,
			0,
			1,
		),
		initialVerticalSpeedFpm: finiteOrCurrent(
			nextSettings.initialVerticalSpeedFpm,
			settings.initialVerticalSpeedFpm,
			0,
			6000,
		),
		verticalSpeedRampFpmPerSecond: finiteOrCurrent(
			nextSettings.verticalSpeedRampFpmPerSecond,
			settings.verticalSpeedRampFpmPerSecond,
			1,
			5000,
		),
		verticalSpeedReductionFpmPerSecond: finiteOrCurrent(
			nextSettings.verticalSpeedReductionFpmPerSecond,
			settings.verticalSpeedReductionFpmPerSecond,
			1,
			8000,
		),
	};
}

function emitSettings(): void {
	logController("emit settings", settings);
	worker?.postMessage({
		type: "settings",
		...settings,
		logFilePath,
	});
}

function ensureWorker(): void {
	if (worker || !settings.autopilotOn) {
		logController("worker start skipped", {
			hasWorker: Boolean(worker),
			settings,
		});
		return;
	}

	logController("starting worker", {
		workerPath: getWorkerPath(),
		logFilePath,
		settings,
	});
	worker = utilityProcess.fork(
		getWorkerPath(),
		logFilePath ? ["--log-file", logFilePath] : [],
		{
			serviceName: "OpenFMC Autopilot",
			stdio: "pipe",
		},
	);
	status = "STARTING";

	worker.on("spawn", () => {
		status = "RUNNING";
		logController("worker spawned", { pid: worker?.pid ?? null });
		emitSettings();
	});
	worker.on("message", (message: unknown) => {
		if (
			typeof message === "object" &&
			message !== null &&
			"type" in message &&
			message.type === "log" &&
			"message" in message &&
			typeof message.message === "string"
		) {
			console.log(
				`[autopilot:worker] ${message.message}`,
				"details" in message ? message.details : "",
			);
			return;
		}

		if (
			typeof message === "object" &&
			message !== null &&
			"status" in message &&
			typeof message.status === "string"
		) {
			status = message.status;
		}
	});
	worker.on("exit", () => {
		logController("worker exited", { settings });
		worker = null;
		status = settings.autopilotOn ? "STOPPED" : "STANDBY";
	});
	worker.stdout?.on("data", (chunk) => {
		const output = String(chunk).trimEnd();
		appendAutopilotLog("worker:stdout", output);
		console.log(`[autopilot] ${String(chunk)}`);
	});
	worker.stderr?.on("data", (chunk) => {
		const output = String(chunk).trimEnd();
		appendAutopilotLog("worker:stderr", output);
		console.error(`[autopilot] ${String(chunk)}`);
	});
}

function stopWorker(): void {
	if (!worker) {
		status = "STANDBY";
		logController("stop skipped, no worker", { settings });
		return;
	}

	logController("stopping worker", { pid: worker.pid ?? null });
	worker.postMessage({ type: "shutdown" });
	const stoppingWorker = worker;
	setTimeout(() => {
		if (worker === stoppingWorker) {
			logController("worker did not exit after shutdown, killing", {
				pid: worker?.pid ?? null,
			});
			worker?.kill();
			worker = null;
			status = "STANDBY";
		}
	}, 1500);
}

export function getAutopilotStatus(): AutopilotStatus {
	return {
		...settings,
		workerRunning: Boolean(worker?.pid),
		status,
		pid: worker?.pid ?? null,
		logFilePath,
	};
}

export function setAutopilotLogFilePath(nextLogFilePath: string): void {
	defaultLogFilePath = nextLogFilePath;
	logFilePath = nextLogFilePath;
	logController("log file configured", { logFilePath });
	emitSettings();
}

export function setAutopilotLoggingEnabled(enabled: boolean): AutopilotStatus {
	logFilePath = enabled ? defaultLogFilePath : null;
	logController("logging state updated", { enabled, logFilePath });
	emitSettings();
	return getAutopilotStatus();
}

export function setAutopilotSettings(
	nextSettings: Partial<AutopilotSettings>,
): AutopilotStatus {
	logController("settings requested", nextSettings);
	settings = sanitizeSettings(nextSettings);
	logController("settings applied", settings);

	if (settings.autopilotOn) {
		ensureWorker();
		emitSettings();
	} else {
		stopWorker();
	}

	return getAutopilotStatus();
}

export function shutdownAutopilotWorker(): void {
	stopWorker();
}
