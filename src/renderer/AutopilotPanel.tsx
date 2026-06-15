import { useEffect, useState } from "react";
import "./autopilot.css";

interface AutopilotStatus {
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
	workerRunning: boolean;
	status: string;
	pid: number | null;
	logFilePath: string | null;
}

type AutopilotEditableField =
	| "targetHeading"
	| "targetSpeed"
	| "targetAltitude"
	| "verticalSpeed"
	| "bankSmoothnessDegreesPerSecond";

function Toggle({
	checked,
	label,
	onChange,
}: {
	checked: boolean;
	label: string;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="ap-toggle">
			<span>{label}</span>
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.currentTarget.checked)}
			/>
		</label>
	);
}

function NumericField({
	label,
	value,
	unit,
	step,
	onChange,
}: {
	label: string;
	value: number;
	unit: string;
	step?: number;
	onChange: (value: number) => void;
}) {
	const [draft, setDraft] = useState(String(value));

	useEffect(() => {
		setDraft(String(value));
	}, [value]);

	const commit = () => {
		const nextValue = Number(draft);

		if (Number.isFinite(nextValue)) {
			onChange(nextValue);
		}
	};

	return (
		<label className="ap-field">
			<span>{label}</span>
			<div>
				<input
					type="number"
					value={draft}
					step={step ?? 1}
					onBlur={commit}
					onChange={(event) => setDraft(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							commit();
							event.currentTarget.blur();
						}
					}}
				/>
				<small>{unit}</small>
			</div>
		</label>
	);
}

export function AutopilotPanel() {
	const [status, setStatus] = useState<AutopilotStatus | null>(null);

	useEffect(() => {
		let active = true;

		const refresh = async () => {
			const nextStatus = await window.openFmc.autopilot.getStatus();

			if (active) {
				setStatus(nextStatus);
			}
		};
		const interval = window.setInterval(refresh, 1000);
		void refresh();

		return () => {
			active = false;
			window.clearInterval(interval);
		};
	}, []);

	const update = async (
		nextStatus: Partial<
			Pick<
				AutopilotStatus,
				| "autopilotOn"
				| "targetHeading"
				| "targetSpeed"
				| "targetAltitude"
				| "verticalSpeed"
				| "maxBankDegrees"
				| "standardTurnRateDegreesPerMinute"
				| "bankSmoothnessDegreesPerSecond"
				| "headingKp"
				| "headingKi"
				| "headingKd"
				| "headingCaptureStartDegrees"
				| "headingCaptureMinScale"
				| "headingIntegralDecayStartDegrees"
				| "altitudeKp"
				| "altitudeKi"
				| "altitudeKd"
				| "altitudeCaptureBandMeters"
				| "altitudeCaptureStartMeters"
				| "altitudeCaptureMinScale"
				| "initialVerticalSpeedFpm"
				| "verticalSpeedRampFpmPerSecond"
				| "verticalSpeedReductionFpmPerSecond"
			>
		>,
	) => {
		setStatus(await window.openFmc.autopilot.setSettings(nextStatus));
	};
	const updateField = (field: AutopilotEditableField, value: number) => {
		void update({ [field]: value });
	};
	const autopilotOn = Boolean(status?.autopilotOn);
	const loggingEnabled = Boolean(status?.logFilePath);

	return (
		<main className="ap-panel">
			<header>
				<h1>OpenFMC Autopilot</h1>
				<p>{status?.status ?? "LOADING"}</p>
			</header>

			<section>
				<Toggle
					label="Autopilot On/Off"
					checked={autopilotOn}
					onChange={(checked) => update({ autopilotOn: checked })}
				/>
				<Toggle
					label="Logger Enabled"
					checked={loggingEnabled}
					onChange={(checked) => {
						void window.openFmc.autopilot
							.setLoggingEnabled(checked)
							.then(setStatus);
					}}
				/>
				<NumericField
					label="Heading"
					unit="deg"
					value={status?.targetHeading ?? 0}
					onChange={(value) => updateField("targetHeading", value)}
				/>
				<NumericField
					label="Speed"
					unit="kt"
					value={status?.targetSpeed ?? 180}
					onChange={(value) => updateField("targetSpeed", value)}
				/>
				<NumericField
					label="Level Altitude"
					unit="ft"
					step={100}
					value={status?.targetAltitude ?? 1000}
					onChange={(value) => updateField("targetAltitude", value)}
				/>
				<NumericField
					label="Vertical Speed"
					unit="fpm"
					step={100}
					value={status?.verticalSpeed ?? 1000}
					onChange={(value) => updateField("verticalSpeed", value)}
				/>
				<NumericField
					label="Bank Smoothness"
					unit="deg/s"
					step={0.5}
					value={status?.bankSmoothnessDegreesPerSecond ?? 5}
					onChange={(value) =>
						updateField("bankSmoothnessDegreesPerSecond", value)
					}
				/>
			</section>

			<footer>
				<span>
					{status?.workerRunning ? "PROCESS RUNNING" : "PROCESS STOPPED"}
				</span>
				<span>{status?.pid ? `PID ${status.pid}` : "NO PID"}</span>
			</footer>
		</main>
	);
}
