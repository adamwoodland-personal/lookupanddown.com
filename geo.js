// Through the Earth: what's at a point on the surface. The country from What's Across's
// Natural Earth outlines (the same data/countries-10m.json), else a coarse ocean or sea name.
//
// Point-in-polygon in plain lon/lat with a bounding-box prefilter. world-atlas cuts every
// polygon at ±180°, so no antimeridian handling is needed; Natural Earth's Antarctica stops at
// about 85°S, so anything south of 83.5°S is Antarctica (as in What's Across).
//
// load(topo) takes the parsed topology and the topojson-client global; whereIs() runs under
// Node too (ReferenceFiles/lookupanddown/geo-test.mjs).

// Natural Earth abbreviates the smaller names; spelled out as in whatsacross.com/app.js
// (keep the two lists in step).
const FULL_NAMES = {
	'S. Sudan': 'South Sudan', 'W. Sahara': 'Western Sahara', 'Dem. Rep. Congo': 'Democratic Republic of the Congo',
	'St-Martin': 'Saint Martin', 'Central African Rep.': 'Central African Republic', 'Dominican Rep.': 'Dominican Republic',
	'Bosnia and Herz.': 'Bosnia and Herzegovina', 'Eq. Guinea': 'Equatorial Guinea', 'N. Cyprus': 'Northern Cyprus',
	'Cyprus U.N. Buffer Zone': 'Cyprus UN Buffer Zone', 'Turks and Caicos Is.': 'Turks and Caicos Islands',
	'St. Pierre and Miquelon': 'Saint Pierre and Miquelon', 'Pitcairn Is.': 'Pitcairn Islands', 'Fr. Polynesia': 'French Polynesia',
	'Fr. S. Antarctic Lands': 'French Southern and Antarctic Lands', 'Marshall Is.': 'Marshall Islands',
	'St. Vin. and Gren.': 'Saint Vincent and the Grenadines', 'U.S. Minor Outlying Is.': 'US Minor Outlying Islands',
	'Antigua and Barb.': 'Antigua and Barbuda', 'St. Kitts and Nevis': 'Saint Kitts and Nevis', 'St-Barthélemy': 'Saint Barthélemy',
	'U.S. Virgin Is.': 'US Virgin Islands', 'British Virgin Is.': 'British Virgin Islands', 'Cayman Is.': 'Cayman Islands',
	'Heard I. and McDonald Is.': 'Heard Island and McDonald Islands', 'Faeroe Is.': 'Faroe Islands',
	'Indian Ocean Ter.': 'Australian Indian Ocean Territories', 'Br. Indian Ocean Ter.': 'British Indian Ocean Territory',
	'Cook Is.': 'Cook Islands', 'Wallis and Futuna Is.': 'Wallis and Futuna', 'Solomon Is.': 'Solomon Islands',
	'S. Geo. and the Is.': 'South Georgia and the South Sandwich Islands', 'Falkland Is.': 'Falkland Islands',
	'N. Mariana Is.': 'Northern Mariana Islands', 'Coral Sea Is.': 'Coral Sea Islands', 'Spratly Is.': 'Spratly Islands',
	'Clipperton I.': 'Clipperton Island', 'Ashmore and Cartier Is.': 'Ashmore and Cartier Islands',
	'Dem. Rep. Korea': 'North Korea', 'eSwatini': 'Eswatini',
};

export const displayName = (raw) => FULL_NAMES[raw] || raw;

let countries = []; // { name, bbox: [w, s, e, n], polys: [[ring, ...holes], ...] }

// Outlines that cross the 180° meridian (Fiji's and Russia's) jump from +180 to -180 inside a ring, which a
// flat point-in-polygon test reads as an edge across the whole map: before 2026-11-26 every point near
// 16.5°S, inland Queensland and the open Indian Ocean included, came out as Fiji. Such rings are unwrapped
// into one continuous run of longitudes (which may then pass ±180), and countryAt also tries lon ± 360.
// Antarctica's ring jumps once, going round the pole, so it is left alone (countryAt's -83.5° rule).
function unwrap(ring) {
	let jumps = 0;
	for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) jumps++;
	if (!jumps || jumps % 2) return ring;
	const out = [[ring[0][0], ring[0][1]]];
	for (let i = 1; i < ring.length; i++) {
		let x = ring[i][0];
		const px = out[i - 1][0];
		while (x - px > 180) x -= 360;
		while (px - x > 180) x += 360;
		out.push([x, ring[i][1]]);
	}
	return out;
}

export function load(topo, topojson) {
	const feats = topojson.feature(topo, topo.objects.countries).features;
	countries = feats.map((f) => {
		const g = f.geometry;
		const raw = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
		const polys = raw.map((poly) => poly.map(unwrap));
		let w = 180, s = 90, e = -180, n = -90;
		for (const poly of polys) for (const [x, y] of poly[0]) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
		return { name: displayName(f.properties.name), bbox: [w, s, e, n], polys, wraps: w < -180 || e > 180 };
	}).filter((c) => c.polys.length);
	return countries.length;
}

export function inRing(x, y, ring) {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i], [xj, yj] = ring[j];
		if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

export function countryAt(lat, lon) {
	if (lat < -83.5) return 'Antarctica';
	for (const c of countries) {
		const [w, s, e, n] = c.bbox;
		if (lat < s || lat > n) continue;
		for (const x of c.wraps ? [lon, lon + 360, lon - 360] : [lon]) {
			if (x < w || x > e) continue;
			for (const poly of c.polys) {
				if (!inRing(x, lat, poly[0])) continue;
				let hole = false;
				for (let k = 1; k < poly.length; k++) if (inRing(x, lat, poly[k])) { hole = true; break; }
				if (!hole) return c.name;
			}
		}
	}
	return null;
}

// Coarse boxes for the seas a tunnel is likeliest to surface in; land is tested first, so a box
// spilling onto the coast does no harm. The first match wins, so the small seas come first.
const SEAS = [
	['the Caspian Sea', 36.5, 47.2, 46.5, 55], ['the Black Sea', 40.5, 47, 27.5, 42], ['the Red Sea', 12.5, 30, 32, 43.5],
	['the Persian Gulf', 24, 30.5, 48, 56.5], ['the Baltic Sea', 53.5, 66, 9.5, 30.5], ['the North Sea', 51, 61, -4, 9],
	['the Mediterranean Sea', 30, 46, -6, 36.5], ['Hudson Bay', 51, 64, -95, -76], ['the Gulf of Mexico', 18, 30.5, -98, -81],
	['the Caribbean Sea', 9, 22, -88, -60], ['the Sea of Japan', 34, 52, 127, 142], ['the South China Sea', 0, 23, 99, 121],
	['the Bay of Bengal', 5, 23, 80, 95], ['the Arabian Sea', 5, 25, 51, 75], ['the Coral Sea', -30, -10, 145, 165],
	['the Tasman Sea', -47, -30, 147, 175],
];
export function waterAt(lat, lon) {
	for (const [name, s, n, w, e] of SEAS) if (lat >= s && lat <= n && lon >= w && lon <= e) return name;
	if (lat >= 66) return 'the Arctic Ocean';
	if (lat <= -60) return 'the Southern Ocean';
	// The Atlantic: between the Americas and Europe/Africa.
	const atlanticWest = lat > 8 ? (lat > 50 ? -70 : -100) : lat > -55 ? -70 : -68;
	if (lon >= atlanticWest && lon <= 20 && !(lat < 8 && lon < -82)) {
		if (!(lat > 8 && lat < 18 && lon < -84)) return 'the Atlantic Ocean'; // Central America's Pacific side
	}
	// The Indian Ocean: south of Asia, east of Africa, west of Australia and Indonesia.
	if (lat < 30 && lon > 20 && (lon < 100 || (lon < 147 && lat < -10))) return 'the Indian Ocean';
	return 'the Pacific Ocean';
}

export function whereIs(lat, lon) {
	const land = countryAt(lat, lon);
	return land ? { name: land, land: true } : { name: waterAt(lat, lon), land: false };
}
