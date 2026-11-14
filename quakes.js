// Recent earthquakes for the glass Earth (lookupanddown.com): the US Geological Survey's public
// list, checked and trimmed, and how long an earthquake's waves take to reach a place.
//
// No DOM, so it runs under Node (ReferenceFiles/lookupanddown/quake-test.mjs).
//
// The list is the USGS's "magnitude 4.5 and above, past 7 days" summary feed (GeoJSON, public
// domain, sent with Access-Control-Allow-Origin: *). 4.5 is about the size from which the USGS
// catalogue covers the whole world evenly; smaller ones are listed mostly for the United States.
// Nothing in the feed is trusted: every number is range-checked, the place name is stripped of
// control and text-direction characters and capped, and the page only ever writes it as text.
//
// Wave times come from quake-times.js: the first P-type arrival (P, the diffracted P that creeps
// round the core, or the core phases PKP and PKIKP) and the direct S wave, by distance and depth,
// from the ak135 model of the Earth. Past about 104° of arc there is no direct S wave: S waves
// cannot cross the liquid outer core.
import { DEPTHS, STEP, P, S } from './quake-times.js';

export const FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson';
export const WEEK = 7 * 86400000;
export const MAX = 600;
const DEG = Math.PI / 180;

const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

// The feed as a list of { id, mag, lat, lon, depth (km), time (ms), place }, strongest first.
// Anything that isn't an earthquake (quarry blasts, explosions), or has a number missing or out of
// range, is left out; so is anything dated more than a few minutes ahead or more than 8 days back.
export function parseFeed(json, now = Date.now(), max = MAX) {
	if (!json || !Array.isArray(json.features)) throw new Error('not an earthquake list');
	const out = [], seen = new Set();
	for (const f of json.features) {
		const p = f && f.properties, c = f && f.geometry && f.geometry.coordinates;
		if (!p || !Array.isArray(c) || (p.type !== undefined && p.type !== 'earthquake')) continue;
		const mag = num(p.mag), lon = num(c[0]), lat = num(c[1]), time = num(p.time);
		let depth = num(c[2]);
		if (!(mag >= 0 && mag <= 10) || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180) || Number.isNaN(time)) continue;
		if (time > now + 300000 || time < now - WEEK - 86400000) continue;
		if (Number.isNaN(depth)) depth = 0; // (a few have none: drawn at the surface)
		const id = clean(f.id === undefined ? `${time},${lat},${lon}` : f.id).slice(0, 40);
		if (seen.has(id)) continue;
		seen.add(id);
		out.push({ id, mag, lat, lon, depth: Math.min(800, Math.max(0, depth)), time, place: clean(p.place || '').slice(0, 80) || 'Place not named' });
	}
	out.sort((a, b) => b.mag - a.mag || b.time - a.time);
	return out.slice(0, max);
}

// Degrees of arc between two places.
export function arcDeg(lat1, lon1, lat2, lon2) {
	const f1 = lat1 * DEG, f2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
	const a = Math.sin((f2 - f1) / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
	return 2 * Math.asin(Math.min(1, Math.sqrt(a))) / DEG;
}

// One row of a table (seconds × 10, −1 where there is no such wave) at a distance, or null.
function along(row, dist) {
	const x = Math.min(Math.max(dist, 0), 180) / STEP, i = Math.min(Math.floor(x), row.length - 2), f = x - i;
	const a = row[i], b = row[i + 1];
	if (a < 0 && b < 0) return null;
	if (a < 0) return f > 0.5 ? b / 10 : null;
	if (b < 0) return f <= 0.5 ? a / 10 : null;
	return (a + (b - a) * f) / 10;
}
function lookup(table, dist, depth) {
	const d = Math.min(Math.max(depth, DEPTHS[0]), DEPTHS[DEPTHS.length - 1]);
	let j = 0;
	while (j < DEPTHS.length - 2 && d > DEPTHS[j + 1]) j++;
	const g = (d - DEPTHS[j]) / (DEPTHS[j + 1] - DEPTHS[j]);
	const a = along(table[j], dist), b = along(table[j + 1], dist);
	if (a === null && b === null) return null;
	if (a === null) return g > 0.5 ? b : null;
	if (b === null) return g <= 0.5 ? a : null;
	return a + (b - a) * g;
}
// Seconds for an earthquake's waves to reach a place distDeg of arc away, from depthKm down:
// { p: the first waves, s: the S waves, or null where the outer core stops them }.
export function travel(distDeg, depthKm) {
	return { p: lookup(P, distDeg, depthKm), s: lookup(S, distDeg, depthKm) };
}

// "12 min 5 s", to the nearest 5 seconds (the model is good to a few seconds, no better).
export function dur(sec) {
	const s = Math.max(5, Math.round(sec / 5) * 5);
	if (s < 60) return `${s} s`;
	const m = Math.floor(s / 60), r = s % 60;
	return r ? `${m} min ${r} s` : `${m} min`;
}
// "3 hours ago".
export function ago(ms) {
	const m = Math.max(0, ms) / 60000;
	if (m < 1.5) return 'just now';
	if (m < 90) return `${Math.round(m)} minutes ago`;
	const h = m / 60;
	if (h < 36) return `${Math.round(h)} hours ago`;
	return `${Math.round(h / 24)} days ago`;
}

// The sentence about the waves, for a place `who` ("you", "Brisbane"): how long they took, or,
// for the few minutes after an earthquake while they are still on their way, how long is left.
// elapsed: seconds since the earthquake.
export function waves(t, elapsed, who) {
	if (t.p === null) return '';
	if (elapsed < t.p) {
		const s = t.s !== null ? `, the slower S waves in about ${dur(t.s - elapsed)}` : '';
		return `Its first waves reach ${who} in about ${dur(t.p - elapsed)}${s}.`;
	}
	if (t.s === null) return `Its first waves took ${dur(t.p)} to reach ${who}. No S waves come this far: the liquid outer core stops them.`;
	if (elapsed < t.s) return `Its first waves took ${dur(t.p)} to reach ${who}; the slower S waves arrive in about ${dur(t.s - elapsed)}.`;
	return `Its first waves took ${dur(t.p)} to reach ${who}, the slower S waves ${dur(t.s)}.`;
}
