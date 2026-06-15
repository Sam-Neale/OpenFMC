import { IFCClient } from "ifc-node";
import type { StateValue } from "ifc-node";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

interface UtilityParentPort {
	postMessage(message: unknown): void;
	on(event: "message", listener: (message: unknown) => void): void;
}

const parentPort = (
	process as NodeJS.Process & {
		parentPort?: UtilityParentPort;
	}
).parentPort;

if (!parentPort) {
	throw new Error("OpenFMC autopilot worker started without parentPort");
}

interface AutopilotWorkerSettings {
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

interface AutopilotWorkerSettingsMessage extends Partial<AutopilotWorkerSettings> {
	logFilePath?: string | null;
}

const UPDATE_INTERVAL_MS = 500;
const MAX_INTEGRAL_DEGREES_SECONDS = 200;
const MAX_ALTITUDE_INTEGRAL_METERS_SECONDS = 10_000;
const MIN_SPEED_KTS = 0;
const MAX_SPEED_KTS = 399;
const STANDARD_GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665;
const METERS_PER_SECOND_TO_KNOTS = 1.9438444924406;
const KNOTS_TO_METERS_PER_SECOND = 1 / METERS_PER_SECOND_TO_KNOTS;
const FEET_TO_METERS = 0.3048;
const METERS_TO_FEET = 1 / FEET_TO_METERS;
const FEET_PER_MINUTE_TO_METERS_PER_MINUTE = 0.3048;
const METERS_PER_MINUTE_TO_FEET_PER_MINUTE =
	1 / FEET_PER_MINUTE_TO_METERS_PER_MINUTE;
const logFileArgIndex = process.argv.indexOf("--log-file");
let logFilePath: string | null =
	logFileArgIndex >= 0 ? (process.argv[logFileArgIndex + 1] ?? null) : null;

let settings: AutopilotWorkerSettings = {
	autopilotOn: false,
	targetHeading: 0,
	targetSpeed: 180,
	targetAltitude: 1000,
	verticalSpeed: 1000,
	maxBankDegrees: 30,
	standardTurnRateDegreesPerMinute: 180,
	bankSmoothnessDegreesPerSecond: 5,
	headingKp: 0.018,
	headingKi: 0.0008,
	headingKd: 0.004,
	headingCaptureStartDegrees: 7,
	headingCaptureMinScale: 0.99,
	headingIntegralDecayStartDegrees: 5,
	altitudeKp: 2.4,
	altitudeKi: 0.015,
	altitudeKd: 0.6,
	altitudeCaptureBandMeters: 3,
	altitudeCaptureStartMeters: 30,
	altitudeCaptureMinScale: 0.5,
	initialVerticalSpeedFpm: 500,
	verticalSpeedRampFpmPerSecond: 150,
	verticalSpeedReductionFpmPerSecond: 650,
};
let client: IFCClient | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let updateInFlight = false;
let tickCount = 0;
let previousHeadingError: number | null = null;
let headingIntegral = 0;
let previousAltitudeError: number | null = null;
let altitudeIntegral = 0;
let commandedVerticalSpeedFpm = 0;
let commandedBankTargetRadians = 0;
let previousTickTime = Date.now();

function postStatus(status: string): void {
	parentPort.postMessage({
		type: "status",
		status,
		settings,
	});
}

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

function appendWorkerLog(message: string, details?: unknown): void {
	if (!logFilePath) {
		return;
	}

	try {
		mkdirSync(path.dirname(logFilePath), { recursive: true });
		appendFileSync(
			logFilePath,
			`${new Date().toISOString()} [worker] ${message}${stringifyDetails(details)}\n`,
			"utf8",
		);
	} catch {
		// Logging must never interfere with flight guidance.
	}
}

function logWorker(message: string, details?: unknown): void {
	appendWorkerLog(message, details);
	parentPort.postMessage({
		type: "log",
		message,
		details,
	});
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function normalizeDegrees(value: number): number {
	return ((value % 360) + 360) % 360;
}

function getHeadingError(
	currentHeading: number,
	targetHeading: number,
): number {
	const difference = normalizeDegrees(targetHeading - currentHeading);

	return difference > 180 ? difference - 360 : difference;
}

function toFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function metersPerSecondToKnots(value: unknown): number | null {
	const numberValue = toFiniteNumber(value);

	return numberValue === null ? null : numberValue * METERS_PER_SECOND_TO_KNOTS;
}

function knotsToMetersPerSecond(value: number): number {
	return value * KNOTS_TO_METERS_PER_SECOND;
}

function metersToFeet(value: unknown): number | null {
	const numberValue = toFiniteNumber(value);

	return numberValue === null ? null : numberValue * METERS_TO_FEET;
}

function feetPerMinuteToMetersPerMinute(value: number): number {
	return value * FEET_PER_MINUTE_TO_METERS_PER_MINUTE;
}

function metersPerMinuteToFeetPerMinute(value: unknown): number | null {
	const numberValue = toFiniteNumber(value);

	return numberValue === null
		? null
		: numberValue * METERS_PER_MINUTE_TO_FEET_PER_MINUTE;
}

async function getClient(): Promise<IFCClient> {
	if (!client) {
		logWorker("connecting to Infinite Flight ConnectAPI");
		client = new IFCClient();
		await client.connect();
		logWorker("connected to Infinite Flight ConnectAPI");
		postStatus("CONNECTED");
	}

	return client;
}

async function setState(pathName: string, value: StateValue): Promise<void> {
	await (await getClient()).set(pathName, value);
}

async function getState(pathName: string): Promise<StateValue> {
	return (await getClient()).get(pathName);
}

async function setAutopilotChannels(enabled: boolean): Promise<void> {
	logWorker("setting autopilot channel enable states", { enabled });
	await setState("aircraft/0/systems/autopilot/hdg/on", false);
	await setState("aircraft/0/systems/autopilot/alt/on", false);
	await setState("aircraft/0/systems/autopilot/bank/on", enabled);
	await setState("aircraft/0/systems/autopilot/spd/on", enabled);
	await setState("aircraft/0/systems/autopilot/vs/on", enabled);
}

function degreesToRadians(value: number): number {
	return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
	return (value * 180) / Math.PI;
}

function calculateStandardRateBankLimitRadians(
	speedMetersPerSecond: number | null,
): {
	bankLimitRadians: number;
	bankLimitDegrees: number;
	standardRateBankDegrees: number | null;
	maxBankDegrees: number;
} {
	const maxBankRadians = degreesToRadians(settings.maxBankDegrees);

	if (speedMetersPerSecond === null || speedMetersPerSecond <= 0) {
		return {
			bankLimitRadians: maxBankRadians,
			bankLimitDegrees: settings.maxBankDegrees,
			standardRateBankDegrees: null,
			maxBankDegrees: settings.maxBankDegrees,
		};
	}

	const turnRateRadiansPerSecond =
		degreesToRadians(settings.standardTurnRateDegreesPerMinute) / 60;
	const standardRateBankRadians = Math.atan(
		(turnRateRadiansPerSecond * speedMetersPerSecond) /
			STANDARD_GRAVITY_METERS_PER_SECOND_SQUARED,
	);
	const bankLimitRadians = Math.min(maxBankRadians, standardRateBankRadians);

	return {
		bankLimitRadians,
		bankLimitDegrees: Math.round(radiansToDegrees(bankLimitRadians) * 10) / 10,
		standardRateBankDegrees:
			Math.round(radiansToDegrees(standardRateBankRadians) * 10) / 10,
		maxBankDegrees: settings.maxBankDegrees,
	};
}

function smoothBankTarget(
	currentRadians: number,
	targetRadians: number,
	deltaSeconds: number,
): number {
	const maxStepRadians =
		degreesToRadians(settings.bankSmoothnessDegreesPerSecond) * deltaSeconds;

	if (Math.abs(targetRadians - currentRadians) <= maxStepRadians) {
		return targetRadians;
	}

	return (
		currentRadians + Math.sign(targetRadians - currentRadians) * maxStepRadians
	);
}

function calculateBankTarget(
	currentHeading: number,
	targetHeading: number,
	deltaSeconds: number,
	bankLimitRadians: number,
): {
	headingError: number;
	derivative: number;
	integral: number;
	captureScale: number;
	rawBankTargetRadians: number;
	limitedBankTargetRadians: number;
	bankTargetRadians: number;
	bankTargetDegrees: number;
} {
	const headingError = getHeadingError(currentHeading, targetHeading);
	const absHeadingError = Math.abs(headingError);

	if (absHeadingError < settings.headingIntegralDecayStartDegrees) {
		headingIntegral *=
			absHeadingError / settings.headingIntegralDecayStartDegrees;
	}

	headingIntegral = clamp(
		headingIntegral + headingError * deltaSeconds,
		-MAX_INTEGRAL_DEGREES_SECONDS,
		MAX_INTEGRAL_DEGREES_SECONDS,
	);
	const derivative =
		previousHeadingError === null || deltaSeconds <= 0
			? 0
			: (headingError - previousHeadingError) / deltaSeconds;
	const rawBankTargetRadians =
		settings.headingKp * headingError +
		settings.headingKi * headingIntegral +
		settings.headingKd * derivative;
	const limitedBankTargetRadians = clamp(
		rawBankTargetRadians,
		-bankLimitRadians,
		bankLimitRadians,
	);
	const captureRatio = clamp(
		absHeadingError / settings.headingCaptureStartDegrees,
		0,
		1,
	);
	const captureScale =
		settings.headingCaptureMinScale +
		(1 - settings.headingCaptureMinScale) * captureRatio ** 1.5;
	const bankTargetRadians = limitedBankTargetRadians * captureScale;

	previousHeadingError = headingError;

	return {
		headingError,
		derivative,
		integral: headingIntegral,
		captureScale,
		rawBankTargetRadians: Math.round(rawBankTargetRadians * 10_000) / 10_000,
		limitedBankTargetRadians:
			Math.round(limitedBankTargetRadians * 10_000) / 10_000,
		bankTargetRadians: Math.round(bankTargetRadians * 10_000) / 10_000,
		bankTargetDegrees:
			Math.round((bankTargetRadians * 180 * 10) / Math.PI) / 10,
	};
}

function calculateAltitudePidVerticalSpeed(
	currentAltitudeMeters: number | null,
	targetAltitudeMeters: number,
	selectedVerticalSpeedFpm: number,
	deltaSeconds: number,
): {
	altitudeError: number | null;
	derivative: number;
	integral: number;
	captureScale: number;
	rawVerticalSpeedFpm: number;
	limitedVerticalSpeedFpm: number;
	targetVerticalSpeedFpm: number;
	commandedVerticalSpeedFpm: number;
} {
	if (currentAltitudeMeters === null || targetAltitudeMeters <= 0) {
		const limitedVerticalSpeedFpm = selectedVerticalSpeedFpm;
		commandedVerticalSpeedFpm = rampVerticalSpeed(
			commandedVerticalSpeedFpm,
			limitedVerticalSpeedFpm,
			deltaSeconds,
		);

		return {
			altitudeError: null,
			derivative: 0,
			integral: altitudeIntegral,
			captureScale: 1,
			rawVerticalSpeedFpm: limitedVerticalSpeedFpm,
			limitedVerticalSpeedFpm,
			targetVerticalSpeedFpm: limitedVerticalSpeedFpm,
			commandedVerticalSpeedFpm,
		};
	}

	const altitudeError = targetAltitudeMeters - currentAltitudeMeters;

	if (Math.abs(altitudeError) <= settings.altitudeCaptureBandMeters) {
		altitudeIntegral = 0;
		previousAltitudeError = altitudeError;
		commandedVerticalSpeedFpm = rampVerticalSpeed(
			commandedVerticalSpeedFpm,
			0,
			deltaSeconds,
		);

		return {
			altitudeError,
			derivative: 0,
			integral: altitudeIntegral,
			captureScale: 0,
			rawVerticalSpeedFpm: 0,
			limitedVerticalSpeedFpm: 0,
			targetVerticalSpeedFpm: 0,
			commandedVerticalSpeedFpm,
		};
	}

	altitudeIntegral = clamp(
		altitudeIntegral + altitudeError * deltaSeconds,
		-MAX_ALTITUDE_INTEGRAL_METERS_SECONDS,
		MAX_ALTITUDE_INTEGRAL_METERS_SECONDS,
	);
	const derivative =
		previousAltitudeError === null || deltaSeconds <= 0
			? 0
			: (altitudeError - previousAltitudeError) / deltaSeconds;
	const rawVerticalSpeedFpm =
		settings.altitudeKp * (altitudeError * METERS_TO_FEET) +
		settings.altitudeKi * (altitudeIntegral * METERS_TO_FEET) +
		settings.altitudeKd * (derivative * METERS_TO_FEET);
	const maxVerticalSpeed = Math.abs(selectedVerticalSpeedFpm);
	const limitedVerticalSpeedFpm = clamp(
		rawVerticalSpeedFpm,
		-maxVerticalSpeed,
		maxVerticalSpeed,
	);
	const captureRatio = clamp(
		Math.abs(altitudeError) / settings.altitudeCaptureStartMeters,
		0,
		1,
	);
	const captureScale =
		settings.altitudeCaptureMinScale +
		(1 - settings.altitudeCaptureMinScale) * captureRatio ** 2;
	const targetVerticalSpeedFpm = limitedVerticalSpeedFpm * captureScale;

	previousAltitudeError = altitudeError;
	commandedVerticalSpeedFpm = rampVerticalSpeed(
		commandedVerticalSpeedFpm,
		targetVerticalSpeedFpm,
		deltaSeconds,
	);

	return {
		altitudeError,
		derivative,
		integral: altitudeIntegral,
		captureScale,
		rawVerticalSpeedFpm,
		limitedVerticalSpeedFpm,
		targetVerticalSpeedFpm,
		commandedVerticalSpeedFpm,
	};
}

function rampVerticalSpeed(
	currentFpm: number,
	targetFpm: number,
	deltaSeconds: number,
): number {
	if (
		currentFpm === 0 &&
		Math.abs(targetFpm) >= settings.initialVerticalSpeedFpm
	) {
		return Math.sign(targetFpm) * settings.initialVerticalSpeedFpm;
	}

	const isReducingMagnitude =
		Math.sign(currentFpm) !== Math.sign(targetFpm) ||
		Math.abs(targetFpm) < Math.abs(currentFpm);
	const maxStep =
		(isReducingMagnitude
			? settings.verticalSpeedReductionFpmPerSecond
			: settings.verticalSpeedRampFpmPerSecond) * deltaSeconds;

	if (Math.abs(targetFpm - currentFpm) <= maxStep) {
		return Math.round(targetFpm);
	}

	return Math.round(currentFpm + Math.sign(targetFpm - currentFpm) * maxStep);
}

async function updateAutopilot(): Promise<void> {
	if (updateInFlight) {
		logWorker("tick skipped, previous update still in flight");
		return;
	}

	updateInFlight = true;
	tickCount += 1;
	const tick = tickCount;
	const now = Date.now();
	const deltaSeconds = Math.max(0.001, (now - previousTickTime) / 1000);
	previousTickTime = now;
	logWorker("tick start", { tick, settings, deltaSeconds });

	try {
		if (!settings.autopilotOn) {
			headingIntegral = 0;
			previousHeadingError = null;
			altitudeIntegral = 0;
			previousAltitudeError = null;
			commandedVerticalSpeedFpm = 0;
			commandedBankTargetRadians = 0;
			await setAutopilotChannels(false);
			postStatus("STANDBY");
			return;
		}

		const [
			headingMagneticRadians,
			indicatedAirspeedMetersPerSecond,
			altitudeMslMeters,
		] = await Promise.all([
			getState("aircraft/0/heading_magnetic"),
			getState("aircraft/0/indicated_airspeed"),
			getState("aircraft/0/altitude_msl"),
		]);
		const indicatedAirspeed = metersPerSecondToKnots(
			indicatedAirspeedMetersPerSecond,
		);
		const altitudeMsl =
			typeof altitudeMslMeters === "number" ? altitudeMslMeters : null;
		const altitudeMslFeet = metersToFeet(altitudeMslMeters);
		let headingMagnetic;
		if (typeof headingMagneticRadians !== "number") {
			logWorker("heading unavailable", { tick, headingMagneticRadians });
			postStatus("NO HEADING");
			return;
		} else {
			headingMagnetic = headingMagneticRadians * (180 / Math.PI);
		}

		const rawIndicatedAirspeedMetersPerSecond =
			typeof indicatedAirspeedMetersPerSecond === "number"
				? indicatedAirspeedMetersPerSecond
				: null;
		const bankLimit = calculateStandardRateBankLimitRadians(
			rawIndicatedAirspeedMetersPerSecond,
		);
		const bank = calculateBankTarget(
			headingMagnetic,
			settings.targetHeading,
			deltaSeconds,
			bankLimit.bankLimitRadians,
		);
		commandedBankTargetRadians = smoothBankTarget(
			commandedBankTargetRadians,
			bank.bankTargetRadians,
			deltaSeconds,
		);
		const commandedBankTargetDegrees =
			Math.round(radiansToDegrees(commandedBankTargetRadians) * 10) / 10;
		const speedTargetKts = clamp(
			Math.round(settings.targetSpeed),
			MIN_SPEED_KTS,
			MAX_SPEED_KTS,
		);
		const speedTargetMetersPerSecond =
			Math.round(knotsToMetersPerSecond(speedTargetKts) * 100) / 100;
		const verticalSpeed = calculateAltitudePidVerticalSpeed(
			altitudeMsl,
			settings.targetAltitude,
			settings.verticalSpeed,
			deltaSeconds,
		);
		const vsTargetMetersPerMinute =
			Math.round(
				feetPerMinuteToMetersPerMinute(
					verticalSpeed.commandedVerticalSpeedFpm,
				) * 10,
			) / 10;
		const targetAltitudeFeet = Math.round(
			settings.targetAltitude * METERS_TO_FEET,
		);

		logWorker("pid guidance calculation", {
			tick,
			headingMagnetic,
			targetHeading: settings.targetHeading,
			headingError: bank.headingError,
			pid: {
				kp: settings.headingKp,
				ki: settings.headingKi,
				kd: settings.headingKd,
				integral: bank.integral,
				derivative: bank.derivative,
				captureScale: bank.captureScale,
				captureStartDegrees: settings.headingCaptureStartDegrees,
				captureMinScale: settings.headingCaptureMinScale,
			},
			rawBankTargetRadians: bank.rawBankTargetRadians,
			limitedBankTargetRadians: bank.limitedBankTargetRadians,
			bankTargetDegrees: bank.bankTargetDegrees,
			bankTargetRadians: bank.bankTargetRadians,
			commandedBankTargetDegrees,
			commandedBankTargetRadians:
				Math.round(commandedBankTargetRadians * 10_000) / 10_000,
			bankLimit,
			bankSmoothnessDegreesPerSecond: settings.bankSmoothnessDegreesPerSecond,
			indicatedAirspeedMetersPerSecond,
			indicatedAirspeed,
			speedTargetKts,
			speedTargetMetersPerSecond,
			altitudeMslMeters,
			altitudeMslFeet,
			targetAltitudeMeters: settings.targetAltitude,
			targetAltitudeFeet,
			selectedVerticalSpeedFpm: settings.verticalSpeed,
			altitudePid: {
				kp: settings.altitudeKp,
				ki: settings.altitudeKi,
				kd: settings.altitudeKd,
				altitudeError: verticalSpeed.altitudeError,
				integral: verticalSpeed.integral,
				derivative: verticalSpeed.derivative,
				captureScale: verticalSpeed.captureScale,
				captureBandMeters: settings.altitudeCaptureBandMeters,
				captureStartMeters: settings.altitudeCaptureStartMeters,
				captureMinScale: settings.altitudeCaptureMinScale,
				rawVerticalSpeedFpm: verticalSpeed.rawVerticalSpeedFpm,
				limitedVerticalSpeedFpm: verticalSpeed.limitedVerticalSpeedFpm,
				targetVerticalSpeedFpm: verticalSpeed.targetVerticalSpeedFpm,
				commandedVerticalSpeedFpm: verticalSpeed.commandedVerticalSpeedFpm,
				rampFpmPerSecond: settings.verticalSpeedRampFpmPerSecond,
				reductionFpmPerSecond: settings.verticalSpeedReductionFpmPerSecond,
			},
			vsTargetFpm: verticalSpeed.commandedVerticalSpeedFpm,
			vsTargetMetersPerMinute,
		});
		await setState(
			"aircraft/0/systems/autopilot/hdg/target",
			Math.round(((settings.targetHeading * Math.PI) / 180) * 10_000) / 10_000,
		);
		await setState("aircraft/0/systems/autopilot/bank/on", true);
		await setState(
			"aircraft/0/systems/autopilot/bank/target",
			Math.round(commandedBankTargetRadians * 10_000) / 10_000,
		);
		await setState("aircraft/0/systems/autopilot/spd/on", true);
		await setState(
			"aircraft/0/systems/autopilot/spd/target",
			speedTargetMetersPerSecond,
		);
		await setState(
			"aircraft/0/systems/autopilot/alt/target",
			settings.targetAltitude * FEET_TO_METERS,
		);
		await setState("aircraft/0/systems/autopilot/vs/on", true);
		await setState(
			"aircraft/0/systems/autopilot/vs/target",
			vsTargetMetersPerMinute,
		);

		const [
			bankOnReadback,
			bankTargetReadback,
			speedOnReadback,
			speedTargetReadback,
			vsOnReadback,
			vsTargetReadback,
		] = await Promise.all([
			getState("aircraft/0/systems/autopilot/bank/on"),
			getState("aircraft/0/systems/autopilot/bank/target"),
			getState("aircraft/0/systems/autopilot/spd/on"),
			getState("aircraft/0/systems/autopilot/spd/target"),
			getState("aircraft/0/systems/autopilot/vs/on"),
			getState("aircraft/0/systems/autopilot/vs/target"),
		]);
		postStatus(
			`HDG ${String(Math.round(settings.targetHeading)).padStart(3, "0")}`,
		);
	} catch (error) {
		logWorker("tick failed", {
			tick,
			error:
				error instanceof Error ? (error.stack ?? error.message) : String(error),
		});
		postStatus(error instanceof Error ? error.message : "AUTOPILOT ERROR");
	} finally {
		updateInFlight = false;
	}
}

function startLoop(): void {
	if (updateTimer) {
		logWorker("loop already running");
		return;
	}

	logWorker("starting update loop", { intervalMs: UPDATE_INTERVAL_MS });
	updateTimer = setInterval(() => {
		void updateAutopilot();
	}, UPDATE_INTERVAL_MS);
	void updateAutopilot();
}

function unwrapMessage(message: unknown): unknown {
	if (typeof message === "object" && message !== null && "data" in message) {
		return message.data;
	}

	return message;
}

function numberOrCurrent(value: unknown, current: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : current;
}

parentPort.on("message", (message: unknown) => {
	logWorker("message received", message);
	const payload = unwrapMessage(message);
	logWorker("message payload", payload);

	if (typeof payload !== "object" || payload === null || !("type" in payload)) {
		logWorker("message ignored, no payload type", payload);
		return;
	}

	if (payload.type === "settings") {
		const nextSettings = payload as AutopilotWorkerSettingsMessage & {
			type: "settings";
		};
		if ("logFilePath" in nextSettings) {
			logFilePath = nextSettings.logFilePath ?? null;
		}
		settings = {
			autopilotOn: Boolean(nextSettings.autopilotOn),
			targetHeading:
				typeof nextSettings.targetHeading === "number"
					? normalizeDegrees(nextSettings.targetHeading)
					: settings.targetHeading,
			targetSpeed:
				typeof nextSettings.targetSpeed === "number"
					? nextSettings.targetSpeed
					: settings.targetSpeed,
			targetAltitude:
				typeof nextSettings.targetAltitude === "number"
					? nextSettings.targetAltitude
					: settings.targetAltitude,
			verticalSpeed:
				typeof nextSettings.verticalSpeed === "number"
					? nextSettings.verticalSpeed
					: settings.verticalSpeed,
			maxBankDegrees: numberOrCurrent(
				nextSettings.maxBankDegrees,
				settings.maxBankDegrees,
			),
			standardTurnRateDegreesPerMinute: numberOrCurrent(
				nextSettings.standardTurnRateDegreesPerMinute,
				settings.standardTurnRateDegreesPerMinute,
			),
			bankSmoothnessDegreesPerSecond: numberOrCurrent(
				nextSettings.bankSmoothnessDegreesPerSecond,
				settings.bankSmoothnessDegreesPerSecond,
			),
			headingKp: numberOrCurrent(nextSettings.headingKp, settings.headingKp),
			headingKi: numberOrCurrent(nextSettings.headingKi, settings.headingKi),
			headingKd: numberOrCurrent(nextSettings.headingKd, settings.headingKd),
			headingCaptureStartDegrees: numberOrCurrent(
				nextSettings.headingCaptureStartDegrees,
				settings.headingCaptureStartDegrees,
			),
			headingCaptureMinScale: numberOrCurrent(
				nextSettings.headingCaptureMinScale,
				settings.headingCaptureMinScale,
			),
			headingIntegralDecayStartDegrees: numberOrCurrent(
				nextSettings.headingIntegralDecayStartDegrees,
				settings.headingIntegralDecayStartDegrees,
			),
			altitudeKp: numberOrCurrent(nextSettings.altitudeKp, settings.altitudeKp),
			altitudeKi: numberOrCurrent(nextSettings.altitudeKi, settings.altitudeKi),
			altitudeKd: numberOrCurrent(nextSettings.altitudeKd, settings.altitudeKd),
			altitudeCaptureBandMeters: numberOrCurrent(
				nextSettings.altitudeCaptureBandMeters,
				settings.altitudeCaptureBandMeters,
			),
			altitudeCaptureStartMeters: numberOrCurrent(
				nextSettings.altitudeCaptureStartMeters,
				settings.altitudeCaptureStartMeters,
			),
			altitudeCaptureMinScale: numberOrCurrent(
				nextSettings.altitudeCaptureMinScale,
				settings.altitudeCaptureMinScale,
			),
			initialVerticalSpeedFpm: numberOrCurrent(
				nextSettings.initialVerticalSpeedFpm,
				settings.initialVerticalSpeedFpm,
			),
			verticalSpeedRampFpmPerSecond: numberOrCurrent(
				nextSettings.verticalSpeedRampFpmPerSecond,
				settings.verticalSpeedRampFpmPerSecond,
			),
			verticalSpeedReductionFpmPerSecond: numberOrCurrent(
				nextSettings.verticalSpeedReductionFpmPerSecond,
				settings.verticalSpeedReductionFpmPerSecond,
			),
		};
		logWorker("log file updated", { logFilePath });
		logWorker("settings updated", settings);
		startLoop();
	}

	if (payload.type === "shutdown") {
		logWorker("shutdown requested");
		if (updateTimer) {
			clearInterval(updateTimer);
			updateTimer = null;
		}
		void setAutopilotChannels(false).finally(() => {
			logWorker("shutdown complete");
			process.exit(0);
		});
	}
});

logWorker("worker ready", { logFilePath: logFilePath ?? null });
postStatus("READY");
