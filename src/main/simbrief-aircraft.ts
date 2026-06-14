import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AircraftDefinition } from "../renderer/fmc/types";

const SIMBRIEF_AIRCRAFT_URL = "https://www.simbrief.com/api/inputs.list.json";

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SimBriefAircraftEntry {
	id?: unknown;
	name?: unknown;
}

interface SimBriefInputsResponse {
	aircraft?: Record<string, SimBriefAircraftEntry>;
}

interface AircraftCache {
	fetchedAt: string;
	aircraft: AircraftDefinition[];
}

function getCachePath(): string {
	return path.join(app.getPath("userData"), "cache", "simbrief-aircraft.json");
}

function parseAircraftResponse(value: unknown): AircraftDefinition[] {
	if (typeof value !== "object" || value === null) {
		throw new Error("Invalid SimBrief response");
	}

	const response = value as SimBriefInputsResponse;

	if (typeof response.aircraft !== "object" || response.aircraft === null) {
		throw new Error("SimBrief response contains no aircraft list");
	}

	const aircraft = Object.entries(response.aircraft)
		.map(([key, entry]) => {
			const id = typeof entry.id === "string" ? entry.id.trim() : key.trim();

			const name = typeof entry.name === "string" ? entry.name.trim() : "";

			if (!id || !name) {
				return null;
			}

			return {
				id,
				name,
			};
		})
		.filter((entry): entry is AircraftDefinition => entry !== null);

	if (aircraft.length === 0) {
		throw new Error("SimBrief aircraft list was empty");
	}

	return aircraft.sort((a, b) => a.name.localeCompare(b.name));
}

async function readCache(): Promise<AircraftCache | null> {
	try {
		const contents = await readFile(getCachePath(), "utf8");

		const parsed = JSON.parse(contents) as AircraftCache;

		if (
			!Array.isArray(parsed.aircraft) ||
			typeof parsed.fetchedAt !== "string"
		) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

async function writeCache(aircraft: AircraftDefinition[]): Promise<void> {
	const cachePath = getCachePath();

	await mkdir(path.dirname(cachePath), { recursive: true });

	const cache: AircraftCache = {
		fetchedAt: new Date().toISOString(),
		aircraft,
	};

	await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

function isCacheFresh(cache: AircraftCache): boolean {
	const fetchedAt = Date.parse(cache.fetchedAt);

	if (!Number.isFinite(fetchedAt)) {
		return false;
	}

	return Date.now() - fetchedAt < CACHE_MAX_AGE_MS;
}

async function fetchAircraftFromSimBrief(): Promise<AircraftDefinition[]> {
	const response = await fetch(SIMBRIEF_AIRCRAFT_URL, {
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`SimBrief returned HTTP ${response.status}`);
	}

	const body: unknown = await response.json();

	return parseAircraftResponse(body);
}

export async function getSimBriefAircraft(
	forceRefresh = false,
): Promise<AircraftDefinition[]> {
	const cache = await readCache();

	if (!forceRefresh && cache && isCacheFresh(cache)) {
		return cache.aircraft;
	}

	try {
		const aircraft = await fetchAircraftFromSimBrief();

		await writeCache(aircraft);

		return aircraft;
	} catch (error) {
		if (cache?.aircraft.length) {
			return cache.aircraft;
		}

		throw error;
	}
}
