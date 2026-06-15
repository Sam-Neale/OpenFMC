import { FmcUnit } from "./fmc/FmcUnit";
import { AutopilotPanel } from "./AutopilotPanel";

export default function App() {
	if (window.location.hash === "#/autopilot") {
		return <AutopilotPanel />;
	}

	return <FmcUnit />;
}
