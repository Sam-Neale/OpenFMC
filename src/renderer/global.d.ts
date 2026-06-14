import type { NavigationDatabaseInfo, FmcState } from "./fmc/types";

declare global {
	interface Window {
		openFmc: {
			navData: {
				inspect(): Promise<NavigationDatabaseInfo>;
			};
			aircraft: {
				list(): Promise<AircraftDefinition[]>;
				refresh(): Promise<AircraftDefinition[]>;
			};
		};
		readonly fmcState: Readonly<FmcState>;
	}
}

export {};
