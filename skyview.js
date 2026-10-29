// The sky half of the combined view: orrery.live's /night-sky/ renderer (night-sky/sky.js), cut
// down to the view itself. tte.js draws it first, then the glass Earth over it from a second
// camera with the same attitude.
//
// Frames, as in sky.js:
//   J2000 equatorial unit vectors [x,y,z]: x -> RA 0h, z -> north celestial pole.
//   Scene (three.js): x = east, y = up, z = south (-z = north); the camera sits at the origin
//   looking along its local -Z. Azimuth runs clockwise from north.
// Kept from sky.js: the sky dome, Milky Way, stars, constellation lines and names, the Sun,
// Moon and planets, compass points, the label declutter and the reticle's naming. Left out (all
// still in sky.js): the Tonight list and chips, time travel, object cards, settings and the
// ground, which here is the glass Earth. Below the horizon the dome is dark space, the far
// side's sky, and the globe drawn over it hides most of it.
import * as THREE from './lib/three.module.js';
import { STARS } from './stars.js';
import { CLINES } from './constellations.js';
import { COLOR } from './guide-orbits.js';
import * as A from './sky/astro.js';
import { CNAMES, constellationAt } from './sky/constellation-names.js';

const DEG = Math.PI / 180;
export const R = 100;                    // radius of the celestial sphere in scene units
const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const BODY_COLOR = { ...COLOR, Moon: '#e8e4da', Sun: '#ffd166' };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap360 = (x) => ((x % 360) + 360) % 360;
const nf = (n) => Math.round(n).toLocaleString('en-GB');

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
let renderer = null;

// Everything fixed to the stars rides this group; its matrix is the J2000 -> scene rotation for
// the current time and place (precession and Earth's spin included).
const skyGroup = new THREE.Group();
skyGroup.matrixAutoUpdate = false;
scene.add(skyGroup);

function eqVec(raDeg, decDeg, r = 1) {
	const ra = raDeg * DEG, dec = decDeg * DEG;
	return new THREE.Vector3(r * Math.cos(dec) * Math.cos(ra), r * Math.cos(dec) * Math.sin(ra), r * Math.sin(dec));
}
export function azAltToScene(az, alt, r = R) {
	const ca = Math.cos(alt * DEG);
	return new THREE.Vector3(ca * Math.sin(az * DEG) * r, Math.sin(alt * DEG) * r, -ca * Math.cos(az * DEG) * r);
}
export function sceneToAzAlt(v) {
	const n = v.clone().normalize();
	return { az: wrap360(Math.atan2(n.x, -n.z) / DEG), alt: Math.asin(clamp(n.y, -1, 1)) / DEG };
}

// ---- Sky dome: night blue to day blue, with a sunset glow; dark space below the horizon ----
const dome = new THREE.Mesh(
	new THREE.SphereGeometry(R * 1.2, 48, 24),
	new THREE.ShaderMaterial({
		side: THREE.BackSide, depthWrite: false, depthTest: false,
		uniforms: { uSun: { value: new THREE.Vector3(0, -1, 0) }, uSunAlt: { value: -30 } },
		vertexShader: `
			varying vec3 vDir;
			void main() {
				vDir = normalize(position);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}`,
		fragmentShader: `
			varying vec3 vDir; uniform vec3 uSun; uniform float uSunAlt;
			void main() {
				vec3 d = normalize(vDir);
				float h = clamp(d.y, -0.2, 1.0);
				float up = smoothstep(-0.05, 0.6, h);
				// How much daylight: 0 at night (Sun below -18), 1 in full day (Sun above +6).
				float day = smoothstep(-18.0, 6.0, uSunAlt);
				float twi = smoothstep(-16.0, -4.0, uSunAlt) * (1.0 - smoothstep(-2.0, 8.0, uSunAlt));
				vec3 nightTop = vec3(0.006, 0.010, 0.032), nightHor = vec3(0.030, 0.048, 0.105);
				vec3 dayTop = vec3(0.16, 0.36, 0.72), dayHor = vec3(0.58, 0.73, 0.90);
				vec3 night = mix(nightHor, nightTop, up);
				vec3 dayc = mix(dayHor, dayTop, up);
				vec3 col = mix(night, dayc, day * day);
				// Twilight glow: warm near the horizon on the Sun's side.
				float toward = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-5)), 0.0);
				float glow = twi * pow(toward, 3.0) * (1.0 - smoothstep(0.0, 0.35, h));
				col += glow * vec3(0.55, 0.26, 0.10);
				// Around the Sun itself in daylight.
				float near = max(dot(d, normalize(uSun)), 0.0);
				col += smoothstep(-3.0, 3.0, uSunAlt) * pow(near, 60.0) * vec3(0.5, 0.45, 0.35);
				// Below the horizon: the sky beyond the far side of the world, seen through the glass Earth.
				col = mix(col, vec3(0.004, 0.007, 0.018), 1.0 - smoothstep(-0.06, 0.0, d.y));
				gl_FragColor = vec4(col, 1.0);
			}`
	})
);
dome.renderOrder = -10;
scene.add(dome);

// ---- Milky Way: NASA SVS "Deep Star Maps 2020" (Gaia DR2), only when dark -----------------
// The band and the faint stars without the bright ones (the catalogue points draw those), in
// plate carrée J2000 RA/Dec: a mirror image of this group's frame, so the texture is flipped in
// u and the sphere turned +90° about x (see sky.js). 4k everywhere here (sky.js uses 8k on
// desktops); the decoded bitmap is closed once three.js has uploaded it, like the Earth imagery.
const MILKY_MAX = 0.42;
const milkyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
const milky = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 96, 48), milkyMat);
milky.rotation.x = Math.PI / 2;
milky.renderOrder = -9;
milky.visible = false;
skyGroup.add(milky);
export const tex = { milky: 0, milkyClosed: false };
export async function loadMilkyWay(sizes) {
	const resp = await fetch('data/milkyway-gaia-4k.jpg');
	if (!resp.ok) throw new Error(resp.status);
	const blob = await resp.blob();
	let bitmap = null;
	for (const w of sizes) {
		try {
			bitmap = await createImageBitmap(blob, w >= 4096 ? { imageOrientation: 'flipY' } : { imageOrientation: 'flipY', resizeWidth: w, resizeHeight: w / 2, resizeQuality: 'high' });
			break;
		} catch (e) { /* too big for this device: try smaller */ }
	}
	if (!bitmap) throw new Error('could not decode the Milky Way');
	const t = new THREE.Texture(bitmap);
	t.flipY = false; // flipped at decode instead: three.js ignores flipY for bitmaps
	t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = THREE.RepeatWrapping;
	t.repeat.x = -1;
	t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
	t.onUpdate = () => { bitmap.close(); tex.milkyClosed = true; };
	t.needsUpdate = true;
	if (milkyMat.map) milkyMat.map.dispose();
	milkyMat.map = t;
	milkyMat.needsUpdate = true;
	milky.visible = true;
	tex.milky = bitmap.width;
	tex.milkyClosed = false;
}
export function dropMilkyWay() { // the WebGL context was lost: the closed bitmap can't be re-uploaded
	if (milkyMat.map) milkyMat.map.dispose();
	milkyMat.map = null;
	milky.visible = false;
}

// ---- Stars: the orrery's HYG catalogue, sized by magnitude, fading with twilight -----------
function bvToColor(bv) { // same ramp as the orrery
	const stops = [[-0.33, 0.61, 0.69, 1.00], [0.00, 0.79, 0.84, 1.00], [0.30, 0.97, 0.97, 1.00], [0.58, 1.00, 0.96, 0.92], [0.81, 1.00, 0.88, 0.74], [1.40, 1.00, 0.78, 0.59], [2.00, 1.00, 0.70, 0.52]];
	bv = clamp(bv, stops[0][0], stops[stops.length - 1][0]);
	for (let i = 0; i < stops.length - 1; i++) {
		if (bv <= stops[i + 1][0]) {
			const a = stops[i], b = stops[i + 1], t = (bv - a[0]) / (b[0] - a[0]);
			return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
		}
	}
	return [1, 1, 1];
}
const starMat = new THREE.ShaderMaterial({
	uniforms: { uPixelRatio: { value: 1 }, uLimit: { value: 5.5 }, uZoom: { value: 1 } },
	transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
	vertexShader: `
		attribute float aSize; attribute float aMag; attribute vec3 aColor;
		uniform float uPixelRatio; uniform float uLimit; uniform float uZoom;
		varying vec3 vColor; varying float vAlpha;
		void main() {
			vec4 wp = modelMatrix * vec4(position, 1.0);
			float h = normalize(wp.xyz).y;
			// Fainter near the horizon (extinction), dim below it, gone past the limiting magnitude.
			float ext = 0.35 + 0.65 * smoothstep(-0.02, 0.14, h);
			vAlpha = (1.0 - smoothstep(uLimit - 0.7, uLimit + 0.3, aMag)) * ext;
			vColor = aColor;
			gl_Position = projectionMatrix * viewMatrix * wp;
			gl_PointSize = aSize * uPixelRatio * uZoom;
		}`,
	fragmentShader: `
		varying vec3 vColor; varying float vAlpha;
		void main() {
			vec2 d = gl_PointCoord - vec2(0.5);
			float r = length(d);
			if (r > 0.5) discard;
			float core = smoothstep(0.5, 0.0, r);
			gl_FragColor = vec4(vColor, vAlpha * core * core * 1.4);
		}`
});
// HYG labels are proper names ("Mizar") or Bayer/Flamsteed designations ("Gam2Vel", "16    Lyr");
// the latter are shown the usual way ("γ² Vel", "16 Lyr").
const isProperName = (n) => !!n && !/\d/.test(n) && !/^[A-Z][a-z]{1,2}\s+[A-Z][A-Za-z]{2}$/.test(n) && !/\s{2,}/.test(n);
const GREEK = { Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω' };
const SUPER = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
function designation(raw) {
	const m = raw.match(/^(\d{0,3})\s*([A-Z][a-z]{1,2})?\s*(\d?)\s*([A-Z][A-Za-z]{2})$/);
	if (!m) return '';
	const [, num, letter, sup, con] = m;
	if (letter && GREEK[letter]) return GREEK[letter] + (sup ? SUPER[+sup] : '') + ' ' + con;
	return num ? num + ' ' + con : '';
}
const starIndex = [];        // { v, mag, name, desig, bv } for the reticle
const starLabels = [];       // { i, v, name, mag, proper, el, w }, brightest first
(function buildStars() {
	const n = STARS.length;
	const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n), mag = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const [ra, dec, m, bv, label] = STARS[i];
		const v = eqVec(ra, dec);
		pos[i * 3] = v.x * R; pos[i * 3 + 1] = v.y * R; pos[i * 3 + 2] = v.z * R;
		const [r, g, b] = bvToColor(bv);
		col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
		siz[i] = clamp(8.5 - m * 1.25, 1.8, 11);
		mag[i] = m;
		const raw = (label || '').trim();
		const proper = isProperName(raw) ? raw : '';
		const desig = proper ? '' : designation(raw);
		starIndex.push({ v, mag: m, name: proper, desig, bv, ra, dec });
		if (proper || desig) starLabels.push({ i, v, name: proper || desig, mag: m, proper: !!proper, el: null, w: 0 });
	}
	starLabels.sort((a, b) => a.mag - b.mag);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
	geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
	geo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
	const pts = new THREE.Points(geo, starMat);
	pts.renderOrder = -5;
	pts.frustumCulled = false;
	skyGroup.add(pts);
})();

// ---- Constellation lines and names -----------------------------------------------------------
const lineMat = new THREE.LineBasicMaterial({ color: 0x5b7bb0, transparent: true, opacity: 0.42, depthWrite: false, depthTest: false });
(function buildLines() {
	const pts = [];
	for (const poly of CLINES) {
		for (let i = 0; i + 3 < poly.length; i += 2) pts.push(eqVec(poly[i], poly[i + 1], R), eqVec(poly[i + 2], poly[i + 3], R));
	}
	const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
	l.renderOrder = -6;
	l.frustumCulled = false;
	skyGroup.add(l);
})();
const constLabels = CNAMES.map(([abbr, name, ra, dec, rank], i) => ({ i, abbr, name, rank: rank || 2, v: eqVec(ra, dec), el: null }));

// ---- The horizon line ---------------------------------------------------------------------------
(function buildHorizon() {
	const pts = [];
	for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * R * 0.96, 0, -Math.cos(a) * R * 0.96)); }
	const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fb4e0, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false }));
	l.renderOrder = 6;
	scene.add(l);
})();

// ---- Sun, Moon and planets ----------------------------------------------------------------------
function discTexture(draw, size = 128) {
	const c = document.createElement('canvas'); c.width = c.height = size;
	draw(c.getContext('2d'), size);
	const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
	return t;
}
const glowTex = discTexture((g, s) => {
	const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
	grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
	grd.addColorStop(0.32, 'rgba(255,255,255,0.28)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grd; g.fillRect(0, 0, s, s);
});
const sunGlowTex = discTexture((g, s) => {
	const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
	grd.addColorStop(0, 'rgba(255,250,235,1)'); grd.addColorStop(0.12, 'rgba(255,240,200,1)'); grd.addColorStop(0.16, 'rgba(255,214,130,0.55)');
	grd.addColorStop(0.45, 'rgba(255,170,70,0.12)'); grd.addColorStop(1, 'rgba(255,150,40,0)');
	g.fillStyle = grd; g.fillRect(0, 0, s, s);
}, 256);

// Moon: a canvas disc redrawn when the phase changes; its lit side is drawn on +x and the sprite
// is turned so that side faces the Sun on screen.
const moonCanvas = document.createElement('canvas'); moonCanvas.width = moonCanvas.height = 128;
const moonTex = new THREE.CanvasTexture(moonCanvas); moonTex.colorSpace = THREE.SRGBColorSpace;
let moonDrawnK = -1;
function drawMoon(k) {
	if (Math.abs(k - moonDrawnK) < 0.004) return;
	moonDrawnK = k;
	const g = moonCanvas.getContext('2d'), s = 128, r = s * 0.46, c = s / 2;
	g.clearRect(0, 0, s, s);
	g.fillStyle = 'rgba(48,52,64,0.92)'; // earthshine side
	g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill();
	// Lit part = right half-disc +/- an ellipse whose half-width is r*|1-2k|.
	const ex = r * Math.abs(1 - 2 * k);
	g.fillStyle = '#ebe7dc';
	g.beginPath();
	g.arc(c, c, r, -Math.PI / 2, Math.PI / 2, false);
	if (k < 0.5) g.ellipse(c, c, ex, r, 0, Math.PI / 2, -Math.PI / 2, true);  // crescent: carve back in
	else g.ellipse(c, c, ex, r, 0, Math.PI / 2, -Math.PI / 2, false);        // gibbous: bulge out
	g.fill();
	// A hint of maria so it reads as the Moon when zoomed in.
	g.globalCompositeOperation = 'source-atop';
	g.fillStyle = 'rgba(120,118,112,0.28)';
	for (const [x, y, rr] of [[0.42, 0.36, 0.13], [0.58, 0.44, 0.1], [0.5, 0.6, 0.12], [0.36, 0.55, 0.08]]) { g.beginPath(); g.arc(x * s, y * s, rr * s, 0, Math.PI * 2); g.fill(); }
	g.globalCompositeOperation = 'source-over';
	moonTex.needsUpdate = true;
}

export const bodyObjs = {};
for (const name of BODIES) {
	let sprite;
	if (name === 'Sun') sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunGlowTex, depthTest: false, depthWrite: false, transparent: true }));
	else if (name === 'Moon') sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, depthTest: false, depthWrite: false, transparent: true }));
	else sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(BODY_COLOR[name]), depthTest: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
	sprite.renderOrder = name === 'Sun' ? 1 : name === 'Moon' ? 3 : 2;
	scene.add(sprite);
	bodyObjs[name] = { name, sprite, pos: new THREE.Vector3(), az: 0, alt: 0, altApp: 0, mag: 0, el: null, w: 0, distKm: 0 };
}

// ---- Labels (HTML, projected each frame) and the declutter shared with the globe's names ------
let labelsEl = null;
function makeLabel(cls, text) {
	const el = document.createElement('div');
	el.className = cls;
	el.textContent = text;
	el.hidden = true;
	labelsEl.appendChild(el);
	return el;
}
// Label footprints for the declutter, measured once with the label fonts (see tte.css).
const measureCtx = document.createElement('canvas').getContext('2d');
function textW(text, font, spacing = 0) { measureCtx.font = font + ' system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; return measureCtx.measureText(text).width + spacing * text.length; }
let COMPASS = [];

const _v = new THREE.Vector3(), _tmp = new THREE.Vector3();
export function project(world, cam = camera) { // -> {x, y, on} in CSS pixels; on = in front of the camera
	_v.copy(world).project(cam);
	return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, on: _v.z < 1 && _v.z > -1 };
}
// Declutter: labels claim screen boxes in priority order; one that would overlap an already
// placed label is hidden this frame. A coarse grid keeps it cheap with ~1,500 candidates.
const CELL = 96;
let occ = new Map();
export function resetOcc() { occ = new Map(); }
export function claim(x, y, w, h) {
	const x0 = x - w / 2 - 3, x1 = x + w / 2 + 3, y0 = y - h / 2 - 1, y1 = y + h / 2 + 1;
	const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cy0 = Math.floor(y0 / CELL), cy1 = Math.floor(y1 / CELL);
	for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
		const list = occ.get(cx * 10007 + cy);
		if (list) for (const r of list) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false;
	}
	const r = [x0, y0, x1, y1];
	for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
		const k = cx * 10007 + cy;
		const list = occ.get(k);
		if (list) list.push(r); else occ.set(k, [r]);
	}
	return true;
}
export function claimRect(r) { if (r.width && r.height) claim((r.left + r.right) / 2, (r.top + r.bottom) / 2, r.width, r.height); }
// Like place(), but only if the label's box is free (force: always place, still reserving the box).
function placeFree(el, p, dx, dy, w, h, force) {
	if (!p.on || p.x < -80 || p.x > innerWidth + 80 || p.y < -40 || p.y > innerHeight + 40) { if (!el.hidden) el.hidden = true; return false; }
	if (!claim(p.x + dx, p.y + dy, w, h) && !force) { if (!el.hidden) el.hidden = true; return false; }
	if (el.hidden) el.hidden = false;
	el.style.transform = `translate3d(${(p.x + dx).toFixed(1)}px,${(p.y + dy).toFixed(1)}px,0) translate(-50%,-50%)`;
	return true;
}

export function attach(r, labels) {
	renderer = r;
	labelsEl = labels;
	if (renderer) starMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
	for (const b of Object.values(bodyObjs)) { b.el = makeLabel('b-label', b.name); b.el.style.color = BODY_COLOR[b.name]; b.w = textW(b.name, '650 12.5px', 0.25); }
	for (const st of starLabels) { st.el = makeLabel(st.proper ? 's-label' : 's-label d', st.name); st.w = textW(st.name, st.proper ? '500 10.5px' : '500 9.5px', 0.3); }
	for (const c of constLabels) { c.el = makeLabel('c-label', c.name); c.w = textW(c.name.toUpperCase(), '600 9.5px', 1.52); }
	COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((t, i) => ({ az: i * 45, el: makeLabel('k-label' + (i % 2 ? ' minor' : '') + (i === 0 ? ' n' : ''), t), w: textW(t, i % 2 ? '600 11px' : '700 14px') }));
}
export function setPixelRatio(pr) { starMat.uniforms.uPixelRatio.value = pr; }

// ---- Time and place ---------------------------------------------------------------------------------
let matrixT = NaN, matrixLat = NaN, matrixLon = NaN;
const eqToScene = new THREE.Matrix4(), sceneToEq = new THREE.Matrix4();
export const state = { sunAlt: -90, moonPhase: null, t: NaN };
// Recomputes the sky for a moment (days since J2000, UTC) and place; returns false if unchanged.
export function setTime(t, lat, lon) {
	if (t === matrixT && lat === matrixLat && lon === matrixLon) return false;
	matrixT = t; matrixLat = lat; matrixLon = lon;
	state.t = t;
	const m = A.eqToEnuMatrix(t, lat, lon);
	// scene = S·enu with S: x <- east, y <- up, z <- -north.
	eqToScene.set(
		m[0], m[1], m[2], 0,
		m[6], m[7], m[8], 0,
		-m[3], -m[4], -m[5], 0,
		0, 0, 0, 1
	);
	sceneToEq.copy(eqToScene).invert();
	skyGroup.matrix.copy(eqToScene);
	skyGroup.matrixWorldNeedsUpdate = true;
	const obs = { lat, lon, heightM: 0 };
	for (const name of BODIES) {
		const b = bodyObjs[name];
		const r = A.bodyJ2000(name, t, obs);
		b.pos.set(r.v[0], r.v[1], r.v[2]).applyMatrix4(eqToScene).normalize();
		const aa = sceneToAzAlt(b.pos);
		b.az = aa.az; b.alt = aa.alt;
		b.altApp = aa.alt + A.refraction(aa.alt);
		b.distKm = r.distKm;
		b.mag = A.magnitude(name, t);
		// Shown at the refracted position (it matters only near the horizon).
		b.pos.copy(azAltToScene(b.az, b.altApp, 1));
	}
	const sunAlt = state.sunAlt = bodyObjs.Sun.alt;
	dome.material.uniforms.uSun.value.copy(bodyObjs.Sun.pos);
	dome.material.uniforms.uSunAlt.value = sunAlt;
	starMat.uniforms.uLimit.value = limitingMag(sunAlt);
	lineMat.opacity = 0.42 * clamp((-sunAlt + 1) / 11, 0.1, 1);
	milkyMat.opacity = MILKY_MAX * clamp((-sunAlt - 12) / 6, 0, 1);
	state.moonPhase = A.moonPhase(t);
	drawMoon(state.moonPhase.fraction);
	return true;
}
// Faintest star you could see for a given Sun altitude (dark site ~6; the catalogue stops at 5).
function limitingMag(sa) {
	if (sa >= 0) return -3.2;
	if (sa >= -6) return -3.2 + (0 - sa) / 6 * 4.4;     // -> 1.2 at civil dusk
	if (sa >= -12) return 1.2 + (-6 - sa) / 6 * 2.8;    // -> 4.0 at nautical dusk
	if (sa >= -18) return 4.0 + (-12 - sa) / 6 * 1.8;   // -> 5.8 when fully dark
	return 5.8;
}
function bodyVisibleNow(b) { return b.mag < limitingMag(state.sunAlt) + (b.name === 'Moon' || b.name === 'Sun' ? 99 : 0); }

// ---- Per frame -------------------------------------------------------------------------------------
// The camera: at the origin, with the attitude the globe's camera also uses, and the same view.
export function setView(q, fov, aspect, camOn) {
	camera.quaternion.copy(q);
	if (camera.fov !== fov || camera.aspect !== aspect) { camera.fov = fov; camera.aspect = aspect; camera.updateProjectionMatrix(); }
	camera.updateMatrixWorld(true);
	starMat.uniforms.uZoom.value = zoomScale();
	dome.visible = !camOn; // the camera picture is the sky then
	layoutBodies();
}
function zoomScale() { return clamp(Math.pow(70 / camera.fov, 0.45), 0.75, 2.4); }
const moonSunDir = new THREE.Vector3();
function layoutBodies() {
	const z = zoomScale();
	const px = (deg) => deg * DEG * R; // sprite world size for an angular size
	const pxPerDeg = innerHeight / camera.fov;
	for (const name of BODIES) {
		const b = bodyObjs[name];
		const s = b.sprite;
		s.position.copy(b.pos).multiplyScalar(R * 0.9);
		if (name === 'Sun') {
			s.scale.setScalar(px(Math.max(0.53 * 6, 26 / pxPerDeg)));
		} else if (name === 'Moon') {
			// Real size (0.52°) when zoomed in, enlarged when zoomed out so the phase is legible.
			s.scale.setScalar(px(Math.max(0.52, 22 / pxPerDeg)));
			s.material.opacity = b.alt < -1 ? 0.5 : 1;
			// Turn the lit limb towards the Sun on screen.
			const a = project(s.position);
			moonSunDir.copy(bodyObjs.Sun.pos).sub(_tmp.copy(b.pos).multiplyScalar(b.pos.dot(bodyObjs.Sun.pos))).normalize();
			const b2 = project(_tmp.copy(b.pos).addScaledVector(moonSunDir, 0.02).normalize().multiplyScalar(R * 0.9));
			s.material.rotation = Math.atan2(-(b2.y - a.y), b2.x - a.x);
		} else {
			const vis = bodyVisibleNow(b);
			const sizePx = clamp(17 - b.mag * 2.4, 10, 32) * z;
			s.scale.setScalar(px(sizePx / pxPerDeg));
			s.material.opacity = vis ? (b.alt < -1 ? 0.35 : 1) : 0.12;
		}
	}
}

// The sky's names, in priority order: bodies and compass points always, then the brightest
// stars, constellation names and the other named stars. Star and constellation names stop at
// the horizon: below it is the glass Earth, whose names tte.js places in between (between()).
function properLimit() { const f = camera.fov; return f > 80 ? 2.2 : f > 60 ? 2.7 : f > 42 ? 3.3 : f > 28 ? 4.0 : f > 18 ? 4.6 : 5.1; }
function desigLimit() { const f = camera.fov; return f > 60 ? -99 : f > 42 ? 2.6 : f > 28 ? 3.4 : f > 18 ? 4.2 : 5.1; }
export function placeLabels(between) {
	for (const name of BODIES) {
		const b = bodyObjs[name];
		const visible = name === 'Sun' || name === 'Moon' || bodyVisibleNow(b);
		if (!visible) { b.el.hidden = true; continue; }
		const r = b.sprite.scale.x / (R * 0.9) / DEG * innerHeight / camera.fov / 2; // sprite radius in px
		if (placeFree(b.el, project(b.sprite.position), 0, Math.max(14, r * 0.55 + 10), b.w, 15, true)) b.el.classList.toggle('below', b.alt < -0.5);
	}
	for (const k of COMPASS) placeFree(k.el, project(azAltToScene(k.az, 0.6, R * 0.95)), 0, -9, k.w, 16, true);
	if (between) between();
	const showStars = state.sunAlt < -4;
	const pLim = showStars ? properLimit() : -99, dLim = showStars ? desigLimit() : -99;
	const starLabel = (st) => {
		_tmp.copy(st.v).multiplyScalar(R).applyMatrix4(eqToScene);
		if (_tmp.y < 0.5) { if (!st.el.hidden) st.el.hidden = true; return; }
		placeFree(st.el, project(_tmp), 0, 11, st.w, 12, false);
	};
	const done = new Set();
	for (const st of starLabels) {
		if (st.mag >= 2.0) break;
		if (st.proper && st.mag <= pLim) { starLabel(st); done.add(st); }
	}
	const showC = state.sunAlt < -4 && camera.fov < 95;
	// Big/famous figures always; the rest as you zoom in (phones would otherwise drown in names).
	const maxRank = camera.fov > 70 ? 1 : camera.fov > 40 ? 2 : 3;
	for (const c of constLabels) {
		if (!showC || c.rank > maxRank) { c.el.hidden = true; continue; }
		_tmp.copy(c.v).multiplyScalar(R).applyMatrix4(eqToScene);
		if (_tmp.y < 2) { c.el.hidden = true; continue; }
		placeFree(c.el, project(_tmp), 0, 0, c.w, 11, false);
	}
	for (const st of starLabels) {
		if (done.has(st)) continue;
		if (st.mag > (st.proper ? pLim : dLim)) { if (!st.el.hidden) st.el.hidden = true; continue; }
		starLabel(st);
	}
}

// ---- What sits under the reticle -------------------------------------------------------------------
function fmtDist(km) {
	if (km < 2e6) return `${nf(km)} km away`;
	const au = km / 149597870.7;
	return `${au < 10 ? au.toFixed(2) : au.toFixed(1)} AU away`;
}
const where = (az, alt) => alt < -0.5 ? `below the horizon, ${A.compass16(az)}` : `${Math.round(alt)}° up, ${A.compass16(az)}`;
const conOf = (v) => { const e = _tmp.copy(v).applyMatrix4(sceneToEq); return constellationAt(wrap360(Math.atan2(e.y, e.x) / DEG), Math.asin(clamp(e.z, -1, 1)) / DEG); };
// The nearest body within 6° (scaled with the zoom) of the direction fwd (scene frame, unit).
export function bodyAt(fwd) {
	let best = null, bd = 6 * camera.fov / 67;
	for (const name of BODIES) {
		const d = Math.acos(clamp(fwd.dot(bodyObjs[name].pos), -1, 1)) / DEG;
		if (d < bd) { bd = d; best = bodyObjs[name]; }
	}
	return best;
}
export const bodyTitle = (b) => b.name === 'Moon' ? 'The Moon' : b.name === 'Sun' ? 'The Sun' : b.name;
// The card for a sky direction: a body, else a named star brighter than 3.5, else the
// constellation that direction falls in. { kind, kicker, name, detail, color }
export function describe(fwd) {
	const day = state.sunAlt > -4;
	const b = bodyAt(fwd);
	if (b) {
		const ph = state.moonPhase;
		const kicker = b.name === 'Sun' ? 'Our star' : b.name === 'Moon' ? `${ph.name}, ${Math.round(ph.fraction * 100)}% lit · in ${conOf(b.pos)}` : `Planet · in ${conOf(b.pos)}`;
		const planet = b.name !== 'Sun' && b.name !== 'Moon';
		const faint = planet && b.mag > 5.5 ? ` · ${b.mag > 6.5 ? 'telescope' : 'binoculars'} only`
			: planet && day && !bodyVisibleNow(b) ? ' · hidden by daylight' : '';
		const sun = b.name === 'Sun' && b.alt > 0 ? ' · never look straight at it' : '';
		const mag = b.name === 'Sun' ? '' : ` · magnitude ${b.mag.toFixed(1)}`;
		return { kind: 'body', key: b.name, kicker, name: bodyTitle(b), color: BODY_COLOR[b.name],
			detail: `${cap(where(b.az, b.altApp))}${mag} · ${fmtDist(b.distKm)}${faint}${sun}` };
	}
	let star = null, sd = 3.5 * camera.fov / 67;
	for (let i = 0; i < starIndex.length; i++) {
		const s = starIndex[i];
		if (!(s.name || s.desig) || s.mag > 3.5) continue;
		_tmp.copy(s.v).applyMatrix4(eqToScene);
		const d = Math.acos(clamp(fwd.dot(_tmp), -1, 1)) / DEG;
		if (d < sd) { sd = d; star = s; }
	}
	const aa = sceneToAzAlt(fwd);
	if (star) {
		const w = sceneToAzAlt(_tmp.copy(star.v).applyMatrix4(eqToScene));
		const hidden = day && star.mag > limitingMag(state.sunAlt) ? ' · hidden by daylight' : '';
		return { kind: 'star', kicker: `Star · in ${constellationAt(star.ra, star.dec)}`, name: star.name || star.desig, color: '#cfe0ff',
			detail: `${cap(where(w.az, w.alt + A.refraction(w.alt)))} · magnitude ${star.mag.toFixed(1)}${hidden}` };
	}
	return { kind: 'const', kicker: day ? 'Constellation · hidden by daylight' : 'Constellation', name: conOf(fwd), color: '#b9cbf2',
		detail: cap(where(aa.az, aa.alt)) };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export { A, limitingMag };
