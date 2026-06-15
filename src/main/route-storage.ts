import { app } from "electron";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { RoutePlanState } from "../renderer/fmc/types";

interface SavedRouteFile {
	name: string;
	createdAt: string;
	route: RoutePlanState;
}

export interface LoadRouteResult {
	status: "LOADED" | "NOT_FOUND" | "DUPLICATE";
	route?: RoutePlanState;
	matches?: string[];
}

function getRouteStorageDirectory(): string {
	return path.join(app.getPath("userData"), "routes");
}

function normalizeRouteName(name: string): string {
	return name.trim().toUpperCase();
}

function sanitizeRouteName(name: string): string {
	return normalizeRouteName(name).replace(/[^A-Z0-9_-]+/g, "_").slice(0, 40);
}

async function readSavedRoute(filename: string): Promise<SavedRouteFile | null> {
	try {
		const contents = await readFile(
			path.join(getRouteStorageDirectory(), filename),
			"utf8",
		);
		const parsed = JSON.parse(contents) as SavedRouteFile;

		if (!parsed.name || !parsed.route) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

export async function saveRoute(
	name: string,
	route: RoutePlanState,
): Promise<string> {
	const normalizedName = normalizeRouteName(name);

	if (!normalizedName) {
		throw new Error("Route name is required");
	}

	await mkdir(getRouteStorageDirectory(), { recursive: true });

	const createdAt = new Date().toISOString();
	const filename = `${sanitizeRouteName(normalizedName)}.json`;
	const savedRoute: SavedRouteFile = {
		name: normalizedName,
		createdAt,
		route: {
			...route,
			routeRequest: normalizedName,
			isActive: false,
		},
	};

	await writeFile(
		path.join(getRouteStorageDirectory(), filename),
		JSON.stringify(savedRoute, null, 2),
		"utf8",
	);

	return filename;
}

export async function loadRoute(name: string): Promise<LoadRouteResult> {
	const normalizedName = normalizeRouteName(name);

	if (!normalizedName) {
		return { status: "NOT_FOUND" };
	}

	await mkdir(getRouteStorageDirectory(), { recursive: true });

	const files = (await readdir(getRouteStorageDirectory())).filter((filename) =>
		filename.endsWith(".json"),
	);
	const routes = (
		await Promise.all(files.map((filename) => readSavedRoute(filename)))
	).filter((route): route is SavedRouteFile => Boolean(route));
	const matches = routes.filter(
		(route) => normalizeRouteName(route.name) === normalizedName,
	);

	if (matches.length === 0) {
		return { status: "NOT_FOUND" };
	}

	if (matches.length > 1) {
		return {
			status: "DUPLICATE",
			matches: matches.map((route) => route.createdAt),
		};
	}

	return {
		status: "LOADED",
		route: {
			...matches[0].route,
			routeRequest: normalizedName,
			isActive: false,
		},
	};
}
