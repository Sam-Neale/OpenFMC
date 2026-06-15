import type { ConnectionManifest, StateValue } from "ifc-node";

export const connectApiService = {
	async connect(): Promise<ConnectionManifest> {
		console.log("Connecting to Infinite Flight ConnectAPI...");

		return window.openFmc.connectApi.connect();
	},

	async disconnect(): Promise<void> {
		console.log("Disconnecting from Infinite Flight ConnectAPI...");

		await window.openFmc.connectApi.disconnect();
	},

	async get(pathName: string): Promise<StateValue | null> {
		return window.openFmc.connectApi.get(pathName);
	},

	async set(pathName: string, value: StateValue): Promise<void> {
		await window.openFmc.connectApi.set(pathName, value);
	},

	async command(commandName: string): Promise<void> {
		await window.openFmc.connectApi.command(commandName);
	},
};
