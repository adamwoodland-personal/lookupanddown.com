// Through the Earth: the physics. A straight tunnel from where you stand, aimed `d` degrees
// below the horizon on compass bearing `az`, and what the drill head meets along it.
//
// No DOM, so it runs under Node (ReferenceFiles/lookupanddown/earth-test.mjs).
//
// The Earth is a sphere of radius R with the Preliminary Reference Earth Model's density
// (Dziewonski & Anderson 1981, PREM). Mass, gravity and pressure are integrated from that
// density at load, in 1 km shells, and the test checks them against the published values
// (total mass, surface gravity, the pressure at the core boundaries and the centre).
//
// Geometry: a straight line leaving the surface d below the horizontal is a chord whose ends
// subtend 2d at the centre (the tangent-chord angle). So the far end is 2d of arc away along
// the bearing, the tunnel is 2R·sin d long, and its deepest point, halfway, is R(1 − cos d)
// down. Straight down (d = 90°) is the antipode.

export const R = 6371;                 // km, mean radius
const G = 6.6743e-11;                  // m³ kg⁻¹ s⁻²
const DEG = Math.PI / 180;

// ---- PREM density, g/cm³ (x = r / 6371) -------------------------------------------------
const PREM = [
	[1221.5, (x) => 13.0885 - 8.8381 * x * x],                                         // inner core
	[3480.0, (x) => 12.5815 - 1.2638 * x - 3.6426 * x * x - 5.5281 * x * x * x],     // outer core
	[5701.0, (x) => 7.9565 - 6.4761 * x + 5.5283 * x * x - 3.0807 * x * x * x],      // lower mantle
	[5771.0, (x) => 5.3197 - 1.4836 * x],                                               // transition zone
	[5971.0, (x) => 11.2494 - 8.0298 * x],
	[6151.0, (x) => 7.1089 - 3.8045 * x],
	[6346.6, (x) => 2.6910 + 0.6924 * x],                                               // lid and low-velocity zone
	[6356.0, () => 2.900],                                                              // lower crust
	[6368.0, () => 2.600],                                                              // upper crust
	[6371.0, () => 1.020],                                                              // PREM's global ocean
];
export function density(rKm) {
	const x = rKm / R;
	for (const [top, f] of PREM) if (rKm <= top) return f(x);
	return 0;
}

// Tables at every whole km of radius, 0…R: enclosed mass (kg), gravity (m/s²), pressure (Pa),
// and Ψ(r) = ∫ g dr from r up to the surface (J/kg), which gives the free-fall speed.
const N = R;
const mass = new Float64Array(N + 1), grav = new Float64Array(N + 1), pres = new Float64Array(N + 1), psi = new Float64Array(N + 1);
{
	const dr = 1000; // m
	for (let i = 1; i <= N; i++) {
		const rm = (i - 0.5) * dr; // shell midpoint
		mass[i] = mass[i - 1] + 4 * Math.PI * rm * rm * density(i - 0.5) * 1000 * dr;
		grav[i] = G * mass[i] / (i * dr * i * dr);
	}
	for (let i = N - 1; i >= 0; i--) {
		const gMid = (grav[i] + grav[i + 1]) / 2, rhoMid = density(i + 0.5) * 1000;
		pres[i] = pres[i + 1] + rhoMid * gMid * dr;
		psi[i] = psi[i + 1] + gMid * dr;
	}
}
const lerpTable = (t, r) => {
	const c = Math.min(Math.max(r, 0), N), i = Math.min(Math.floor(c), N - 1), f = c - i;
	return t[i] + (t[i + 1] - t[i]) * f;
};
export const EARTH_MASS = mass[N];
export const gravityAt = (rKm) => lerpTable(grav, rKm);      // m/s²
export const pressureAt = (rKm) => lerpTable(pres, rKm);     // Pa
const psiAt = (rKm) => lerpTable(psi, rKm);

// ---- Layers (by depth, km) ----------------------------------------------------------------
// The crust's base (the Moho) is about 35 km under continents and 7 km under oceans; one
// figure is used here. 2,891 and 5,150 km are PREM's core boundaries.
export const LAYERS = [
	{ key: 'crust', name: 'Crust', top: 0, bottom: 35, what: 'solid rock', color: '#a0805a' },
	{ key: 'upper', name: 'Upper mantle', top: 35, bottom: 410, what: 'hot, slowly flowing rock', color: '#b5472f' },
	{ key: 'transition', name: 'Transition zone', top: 410, bottom: 660, what: 'rock squeezed into denser crystals', color: '#c9572c' },
	{ key: 'lower', name: 'Lower mantle', top: 660, bottom: 2891, what: 'the largest layer, solid but slowly flowing', color: '#d8692b' },
	{ key: 'outer', name: 'Outer core', top: 2891, bottom: 5150, what: 'liquid iron and nickel', color: '#ffad33' },
	{ key: 'inner', name: 'Inner core', top: 5150, bottom: R, what: 'solid iron and nickel', color: '#fff1b0' },
];
export const layerAt = (depthKm) => LAYERS.find((l) => depthKm < l.bottom) || LAYERS[LAYERS.length - 1];

// Temperature is the least certain number here: nobody has measured it below a few km, and
// estimates differ by hundreds of degrees. A rough profile (°C by depth in km).
const TEMP = [[0, 15], [35, 500], [100, 1300], [410, 1500], [660, 1700], [2700, 2500], [2891, 3700], [5150, 5300], [R, 5500]];
export function temperatureAt(depthKm) {
	const d = Math.min(Math.max(depthKm, 0), R);
	for (let i = 1; i < TEMP.length; i++) {
		const [d1, t1] = TEMP[i];
		if (d <= d1) { const [d0, t0] = TEMP[i - 1]; return t0 + (t1 - t0) * (d - d0) / (d1 - d0); }
	}
	return TEMP[TEMP.length - 1][1];
}

// ---- The tunnel ---------------------------------------------------------------------------
export const tunnelLength = (dDeg) => (dDeg <= 0 ? 0 : 2 * R * Math.sin(Math.min(dDeg, 90) * DEG));
export const deepestPoint = (dDeg) => (dDeg <= 0 ? 0 : R * (1 - Math.cos(Math.min(dDeg, 90) * DEG)));

// Distance from the centre, s km along the tunnel.
export function radiusAlong(s, dDeg) {
	const sd = Math.sin(Math.min(dDeg, 90) * DEG);
	return Math.sqrt(Math.max(R * R + s * s - 2 * R * s * sd, 0));
}

// What the drill head meets s km along a tunnel aimed d below the horizon.
export function headAt(s, dDeg) {
	const L = tunnelLength(dDeg), sc = Math.min(Math.max(s, 0), L);
	const r = radiusAlong(sc, dDeg), depth = R - r;
	return {
		s: sc, length: L, remaining: Math.max(L - s, 0), through: L > 0 && s >= L,
		r, depth, layer: layerAt(depth),
		tempC: temperatureAt(depth), pressureGPa: pressureAt(r) / 1e9, gravity: gravityAt(r),
		descending: sc < L / 2,
	};
}

// Where along the tunnel (km from the start) it crosses each layer boundary, in order: the
// layers a tunnel at this angle passes through, going in and coming back out.
export function layerCrossings(dDeg) {
	const L = tunnelLength(dDeg);
	if (L <= 0) return [];
	const sd = Math.sin(Math.min(dDeg, 90) * DEG), cd = Math.cos(Math.min(dDeg, 90) * DEG);
	const mid = R * sd, closest = R * cd; // closest approach to the centre, at the middle
	const spans = [];
	for (const l of LAYERS) {
		const rTop = R - l.top, rBot = R - l.bottom;
		if (rTop <= closest) continue;                // the tunnel never gets this deep
		const hTop = Math.sqrt(Math.max(rTop * rTop - closest * closest, 0));
		const hBot = rBot > closest ? Math.sqrt(rBot * rBot - closest * closest) : 0;
		// In and out; for the deepest layer (hBot = 0) the two halves meet in the middle and merge below.
		spans.push({ layer: l, from: mid - hTop, to: mid - hBot });
		spans.push({ layer: l, from: mid + hBot, to: mid + hTop });
	}
	spans.sort((a, b) => a.from - b.from);
	// Merge the two halves of the deepest layer, which meet in the middle.
	const out = [];
	for (const sp of spans) {
		const last = out[out.length - 1];
		if (last && last.layer === sp.layer && Math.abs(last.to - sp.from) < 1e-6) last.to = sp.to;
		else out.push({ ...sp });
	}
	for (const o of out) { o.from = Math.max(o.from, 0); o.to = Math.min(o.to, L); }
	return out;
}

// The gravity train: a pod dropped into the tunnel, with no air and no friction (and ignoring
// the Earth's spin, which would push it into the wall), slides to the far end and stops there.
// Its speed at distance r from the centre is √(2Ψ(r)), whatever the angle, so the time is a
// single integral. With x = x0·sin θ along the half-tunnel the end-point singularity goes away
// (for a uniform Earth the integrand is constant, π/ω, the textbook 42.2 minutes).
// Returns { minutes, maxSpeedKms } for the whole trip, end to end.
export function fallTime(dDeg) {
	if (dDeg <= 0) return { minutes: 0, maxSpeedKms: 0 };
	const sd = Math.sin(Math.min(dDeg, 90) * DEG), cd = Math.cos(Math.min(dDeg, 90) * DEG);
	const x0 = R * sd * 1000, b = R * cd * 1000; // m
	const steps = 2000;
	let half = 0;
	for (let k = 0; k < steps; k++) {
		const th = (k + 0.5) / steps * Math.PI / 2;
		const x = x0 * Math.sin(th), r = Math.hypot(b, x) / 1000;
		const v = Math.sqrt(2 * Math.max(psiAt(r), 1e-9));
		half += x0 * Math.cos(th) / v * (Math.PI / 2 / steps);
	}
	return { minutes: 2 * half / 60, maxSpeedKms: Math.sqrt(2 * psiAt(b / 1000)) / 1000 };
}

// ---- Where it comes out -----------------------------------------------------------------------
// The point `arcDeg` of great-circle arc from (lat, lon) along bearing az.
export function destination(latDeg, lonDeg, azDeg, arcDeg) {
	const p1 = latDeg * DEG, l1 = lonDeg * DEG, t = azDeg * DEG, dl = arcDeg * DEG;
	const p2 = Math.asin(Math.sin(p1) * Math.cos(dl) + Math.cos(p1) * Math.sin(dl) * Math.cos(t));
	const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(dl) * Math.cos(p1), Math.cos(dl) - Math.sin(p1) * Math.sin(p2));
	return { lat: p2 / DEG, lon: ((l2 / DEG + 540) % 360) - 180 };
}
export const exitPoint = (latDeg, lonDeg, azDeg, dDeg) => destination(latDeg, lonDeg, azDeg, 2 * Math.min(Math.max(dDeg, 0), 90));

// Milestones by depth (km) that the HUD calls out on the way down.
export const MILESTONES = [
	[4, 'Deeper than the deepest mine (Mponeng, South Africa, about 4 km)'],
	[12.262, 'Deeper than the deepest hole ever drilled (Kola Superdeep Borehole, 12.3 km, 1989)'],
	[35, 'Through the crust: the Moho'],
	[410, '410 km: rock squeezes into denser crystals'],
	[660, 'Into the lower mantle'],
	[2891, 'The core! Liquid iron and nickel'],
	[5150, 'The solid inner core'],
];
// The Kola borehole's pace: 12.262 km in about 19 years (1970–1989).
export const KOLA_KM_PER_YEAR = 12.262 / 19;
