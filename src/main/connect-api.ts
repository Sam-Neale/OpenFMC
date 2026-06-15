import { IFCClient } from "ifc-node";
import type { ConnectionManifest, StateValue } from "ifc-node";

let client: IFCClient | null = null;

function getClient(): IFCClient {
	if (!client) {
		client = new IFCClient();
	}

	return client;
}

export async function connectToInfiniteFlight(): Promise<ConnectionManifest> {
	return getClient().connect();
}

export async function disconnectFromInfiniteFlight(): Promise<void> {
	if (!client) {
		return;
	}

	await client.disconnect();
	client = null;
}

export async function getInfiniteFlightState(
	path: string,
): Promise<StateValue | null> {
	try {
		return await getClient().get(path);
	} catch (error) {
		if (
			error instanceof Error &&
			(error.name === "NotConnectedError" ||
				error.message.includes("not connected to Infinite Flight"))
		) {
			return null;
		}

		throw error;
	}
}

export async function setInfiniteFlightState(
	path: string,
	value: StateValue,
): Promise<void> {
	await getClient().set(path, value);
}

export async function runInfiniteFlightCommand(command: string): Promise<void> {
	await getClient().command(command);
}
