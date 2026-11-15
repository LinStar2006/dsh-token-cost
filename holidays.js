/**
 * Chinese statutory holiday calendar, in Beijing time (UTC+8).
 *
 * DeepSeek prices peak hours as "Beijing time, Monday to Friday, excluding
 * statutory holidays". These tables make the exclusion real: a date listed in
 * OFF_DAYS is always off-peak, whatever weekday it happens to be.
 *
 * MAKEUP_WORKDAYS lists the make-up workdays (调休补班) the State Council
 * schedules around long holidays. They are recorded for completeness only: the
 * official wording restricts peak hours to Monday-Friday, so a Saturday or
 * Sunday make-up day stays off-peak, and index.js does not read these dates.
 *
 * Source: State Council annual holiday notices (国务院办公厅关于部分节假日安排的通知),
 * cross-checked against https://timor.tech/api/holiday/year/<year>.
 * Regenerate / extend: `node scripts/update-holidays.mjs 2028`.
 *
 * Years covered: 2025-2027. Instants outside these years fall back to the
 * plain weekday rule, which is off by up to 2x on holiday daytime.
 */

/** Days that are statutory holidays: full-day off-peak pricing. */
export const OFF_DAYS = Object.freeze([
	// 2025
	"2025-01-01",
	"2025-01-28",
	"2025-01-29",
	"2025-01-30",
	"2025-01-31",
	"2025-02-01",
	"2025-02-02",
	"2025-02-03",
	"2025-02-04",
	"2025-04-04",
	"2025-04-05",
	"2025-04-06",
	"2025-05-01",
	"2025-05-02",
	"2025-05-03",
	"2025-05-04",
	"2025-05-05",
	"2025-05-31",
	"2025-06-01",
	"2025-06-02",
	"2025-10-01",
	"2025-10-02",
	"2025-10-03",
	"2025-10-04",
	"2025-10-05",
	"2025-10-06",
	"2025-10-07",
	"2025-10-08",
	// 2026
	"2026-01-01",
	"2026-01-02",
	"2026-01-03",
	"2026-02-15",
	"2026-02-16",
	"2026-02-17",
	"2026-02-18",
	"2026-02-19",
	"2026-02-20",
	"2026-02-21",
	"2026-02-22",
	"2026-02-23",
	"2026-04-04",
	"2026-04-05",
	"2026-04-06",
	"2026-05-01",
	"2026-05-02",
	"2026-05-03",
	"2026-05-04",
	"2026-05-05",
	"2026-06-19",
	"2026-06-20",
	"2026-06-21",
	"2026-09-25",
	"2026-09-26",
	"2026-09-27",
	"2026-10-01",
	"2026-10-02",
	"2026-10-03",
	"2026-10-04",
	"2026-10-05",
	"2026-10-06",
	"2026-10-07",
	// 2027
	"2027-01-01",
	"2027-01-02",
	"2027-01-03",
	"2027-02-05",
	"2027-02-06",
	"2027-02-07",
	"2027-02-08",
	"2027-02-09",
	"2027-02-10",
	"2027-02-11",
	"2027-02-12",
	"2027-02-13",
	"2027-04-03",
	"2027-04-04",
	"2027-04-05",
	"2027-05-01",
	"2027-05-02",
	"2027-05-03",
	"2027-05-04",
	"2027-05-05",
	"2027-06-09",
	"2027-09-15",
	"2027-10-01",
	"2027-10-02",
	"2027-10-03",
	"2027-10-04",
	"2027-10-05",
	"2027-10-06",
	"2027-10-07",
]);

/** Make-up workdays: recorded but not treated as peak by default. */
export const MAKEUP_WORKDAYS = Object.freeze([
	// 2025
	"2025-01-26",
	"2025-02-08",
	"2025-04-27",
	"2025-09-28",
	"2025-10-11",
	// 2026
	"2026-01-04",
	"2026-02-14",
	"2026-02-28",
	"2026-05-09",
	"2026-09-20",
	"2026-10-10",
	// 2027
	"2027-01-31",
	"2027-02-14",
	"2027-05-08",
	"2027-09-26",
	"2027-10-09",
]);
