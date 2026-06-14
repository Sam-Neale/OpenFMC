import { app } from "electron";
import { DatabaseSync } from "node:sqlite";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { NavigationDatabaseInfo } from "../renderer/fmc/types";

interface CycleFile {
	cycle: string;
	revision: string;
	name: string;
}

export function getNavigationDataDirectory(): string {
	return path.join(app.getPath("home"), "openFMC-navdata");
}

function isCycleFile(value: unknown): value is CycleFile {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;

	return (
		typeof candidate.cycle === "string" &&
		/^\d{4}$/.test(candidate.cycle) &&
		typeof candidate.revision === "string" &&
		candidate.revision.trim().length > 0 &&
		typeof candidate.name === "string" &&
		candidate.name.trim().length > 0
	);
}

async function readCycleFile(filePath: string): Promise<CycleFile | null> {
	try {
		const contents = await readFile(filePath, "utf8");
		const parsed: unknown = JSON.parse(contents);

		return isCycleFile(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function checkSqliteIntegrity(databasePath: string): {
	intact: boolean;
	error?: string;
} {
	let database: DatabaseSync | null = null;

	try {
		database = new DatabaseSync(databasePath, {
			readOnly: true,
			open: true,
		});

		const result = database.prepare("PRAGMA quick_check").all() as Array<
			Record<string, unknown>
		>;

		const messages = result.flatMap((row) => Object.values(row).map(String));

		const intact =
			messages.length > 0 &&
			messages.every((message) => message.toLowerCase() === "ok");

		if (!intact) {
			return {
				intact: false,
				error: messages.join("; ") || "SQLite quick_check failed",
			};
		}

		return {
			intact: true,
		};
	} catch (error) {
		return {
			intact: false,
			error:
				error instanceof Error
					? error.message
					: "Unable to open navigation database",
		};
	} finally {
		database?.close();
	}
}

export async function inspectNavigationDatabase(): Promise<NavigationDatabaseInfo> {
	const directory = getNavigationDataDirectory();

	const cyclePath = path.join(directory, "cycle.json");

	const databasePath = path.join(directory, "navdb.s3db");

	const cycle = await readCycleFile(cyclePath);

	if (!cycle) {
		return {
			cycle: null,
			revision: null,
			name: null,
			status: "INVALID_CYCLE",
			error: "cycle.json is missing or invalid",
		};
	}

	try {
		const databaseStats = await stat(databasePath);

		if (!databaseStats.isFile() || databaseStats.size === 0) {
			return {
				cycle: cycle.cycle,
				revision: cycle.revision,
				name: cycle.name,
				status: "MISSING_DATABASE",
				error: "navdb.s3db is missing or empty",
			};
		}
	} catch {
		return {
			cycle: cycle.cycle,
			revision: cycle.revision,
			name: cycle.name,
			status: "MISSING_DATABASE",
			error: "navdb.s3db was not found",
		};
	}

	const integrity = checkSqliteIntegrity(databasePath);

	if (!integrity.intact) {
		return {
			cycle: cycle.cycle,
			revision: cycle.revision,
			name: cycle.name,
			status: "CORRUPT",
			error: integrity.error,
		};
	}

	return {
		cycle: cycle.cycle,
		revision: cycle.revision,
		name: cycle.name,
		status: "INTACT",
	};
}
