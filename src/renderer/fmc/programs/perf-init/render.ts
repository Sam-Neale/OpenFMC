import type { FmcScreenModel, FmcState } from "../../types";

type ProgramScreen = Omit<FmcScreenModel, "scratchpad" | "execLight">;

export function renderPerfInit(state: Readonly<FmcState>): ProgramScreen {
	return {
		title: "PERF INIT",
		page: "1/1",

		slots: [
			{
				labelLeft: "GR WT",
				labelRight: "CRZ ALT",
				valueLeft: "244.1",
				valueRight: "FL310",
			},
			{
				labelLeft: "FUEL",
				labelRight: "COST INDEX",
				valueLeft: "23.6KG CALC",
				valueRight: "80",
			},
			{
				labelLeft: "ZFW",
				labelRight: "MIN FUEL TEMP",
				valueLeft: "220.5",
				valueRight: "-37°C",
			},
			{
				labelLeft: "RESERVES",
				labelRight: "CRZ CG",
				valueLeft: "10.0",
				valueRight: "7.5%",
			},
			{
				labelLeft: "PERF INIT",
				labelRight: "STEP SIZE",
				valueLeft: "<REQUEST",
				valueRight: "RVSM",
			},
			{
				valueLeft: "<INDEX",
				valueRight: "THRUST LIM>",
			},
		],
	};
}
