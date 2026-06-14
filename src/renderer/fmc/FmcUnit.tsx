import { useEffect, useMemo, useState } from "react";

import { FmcButton } from "./FmcButton";
import { FmcDisplay } from "./FmcDisplay";
import {
	getFmcState,
	pressFmcKey,
	renderFmcScreen,
	subscribeFmc,
} from "./engine";
import { keyboardEventToFmcKey } from "./keyboard";
import type { FmcKey, FmcState } from "./types";
import "./fmc.css";

interface PositionedFunctionKey {
	key: FmcKey;
	label: string;
	column: number;
	row: number;
}

const functionKeys: PositionedFunctionKey[] = [
	{ key: "INIT_REF", label: "INIT\nREF", column: 1, row: 1 },
	{ key: "RTE", label: "RTE", column: 2, row: 1 },
	{ key: "DEP_ARR", label: "DEP\nARR", column: 3, row: 1 },
	{ key: "ATC", label: "ATC", column: 4, row: 1 },
	{ key: "VNAV", label: "VNAV", column: 5, row: 1 },

	{ key: "FIX", label: "FIX", column: 1, row: 2 },
	{ key: "LEGS", label: "LEGS", column: 2, row: 2 },
	{ key: "HOLD", label: "HOLD", column: 3, row: 2 },
	{ key: "FMC_COMM", label: "FMC\nCOMM", column: 4, row: 2 },
	{ key: "PROG", label: "PROG", column: 5, row: 2 },
	{ key: "EXEC", label: "EXEC", column: 6, row: 2 },

	{ key: "MENU", label: "MENU", column: 1, row: 3 },
	{ key: "NAV_RAD", label: "NAV\nRAD", column: 2, row: 3 },

	{ key: "PREV_PAGE", label: "PREV\nPAGE", column: 1, row: 4 },
	{ key: "NEXT_PAGE", label: "NEXT\nPAGE", column: 2, row: 4 },
];

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") as FmcKey[];
const numberKeys: Array<[FmcKey, string]> = [
	["1", "1"],
	["2", "2"],
	["3", "3"],
	["4", "4"],
	["5", "5"],
	["6", "6"],
	["7", "7"],
	["8", "8"],
	["9", "9"],
	["DOT", "•"],
	["0", "0"],
	["PLUS_MINUS", "+/−"],
];

const DESIGN_WIDTH = 620;

const DESIGN_HEIGHT = 980;

export function FmcUnit() {
	const [state, setState] = useState<FmcState>(getFmcState() as FmcState);

	const [scale, setScale] = useState(1);

	useEffect(
		() => subscribeFmc((next) => setState({ ...next } as FmcState)),
		[],
	);

	useEffect(() => {
		const updateScale = () => {
			const horizontalScale = (window.innerWidth - 24) / DESIGN_WIDTH;

			const verticalScale = (window.innerHeight - 24) / DESIGN_HEIGHT;

			setScale(Math.min(horizontalScale, verticalScale, 1));
		};

		updateScale();

		window.addEventListener("resize", updateScale);

		return () => {
			window.removeEventListener("resize", updateScale);
		};
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const fmcKey = keyboardEventToFmcKey(event);
			if (!fmcKey) return;

			event.preventDefault();
			pressFmcKey(fmcKey);
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	const screen = useMemo(() => renderFmcScreen(state), [state]);

	return (
		<main className="fmc-stage">
			<div
				className="fmc-scale-container"
				style={{
					width: DESIGN_WIDTH * scale,

					height: DESIGN_HEIGHT * scale,
				}}
			>
				<section
					className="fmc-unit"
					style={{
						transform: `scale(${scale})`,
					}}
				>
					<div className="fmc-unit__top">
						<div className="fmc-lsk-column">
							{[1, 2, 3, 4, 5, 6].map((number) => (
								<FmcButton
									key={number}
									fmcKey={`LSK_L${number}` as FmcKey}
									onPress={pressFmcKey}
									className="fmc-key--lsk"
									title={`Left line select key ${number}`}
								>
									<span className="fmc-lsk-mark">—</span>
								</FmcButton>
							))}
						</div>

						<FmcDisplay screen={screen} />

						<div className="fmc-lsk-column">
							{[1, 2, 3, 4, 5, 6].map((number) => (
								<FmcButton
									key={number}
									fmcKey={`LSK_R${number}` as FmcKey}
									onPress={pressFmcKey}
									className="fmc-key--lsk"
									title={`Right line select key ${number}`}
								>
									<span className="fmc-lsk-mark">—</span>
								</FmcButton>
							))}
						</div>
					</div>
					<div className="fmc-controls-layout">
						<div className="fmc-function-panel fmc-function-panel--upper" />

						<div className="fmc-function-panel fmc-function-panel--lower-left" />
						<div className="fmc-function-grid">
							{functionKeys.map(({ key, label, column, row }) => (
								<FmcButton
									key={key}
									fmcKey={key}
									onPress={pressFmcKey}
									className={[
										"fmc-key--function",
										key === "EXEC" && screen.execLight
											? "fmc-key--exec-lit"
											: "",
									].join(" ")}
									style={{
										gridColumn: column,
										gridRow: row,
									}}
								>
									{label.split("\n").map((line) => (
										<span key={line}>{line}</span>
									))}
								</FmcButton>
							))}
						</div>

						<div className="fmc-number-pad">
							{numberKeys.map(([key, label]) => (
								<FmcButton
									key={key}
									fmcKey={key}
									onPress={pressFmcKey}
									className="fmc-key--number"
								>
									{label}
								</FmcButton>
							))}
						</div>

						<div className="fmc-alpha-pad">
							{letters.map((letter) => {
								const isCompassKey = ["N", "S", "E", "W"].includes(letter);

								return (
									<FmcButton
										key={letter}
										fmcKey={letter}
										onPress={pressFmcKey}
										className={[
											"fmc-key--alpha",
											isCompassKey ? "fmc-key--compass" : "",
										].join(" ")}
									>
										<span>{letter}</span>
									</FmcButton>
								);
							})}

							<FmcButton
								fmcKey="SP"
								onPress={pressFmcKey}
								className="fmc-key--alpha"
							>
								SP
							</FmcButton>

							<FmcButton
								fmcKey="DEL"
								onPress={pressFmcKey}
								className="fmc-key--alpha"
							>
								DEL
							</FmcButton>

							<FmcButton
								fmcKey="SLASH"
								onPress={pressFmcKey}
								className="fmc-key--alpha"
							>
								/
							</FmcButton>

							<FmcButton
								fmcKey="CLR"
								onPress={pressFmcKey}
								className="fmc-key--alpha"
							>
								CLR
							</FmcButton>
						</div>
					</div>

					<footer className="fmc-help">
						Keyboard: A–Z, 0–9, Space, /, ., Backspace, Delete, Enter
					</footer>
				</section>
			</div>
		</main>
	);
}
