/**
 * dsh-token-cost — host half.
 *
 * Registers the `tokenCost` session projection: every recorded model request is
 * priced at the moment it happened (peak/off-peak band from its own timestamp)
 * against the model that actually served it, then folded into a running total
 * that the client composer dock can read with `useProjection("tokenCost")`.
 *
 * Why per event instead of pricing the aggregate `tokenUsage` buckets on the
 * client: the price list has two bands that differ by 2x, and a session can
 * span both, so summing tokens and multiplying once would be off by up to 2x.
 */

import { OFF_DAYS } from "./holidays.js";

/** Host service this half needs: the session projection registry. */
export const inject = ["sessionProjections"];

/** Statutory holidays: always off-peak, whatever the weekday. */
const OFF_DAY_SET = new Set(OFF_DAYS);

/** Money is folded as integer micro-yuan so repeated add/replace stays exact. */
const MICROS_PER_YUAN = 1e6;

/**
 * Official price list, yuan per one million tokens.
 * Source: https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * Snapshot: 2026-10-17. Peak band = Beijing time, Monday to Friday,
 * 09:00-12:00 and 14:00-18:00; every other moment uses the off-peak band,
 * which is exactly half of the peak band.
 */
const PRICE_TABLE = Object.freeze({
	"deepseek-flash": Object.freeze({
		label: "DeepSeek-V4.1-Flash-1017",
		peak: Object.freeze({ miss: 2, hit: 0.04, write: 2, output: 8 }),
		offpeak: Object.freeze({ miss: 1, hit: 0.02, write: 1, output: 4 }),
	}),
	"deepseek-v4-pro": Object.freeze({
		label: "DeepSeek-V4-Pro-0813",
		peak: Object.freeze({ miss: 9, hit: 0.3, write: 9, output: 27 }),
		offpeak: Object.freeze({ miss: 4.5, hit: 0.15, write: 4.5, output: 13.5 }),
	}),
});

/** Tokens billed into the four buckets of one request. */
function bucketsOf(usage) {
	return {
		missTokens: positive(usage?.inputTokens),
		hitTokens: positive(usage?.cacheReadTokens),
		writeTokens: positive(usage?.cacheWriteTokens),
		outTokens: positive(usage?.outputTokens),
	};
}

/** Clamp a possibly missing token count to a non-negative number. */
function positive(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Beijing wall clock (weekday, minute of day, ISO date) for an epoch-ms instant. */
function beijingClock(time) {
	const shifted = new Date((typeof time === "number" && Number.isFinite(time) ? time : Date.now()) + 8 * 3_600_000);
	return {
		weekday: shifted.getUTCDay(),
		minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
		date: shifted.toISOString().slice(0, 10),
	};
}

/**
 * Whether an instant falls into the peak price band.
 *
 * Peak = Beijing time, Monday to Friday, 09:00-12:00 and 14:00-18:00, and the
 * date is not a statutory holiday. Statutory holidays come from holidays.js,
 * so a holiday Monday is priced off-peak (the opposite of the behaviour before
 * the calendar existed, which over-estimated by up to 2x). Dates outside the
 * calendar's coverage fall back to the plain weekday rule.
 *
 * Make-up workdays (调休补班日) are deliberately not treated as peak even when
 * they fall on a weekend: the official price-list wording only makes Monday to
 * Friday peak, so a Sunday make-up workday stays off-peak.
 */
export function isPeakTime(time) {
	const { weekday, minute, date } = beijingClock(time);
	if (OFF_DAY_SET.has(date)) return false;
	if (weekday < 1 || weekday > 5) return false;
	return (minute >= 540 && minute < 720) || (minute >= 840 && minute < 1080);
}

/** The years the statutory holiday calendar covers, for the dialog footnote. */
export function holidayCoverage() {
	const years = [...new Set(OFF_DAYS.map((date) => date.slice(0, 4)))].sort();
	if (years.length === 0) return "";
	return years.length === 1 ? years[0] : `${years[0]}-${years[years.length - 1]}`;
}

/** The model name that actually served a recorded assistant message, if any. */
export function modelOfMessage(message) {
	const source = message?.source;
	if (typeof source?.model === "string" && source.model !== "") return source.model;
	const replayed = source?.replayState?.response?.model;
	if (typeof replayed === "string" && replayed !== "") return replayed;
	return undefined;
}

/** One billed request: shape of the value folded into totals and per-model sums. */
function contributionOf(usage, model, time) {
	const buckets = bucketsOf(usage);
	const band = isPeakTime(time);
	const prices = PRICE_TABLE[model]?.[band ? "peak" : "offpeak"];
	const costMicros =
		prices === undefined
			? 0
			: Math.round(
					buckets.missTokens * prices.miss +
						buckets.hitTokens * prices.hit +
						buckets.writeTokens * prices.write +
						buckets.outTokens * prices.output,
				);
	return {
		model,
		band,
		priced: prices !== undefined,
		costMicros,
		...buckets,
	};
}

/** Zero total of one aggregate. */
function zeroTotals() {
	return {
		costMicros: 0,
		peakMicros: 0,
		offpeakMicros: 0,
		requests: 0,
		unpricedRequests: 0,
		missTokens: 0,
		hitTokens: 0,
		writeTokens: 0,
		outTokens: 0,
	};
}

/** Add one contribution into a total. */
function addContribution(total, contribution) {
	return {
		costMicros: total.costMicros + contribution.costMicros,
		peakMicros: total.peakMicros + (contribution.band ? contribution.costMicros : 0),
		offpeakMicros: total.offpeakMicros + (contribution.band ? 0 : contribution.costMicros),
		requests: total.requests + 1,
		unpricedRequests: total.unpricedRequests + (contribution.priced ? 0 : 1),
		missTokens: total.missTokens + contribution.missTokens,
		hitTokens: total.hitTokens + contribution.hitTokens,
		writeTokens: total.writeTokens + contribution.writeTokens,
		outTokens: total.outTokens + contribution.outTokens,
	};
}

/** Subtract one contribution from a total (used when an attempt is replaced). */
function removeContribution(total, contribution) {
	const clamp = (value) => Math.max(0, value);
	return {
		costMicros: clamp(total.costMicros - contribution.costMicros),
		peakMicros: clamp(total.peakMicros - (contribution.band ? contribution.costMicros : 0)),
		offpeakMicros: clamp(total.offpeakMicros - (contribution.band ? 0 : contribution.costMicros)),
		requests: clamp(total.requests - 1),
		unpricedRequests: clamp(total.unpricedRequests - (contribution.priced ? 0 : 1)),
		missTokens: clamp(total.missTokens - contribution.missTokens),
		hitTokens: clamp(total.hitTokens - contribution.hitTokens),
		writeTokens: clamp(total.writeTokens - contribution.writeTokens),
		outTokens: clamp(total.outTokens - contribution.outTokens),
	};
}

/** Add one contribution into the per-model map (keys are model names). */
function addModel(models, contribution) {
	const key = contribution.model ?? "unknown";
	const current = models[key] ?? zeroTotals();
	return { ...models, [key]: addContribution(current, contribution) };
}

/** Subtract one contribution from the per-model map, dropping emptied entries. */
function removeModel(models, contribution) {
	const key = contribution.model ?? "unknown";
	const current = models[key];
	if (current === undefined) return models;
	const next = removeContribution(current, contribution);
	if (next.requests === 0 && next.costMicros === 0) {
		const rest = { ...models };
		delete rest[key];
		return rest;
	}
	return { ...models, [key]: next };
}

/** Whether a replacement sample is identical to the folded one (avoids identity churn). */
function sameContribution(left, right) {
	return (
		left.model === right.model &&
		left.band === right.band &&
		left.priced === right.priced &&
		left.costMicros === right.costMicros &&
		left.missTokens === right.missTokens &&
		left.hitTokens === right.hitTokens &&
		left.writeTokens === right.writeTokens &&
		left.outTokens === right.outTokens
	);
}

/**
 * The usage sample carried by a billed event, or undefined when the event
 * bills nothing. `assistant/message` is authoritative; `assistant/attempt`
 * only counts when it carries a final usage object.
 */
function usageOfEvent(event) {
	if (event?.type !== "assistant/message" && event?.type !== "assistant/attempt") return undefined;
	const data = event.data;
	const usage = data?.usage;
	if (usage === undefined || usage === null || typeof usage !== "object") return undefined;
	return { turn: data.turn, step: data.step, usage };
}

/** Reduce any decoded checkpoint value to a shape this projection can continue from. */
function normalizeState(value) {
	const totals = value?.totals;
	const base = totals !== undefined && totals !== null && typeof totals === "object" ? totals : {};
	const models = value?.models !== undefined && value?.models !== null && typeof value.models === "object" ? value.models : {};
	const last = value?.last;
	return {
		totals: { ...zeroTotals(), ...pickNumbers(base, zeroTotals()) },
		models: Object.fromEntries(
			Object.entries(models).map(([key, entry]) => [key, { ...zeroTotals(), ...pickNumbers(entry, zeroTotals()) }]),
		),
		lastModel: typeof value?.lastModel === "string" ? value.lastModel : null,
		last:
			last !== undefined && last !== null && typeof last.turn === "number" && typeof last.step === "number" && last.contribution !== undefined
				? { turn: last.turn, step: last.step, contribution: last.contribution }
				: null,
	};
}

/** Copy only the numeric fields that exist in the target shape. */
function pickNumbers(source, shape) {
	return Object.fromEntries(
		Object.keys(shape).map((key) => [key, typeof source[key] === "number" && Number.isFinite(source[key]) && source[key] > 0 ? source[key] : 0]),
	);
}

/**
 * Pure fold: one event in, next state out. Identical samples return the same
 * state reference so the registry does not broadcast an unchanged value.
 */
export function foldTokenCost(state, event) {
	if (event?.type === "llm/retry-started") {
		const last = state.last;
		if (last !== null && last.turn === event.data?.turn && last.step === event.data?.step) return { ...state, last: null };
		return state;
	}
	const sample = usageOfEvent(event);
	if (sample === undefined) {
		const model = modelOfMessage(event?.data?.message);
		if (model !== undefined && model !== state.lastModel) return { ...state, lastModel: model };
		return state;
	}
	const model = modelOfMessage(event.data?.message) ?? state.lastModel ?? null;
	const contribution = contributionOf(sample.usage, model, event.time);
	const last = state.last;
	const replacing = last !== null && last.turn === sample.turn && last.step === sample.step;
	if (replacing && sameContribution(last.contribution, contribution)) {
		return model === state.lastModel ? state : { ...state, lastModel: model };
	}
	const totals = addContribution(replacing ? removeContribution(state.totals, last.contribution) : state.totals, contribution);
	const models = addModel(replacing ? removeModel(state.models, last.contribution) : state.models, contribution);
	return {
		totals,
		models,
		lastModel: model,
		last: { turn: sample.turn, step: sample.step, contribution },
	};
}

/** Projection view handed to the client: totals plus the per-model breakdown. */
export function viewTokenCost(state) {
	return {
		costMicros: state.totals.costMicros,
		peakMicros: state.totals.peakMicros,
		offpeakMicros: state.totals.offpeakMicros,
		requests: state.totals.requests,
		unpricedRequests: state.totals.unpricedRequests,
		missTokens: state.totals.missTokens,
		hitTokens: state.totals.hitTokens,
		writeTokens: state.totals.writeTokens,
		outTokens: state.totals.outTokens,
		model: state.lastModel,
		holidayCoverage: holidayCoverage(),
		models: Object.entries(state.models)
			.map(([name, total]) => ({
				name,
				requests: total.requests,
				costMicros: total.costMicros,
				missTokens: total.missTokens,
				hitTokens: total.hitTokens,
				writeTokens: total.writeTokens,
				outTokens: total.outTokens,
			}))
			.sort((left, right) => right.costMicros - left.costMicros),
	};
}

/**
 * The `tokenCost` projection definition.
 */
export const tokenCostProjectionDefinition = {
	key: "tokenCost",
	/*
	 * 2 = statutory-holiday aware peak detection. Bumping the version makes the
	 * host discard version-1 checkpoint rows and re-fold every session from its
	 * log, so sessions priced under the old weekday-only rule are corrected
	 * instead of keeping an over-estimate forever.
	 */
	stateVersion: 2,
	stateSchema: {
		parse(value) {
			return normalizeState(value);
		},
	},
	init() {
		return { totals: zeroTotals(), models: {}, lastModel: null, last: null };
	},
	apply(state, event) {
		return foldTokenCost(state, event);
	},
	wire: {
		viewSchema: {
			parse(value) {
				return value;
			},
		},
		view: viewTokenCost,
	},
};

/**
 * Register the projection; the registry unregisters it when this plugin unloads.
 */
export function apply(ctx) {
	ctx.sessionProjections.register(tokenCostProjectionDefinition);
}
