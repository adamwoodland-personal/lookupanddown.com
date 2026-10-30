// Through the Earth: the globe's skin, painted once at load into an equirectangular canvas
// (longitude -180 → 180 left to right, latitude 90 → -90 top to bottom, which is how
// three.js's SphereGeometry lays out its UVs), plus a label point for each country.
//
// Adapted from whatsacross.com/app.js (the graph colouring, unwrap, and the rebuilt Antarctica
// ring filled by our own scanline code because Firefox's GPU canvas fills that one huge path as
// a solid band); keep the two in step.
import { displayName, inRing } from './geo.js';

export const OCEAN = '#123d5c';
const ANT_EDGE = -84.3, POLE_LAT = -89.95;

const HUES = [0, 30, 55, 85, 120, 160, 190, 210, 240, 270, 300, 330];
const SWATCHES = [];
for (const h of HUES) SWATCHES.push({ h, css: `hsl(${h}, 42%, 56%)` });
for (const h of HUES) SWATCHES.push({ h, css: `hsl(${(h + 15) % 360}, 32%, 44%)` });
function palette(topo, topojson) {
	const geoms = topo.objects.countries.geometries;
	const nb = topojson.neighbors(geoms);
	const order = geoms.map((_, i) => i).sort((a, b) => nb[b].length - nb[a].length || a - b);
	const pick = new Array(geoms.length).fill(-1);
	const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
	for (const i of order) {
		const used = nb[i].filter((j) => pick[j] >= 0).map((j) => SWATCHES[pick[j]]);
		let best = -1, bestScore = -Infinity;
		SWATCHES.forEach((sw, k) => {
			const gap = used.length ? Math.min(...used.map((u) => hueGap(u.h, sw.h))) : 999;
			const score = gap * 10 - ((k + i * 7) % SWATCHES.length) * 0.01 - used.some((u) => u.css === sw.css) * 1000;
			if (score > bestScore) { bestScore = score; best = k; }
		});
		pick[i] = best;
	}
	return pick.map((k) => SWATCHES[k].css);
}

function unwrap(ring) {
	const out = []; let prev = ring[0][0], shift = 0, crosses = false;
	for (const [lon, lat] of ring) {
		let l = lon + shift;
		if (l - prev > 180) { shift -= 360; l -= 360; crosses = true; }
		else if (l - prev < -180) { shift += 360; l += 360; crosses = true; }
		out.push([l, lat]); prev = l;
	}
	return { ring: out, crosses };
}
function cleanPolarRing(ring) {
	const isEdge = ([, lat]) => lat <= ANT_EDGE;
	const n = ring.length;
	const start = ring.findIndex((pt, i) => !isEdge(pt) && isEdge(ring[(i - 1 + n) % n]));
	if (start < 0) return null;
	const coast = [];
	for (let i = 0; i < n; i++) { const pt = ring[(start + i) % n]; if (isEdge(pt)) break; coast.push(pt); }
	if (coast.length < 3) return null;
	const u = unwrap(coast).ring, first = u[0], last = u[u.length - 1];
	const wrapLon = first[0] + (last[0] > first[0] ? 360 : -360);
	return [...u, [wrapLon, first[1]], [wrapLon, POLE_LAT], [first[0], POLE_LAT]];
}
// Even-odd scanline fill of the polar ring straight into the pixels.
function fillPolar(ctx, ring, W, H, css) {
	const pts = ring.map(([lon, lat]) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H]);
	let yMin = Infinity, yMax = -Infinity;
	for (const [, y] of pts) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
	const y0 = Math.max(0, Math.floor(yMin)), rows = H - y0;
	ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	const img = ctx.getImageData(0, y0, W, rows), d = img.data, xs = [];
	const put = (x, row) => { const k = (row * W + ((x % W) + W) % W) * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255; };
	for (let row = 0; row < rows; row++) {
		const yc = y0 + row + 0.5;
		if (yc > yMax) { for (let x = 0; x < W; x++) put(x, row); continue; }
		xs.length = 0;
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const [xa, ya] = pts[j], [xb, yb] = pts[i];
			if ((ya <= yc) !== (yb <= yc)) xs.push(xa + (yc - ya) * (xb - xa) / (yb - ya));
		}
		xs.sort((a, b) => a - b);
		for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) put(x, row);
	}
	ctx.putImageData(img, 0, y0);
}
function path(ctx, ring, W, H, dx) {
	ring.forEach(([lon, lat], k) => {
		const x = (lon + 180) / 360 * W + dx, y = (90 - lat) / 180 * H;
		k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
	});
}

// The texture canvas, W wide (W/2 high).
export function paintGlobe(topo, topojson, W) {
	const H = W / 2, px = W / 4096;
	const cv = document.createElement('canvas');
	cv.width = W; cv.height = H;
	const ctx = cv.getContext('2d');
	if (!ctx) throw new Error('no canvas this size');
	ctx.fillStyle = OCEAN; ctx.fillRect(0, 0, W, H);
	const feats = topojson.feature(topo, topo.objects.countries).features, pal = palette(topo, topojson);
	let polar = null, polarCss = null;
	feats.forEach((f, i) => {
		const g = f.geometry;
		if (!g) return;
		const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
		ctx.fillStyle = pal[i];
		for (const poly of polys) {
			if (f.properties.name === 'Antarctica' && poly[0].some(([, lat]) => lat <= ANT_EDGE)) { polar = cleanPolarRing(poly[0]); polarCss = pal[i]; continue; }
			const rings = poly.map(unwrap), offs = rings.some((r) => r.crosses) ? [0, -W, W] : [0];
			for (const dx of offs) { ctx.beginPath(); for (const r of rings) { path(ctx, r.ring, W, H, dx); ctx.closePath(); } ctx.fill('evenodd'); }
		}
	});
	if (polar) fillPolar(ctx, polar, W, H, polarCss);
	// Graticule every 30°, the equator a little stronger.
	ctx.lineWidth = 1.2 * px;
	for (let lat = -60; lat <= 60; lat += 30) {
		ctx.strokeStyle = lat === 0 ? 'rgba(200,230,255,0.35)' : 'rgba(200,230,255,0.16)';
		const y = (90 - lat) / 180 * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
	}
	ctx.strokeStyle = 'rgba(200,230,255,0.16)';
	for (let lon = -180; lon < 180; lon += 30) { const x = (lon + 180) / 360 * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
	// Borders (dark) and coastlines (light).
	const obj = topo.objects.countries;
	const stroke = (mesh, css, lw) => {
		ctx.strokeStyle = css; ctx.lineWidth = lw; ctx.lineJoin = 'round';
		for (const line of mesh.coordinates) {
			ctx.beginPath();
			let prev = null;
			for (const [lon, lat] of line) {
				const x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H;
				if (prev === null || Math.abs(lon - prev) > 180) ctx.moveTo(x, y); else ctx.lineTo(x, y);
				prev = lon;
			}
			ctx.stroke();
		}
	};
	stroke(topojson.mesh(topo, obj, (a, b) => a !== b), 'rgba(10,18,28,0.75)', 1.6 * px);
	stroke(topojson.mesh(topo, obj, (a, b) => a === b), 'rgba(225,240,255,0.55)', 1.4 * px);
	return cv;
}

// The lines on top of the satellite imagery, on a transparent canvas: a faint graticule, then
// coastlines and borders in light grey (dark lines vanish on the dark Blue Marble, as on
// What's Across). The coast gets a soft halo under its line.
export function paintOverlay(topo, topojson, W) {
	const H = W / 2, px = W / 4096;
	const cv = document.createElement('canvas');
	cv.width = W; cv.height = H;
	const ctx = cv.getContext('2d');
	if (!ctx) throw new Error('no canvas this size');
	ctx.lineWidth = 1.2 * px;
	for (let lat = -60; lat <= 60; lat += 30) {
		ctx.strokeStyle = lat === 0 ? 'rgba(200,230,255,0.28)' : 'rgba(200,230,255,0.12)';
		const y = (90 - lat) / 180 * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
	}
	ctx.strokeStyle = 'rgba(200,230,255,0.12)';
	for (let lon = -180; lon < 180; lon += 30) { const x = (lon + 180) / 360 * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
	const obj = topo.objects.countries;
	const stroke = (mesh, css, lw) => {
		ctx.strokeStyle = css; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
		for (const line of mesh.coordinates) {
			ctx.beginPath();
			let prev = null;
			for (const [lon, lat] of line) {
				if (lat <= ANT_EDGE) { prev = null; continue; } // the dataset's artificial polar edge
				const x = (lon + 180) / 360 * W, y = (90 - lat) / 180 * H;
				if (prev === null || Math.abs(lon - prev) > 180) ctx.moveTo(x, y); else ctx.lineTo(x, y);
				prev = lon;
			}
			ctx.stroke();
		}
	};
	const coast = topojson.mesh(topo, obj, (a, b) => a === b), borders = topojson.mesh(topo, obj, (a, b) => a !== b);
	stroke(coast, 'rgba(140,200,255,0.16)', 5 * px);
	stroke(coast, 'rgba(225,238,250,0.62)', 1.4 * px);
	stroke(borders, 'rgba(207,217,228,0.5)', 1.2 * px);
	return cv;
}

// A point inside a polygon (rings in lon/lat, holes after the first) that isIn(lat, lon) accepts,
// as far from the edges as a 40 × 40 grid over its bounding box finds (distances in degrees, with
// longitude scaled by the cosine of the middle latitude). For countries whose centroid falls
// outside their own outline: Vietnam's, for one, lies in Laos. Null if no grid point will do.
function interiorPoint(rings, isIn) {
	const outer = rings[0];
	let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
	for (const [x, y] of outer) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
	const k = Math.cos((s + n) / 2 * Math.PI / 180), N = 40, cands = [];
	const inside = (x, y) => inRing(x, y, outer) && !rings.slice(1).some((h) => inRing(x, y, h));
	const edgeDist = (x, y) => {
		let best = Infinity;
		for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
			const ax = r[j][0] * k, ay = r[j][1], bx = r[i][0] * k, by = r[i][1], px = x * k;
			const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
			const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (y - ay) * dy) / L)) : 0;
			best = Math.min(best, Math.hypot(px - ax - t * dx, y - ay - t * dy));
		}
		return best;
	};
	for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
		const x = w + (e - w) * (i + 0.5) / N, y = s + (n - s) * (j + 0.5) / N;
		if (inside(x, y)) cands.push([x, y, edgeDist(x, y)]);
	}
	cands.sort((a, b) => b[2] - a[2]);
	for (const [x, y] of cands) if (isIn(y, x)) return { lat: y, lon: x };
	return null;
}

// A label point per country, which Find also aims at: the area-weighted centroid of its biggest
// piece, and its total area for ranking (both in degrees², latitude-corrected). With isIn(name,
// lat, lon) (tte.js passes geo.js's lookup, the one the card uses), a centroid it rejects is
// replaced by interiorPoint(), so Find and the card agree. Antarctica is pinned at 80°S, 40°E.
export function labelPoints(topo, topojson, isIn = null) {
	const out = [];
	for (const f of topojson.feature(topo, topo.objects.countries).features) {
		const g = f.geometry;
		if (!g) continue;
		const name = displayName(f.properties.name);
		if (name === 'Antarctica') { out.push({ name, lat: -80, lon: 40, area: 1e4 }); continue; }
		const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
		let total = 0, best = null;
		for (const poly of polys) {
			const ring = unwrap(poly[0]).ring;
			let a = 0, cx = 0, cy = 0;
			for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
				const [x0, y0] = ring[j], [x1, y1] = ring[i], c = x0 * y1 - x1 * y0;
				a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
			}
			if (!a) continue;
			const lat = cy / (3 * a), area = Math.abs(a / 2) * Math.cos(lat * Math.PI / 180);
			total += area;
			if (!best || area > best.area) best = { lat, lon: ((cx / (3 * a) + 540) % 360) - 180, area, poly };
		}
		if (!best) continue;
		if (isIn && !isIn(name, best.lat, best.lon)) {
			const p = interiorPoint(best.poly.map((r) => unwrap(r).ring), (lat, lon) => isIn(name, lat, ((lon + 540) % 360) - 180));
			if (p) { best.lat = p.lat; best.lon = ((p.lon + 540) % 360) - 180; best.moved = true; }
		}
		out.push({ name, lat: best.lat, lon: best.lon, area: total, moved: !!best.moved });
	}
	return out.sort((a, b) => b.area - a.area);
}

export const OCEANS = [
	['Pacific Ocean', 0, -150], ['Pacific Ocean', -30, -120], ['Pacific Ocean', 25, 165],
	['Atlantic Ocean', 25, -42], ['Atlantic Ocean', -20, -18], ['Indian Ocean', -22, 78],
	['Southern Ocean', -60, -60], ['Southern Ocean', -58, 120], ['Arctic Ocean', 82, 0],
];
