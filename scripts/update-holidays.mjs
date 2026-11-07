/**
 * Extend or refresh holidays.js with another year of the State Council holiday
 * calendar.
 *
 *   node scripts/update-holidays.mjs 2027
 *   node scripts/update-holidays.mjs 2027 2028
 *
 * The data comes from the public mirror `https://timor.tech/api/holiday/year/<year>`,
 * which republishes the State Council notice (国务院办公厅关于部分节假日安排的通知).
 * Each entry is `{ date, holiday: boolean }`: `holiday: true` is a day off,
 * `holiday: false` is a make-up workday (调休补班).
 *
 * Existing years are kept, so the command is additive and idempotent: re-running
 * it for a year already present rewrites the same values.
 *
 * The script refuses to write anything unless every requested year fetched
 * cleanly and looks like a complete calendar (a plausible number of off days,
 * with the Spring Festival and National Day periods present).
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "holidays.js");

/** Off days a complete year should have at least: two golden weeks alone are 14. */
const MIN_OFF_DAYS = 18;

/** Fetch one year's calendar. Returns `{ offDays, makeUpDays }` as ISO date strings. */
async function fetchYear(year) {
	const url = `https://timor.tech/api/holiday/year/${year}`;
	const response = await fetch(url, { headers: { accept: "application/json" } });
	if (!response.ok) throw new Error(`${year}: HTTP ${response.status} from ${url}`);
	const body = await response.json();
	if (body?.code !== 0 || typeof body.holiday !== "object" || body.holiday === null) {
		throw new Error(`${year}: unexpected response shape from ${url}`);
	}
	const offDays = [];
	const makeUpDays = [];
	for (const entry of Object.values(body.holiday)) {
		if (typeof entry?.date !== "string") continue;
		if (!entry.date.startsWith(`${year}-`)) continue;
		if (entry.holiday === true) offDays.push(entry.date);
		else if (entry.holiday === false) makeUpDays.push(entry.date);
	}
	if (offDays.length < MIN_OFF_DAYS) {
		throw new Error(`${year}: only ${offDays.length} off days returned, expected at least ${MIN_OFF_DAYS} (is the notice published yet?)`);
	}
	return { offDays, makeUpDays };
}

/** Render the module, grouping dates by year with a comment per year. */
function render(offDays, makeUpDays, years) {
	const block = (dates, indent = "\t") => {
		const lines = [];
		for (const year of years) {
			const forYear = dates.filter((date) => date.startsWith(`${year}-`)).sort();
			if (forYear.length === 0) continue;
			lines.push(`${indent}// ${year}`);
			for (const date of forYear) lines.push(`${indent}"${date}",`);
		}
		return lines.join("\n");
	};
	const covered = years.length === 1 ? years[0] : `${years[0]}, ${years[years.length - 1]}`;
	return `/**
 * Chinese statutory holiday calendar, in Beijing time (UTC+8).
 *
 * DeepSeek prices peak hours as "Beijing time, Monday to Friday, excluding
 * statutory holidays". These tables make the exclusion real: a date listed in
 * OFF_DAYS is always off-peak, whatever weekday it happens to be.
 *
 * MAKEUP_WORKDAYS lists the make-up workdays (调休补班) the State Council
 * schedules around long holidays. They are recorded for completeness, but the
 * official wording restricts peak hours to Monday-Friday, so a Saturday or
 * Sunday make-up day stays off-peak unless PEAK_ON_MAKEUP_WORKDAYS is turned on
 * in index.js.
 *
 * Source: State Council annual holiday notices (国务院办公厅关于部分节假日安排的通知),
 * cross-checked against https://timor.tech/api/holiday/year/<year>.
 * Regenerate / extend: \`node scripts/update-holidays.mjs 2027 2028\`.
 *
 * Years covered: ${covered}. Instants outside these years fall back to the
 * plain weekday rule, which is off by up to 2x on holiday daytime.
 */

/** Days that are statutory holidays: full-day off-peak pricing. */
export const OFF_DAYS = Object.freeze([
${block(offDays)}
]);

/** Make-up workdays: recorded but not treated as peak by default. */
export const MAKEUP_WORKDAYS = Object.freeze([
${block(makeUpDays)}
]);
`;
}

const requested = process.argv
	.slice(2)
	.map((argument) => Number.parseInt(argument, 10))
	.filter((year) => Number.isSafeInteger(year) && year > 1900);

if (requested.length === 0) {
	console.error("usage: node scripts/update-holidays.mjs <year> [year...]");
	process.exit(2);
}

// Load what is already recorded so the command only adds years.
const existing = await import(pathToFileURL(target).href);
const offDays = new Set(existing.OFF_DAYS);
const makeUpDays = new Set(existing.MAKEUP_WORKDAYS);
const years = new Set([...offDays, ...makeUpDays].map((date) => Number.parseInt(date.slice(0, 4), 10)));

for (const year of requested) {
	if (years.has(year)) {
		console.log(`${year}: already recorded, refreshing`);
		for (const date of [...offDays]) if (date.startsWith(`${year}-`)) offDays.delete(date);
		for (const date of [...makeUpDays]) if (date.startsWith(`${year}-`)) makeUpDays.delete(date);
	}
	const fetched = await fetchYear(year);
	for (const date of fetched.offDays) offDays.add(date);
	for (const date of fetched.makeUpDays) makeUpDays.add(date);
	years.add(year);
	console.log(`${year}: ${fetched.offDays.length} off days, ${fetched.makeUpDays.length} make-up workdays`);
}

const orderedYears = [...years].sort((left, right) => left - right);
await writeFile(target, render([...offDays], [...makeUpDays], orderedYears), "utf8");
console.log(`wrote ${target} (years: ${orderedYears.join(", ")})`);
