// Look Up and Down (lookupanddown.com): point the phone up for the sky (planets, stars,
// constellations, the Milky Way, from orrery.live's night sky), or down to see the other side of
// the world from underneath, as if the Earth were glass.
//
// Two scenes, one attitude. The phone's attitude from orientation.js comes in the local "scene"
// frame (x east, y up, z south). The sky (skyview.js) is drawn first, from a camera at the origin
// with that attitude. The globe is drawn over it: a unit sphere seen from the inside (BackSide)
// in Earth-fixed axes (x = cosφ·cosλ, y = sinφ, z = −cosφ·sinλ, which matches SphereGeometry's
// UVs), from a camera on its surface at the visitor's place, whose attitude is the same one
// turned into Earth-fixed axes by the local basis [east | up | south]. Every point of the sphere
// lies below the local horizon, so the globe fills exactly the lower half of the view by itself;
// ground within ~700 km fades out (it would only smear along the horizon), which leaves a few
// degrees of sky below the horizon line. From inside, the far side shows from underneath,
// mirror-image, as glass would; the names are HTML on top, the right way round.
//
// The globe's look follows What's Across's satellite mode: NASA Blue Marble imagery with light
// coastlines and borders on top, and a blue atmosphere glow. Seen from inside, the glow is where
// the line of sight meets the surface at a grazing angle (the inside-out version of the limb), so
// it builds towards the edge of the view. The outer and inner core glow faintly orange in the
// middle of the glass Earth, as rings when you look steeply down.
//
// Without a compass (desktops, refused motion permission) the view is dragged; wheel or pinch
// zooms. window.__TTE is a test hook.
import * as THREE from './lib/three.module.js';
import * as E from './earth.js';
import * as G from './geo.js';
import * as SKY from './skyview.js';
import { dateToDays } from './guide-orbits.js';
import { geocode } from './places.js';
import { paintGlobe, paintOverlay, labelPoints, OCEANS } from './texture.js';
import { OrientationSource, declination, decimalYear } from './orientation.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const nf = (n) => Math.round(n).toLocaleString('en-GB');
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const point = (az) => POINTS[Math.round(az / 22.5) % 16];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const EARTH_FROM = 2; // degrees below the horizon where the card turns from the sky to the Earth

// ---- Places: GPS, a #at= link, a searched place, or a guess from the time zone -------------------
// This short list only serves the guess: the place sheet searches any place online (places.js).
const CITIES = [
	['Brisbane', -27.47, 153.03, 'Australia/Brisbane'], ['Sydney', -33.87, 151.21, 'Australia/Sydney'],
	['Melbourne', -37.81, 144.96, 'Australia/Melbourne'], ['Perth', -31.95, 115.86, 'Australia/Perth'],
	['Adelaide', -34.93, 138.6, 'Australia/Adelaide'], ['Darwin', -12.46, 130.84, 'Australia/Darwin'],
	['Hobart', -42.88, 147.33, 'Australia/Hobart'], ['Auckland', -36.85, 174.76, 'Pacific/Auckland'],
	['Tokyo', 35.68, 139.69, 'Asia/Tokyo'], ['Shanghai', 31.23, 121.47, 'Asia/Shanghai'],
	['Hong Kong', 22.32, 114.17, 'Asia/Hong_Kong'], ['Singapore', 1.35, 103.82, 'Asia/Singapore'],
	['Mumbai', 19.08, 72.88, 'Asia/Kolkata'], ['Dubai', 25.2, 55.27, 'Asia/Dubai'],
	['Moscow', 55.76, 37.62, 'Europe/Moscow'], ['Cairo', 30.04, 31.24, 'Africa/Cairo'],
	['Nairobi', -1.29, 36.82, 'Africa/Nairobi'], ['Johannesburg', -26.2, 28.05, 'Africa/Johannesburg'],
	['Lagos', 6.52, 3.38, 'Africa/Lagos'], ['London', 51.51, -0.13, 'Europe/London'],
	['Paris', 48.86, 2.35, 'Europe/Paris'], ['Berlin', 52.52, 13.41, 'Europe/Berlin'],
	['Madrid', 40.42, -3.7, 'Europe/Madrid'], ['Rome', 41.9, 12.5, 'Europe/Rome'],
	['Stockholm', 59.33, 18.07, 'Europe/Stockholm'], ['Reykjavík', 64.15, -21.94, 'Atlantic/Reykjavik'],
	['New York', 40.71, -74.01, 'America/New_York'], ['Toronto', 43.65, -79.38, 'America/Toronto'],
	['Chicago', 41.88, -87.63, 'America/Chicago'], ['Denver', 39.74, -104.99, 'America/Denver'],
	['Los Angeles', 34.05, -118.24, 'America/Los_Angeles'], ['Vancouver', 49.28, -123.12, 'America/Vancouver'],
	['Honolulu', 21.31, -157.86, 'Pacific/Honolulu'], ['Mexico City', 19.43, -99.13, 'America/Mexico_City'],
	['Bogotá', 4.71, -74.07, 'America/Bogota'], ['Lima', -12.05, -77.04, 'America/Lima'],
	['Santiago', -33.45, -70.67, 'America/Santiago'], ['Buenos Aires', -34.6, -58.38, 'America/Argentina/Buenos_Aires'],
	['São Paulo', -23.55, -46.63, 'America/Sao_Paulo'],
];
function guessPlace() {
	let tz = '';
	try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* none */ }
	const hit = CITIES.find((c) => c[3] === tz) || CITIES.find((c) => c[3].split('/')[0] === tz.split('/')[0]) || CITIES[0];
	return { name: hit[0], lat: hit[1], lon: hit[2], source: 'tz' };
}
// A link can carry a place in its fragment, #at=lat,lon&name=…, which browsers never send to the
// server (a ?at= query would be, so it isn't read). Both numbers must be present and well formed:
// "#at=," or "#at=12," is no place at all, not 0,0 or 12,0.
const NUM = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
function placeFromLink(hash = location.hash) {
	const q = new URLSearchParams(hash.replace(/^#/, '')), parts = (q.get('at') || '').split(',').map((s) => s.trim());
	if (parts.length !== 2 || !parts.every((s) => NUM.test(s))) return null;
	const lat = Number(parts[0]), lon = Number(parts[1]);
	if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	const name = (q.get('name') || '').trim().slice(0, 60);
	return { name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon, source: 'link' };
}

// ---- State ---------------------------------------------------------------------------------------------
const S = {
	place: placeFromLink() || guessPlace(),
	decl: 0,
	aimMode: 'drag',              // 'drag' until the compass gives readings, then 'sensor'
	az: 0, dep: 0,                // the drag-mode view: bearing, and degrees below the horizon (negative: up)
	zoom: 1,                      // × the tangent of the half field of view
	fade: 0,                      // the globe fading in once loaded
	look: null,                   // { az, dep, fwd (scene frame), hit: {lat, lon, km, arcKm} | null }
	ready: false, nogl: false, stream: null, started: false,
	globe: true,                  // false: the globe hidden, for the full sky
	target: null,                 // what Find is pointing to: { kind, key, name, v (Earth-fixed, for places on Earth) }
};
const src = new OrientationSource();
const P = new THREE.Vector3(), East = new THREE.Vector3(), North = new THREE.Vector3(), South = new THREE.Vector3();
const qBasis = new THREE.Quaternion(), qScene = new THREE.Quaternion();

// Earth-fixed unit vector for a latitude and longitude, in the axes SphereGeometry's UVs use.
const vec = (lat, lon) => new THREE.Vector3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG));
const latLon = (v) => ({ lat: Math.asin(Math.max(-1, Math.min(1, v.y))) / DEG, lon: Math.atan2(-v.z, v.x) / DEG });

function setPlace(p) {
	S.place = p;
	S.decl = declination(p.lat, p.lon, decimalYear());
	const f = p.lat * DEG, l = p.lon * DEG;
	P.copy(vec(p.lat, p.lon));
	East.set(-Math.sin(l), 0, -Math.cos(l));
	North.set(-Math.sin(f) * Math.cos(l), Math.cos(f), Math.sin(f) * Math.sin(l));
	South.copy(North).negate();
	qBasis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(East, P, South));
	if (uniforms) uniforms.eye.value.copy(P);
	if (anti) anti.v.copy(P).negate();
	$('placeName').textContent = p.name;
}

// ---- Renderer -------------------------------------------------------------------------------------------
const view = $('view');
let renderer = null, uniforms = null, anti = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.0005, 3);
try {
	renderer = new THREE.WebGLRenderer({ canvas: view, alpha: true, antialias: true });
	renderer.setClearColor(0x000000, 0);
	renderer.autoClear = false; // two passes a frame: the sky, then the globe over it
} catch (e) { S.nogl = true; }
SKY.attach(renderer, $('labels'));
if (renderer) {
	// sat: the imagery (until it arrives, satMix eases 0 → 1 over a plain ocean colour);
	// overlay: the coastlines, borders and graticule, with alpha.
	uniforms = { sat: { value: null }, overlay: { value: null }, satMix: { value: 0 }, eye: { value: new THREE.Vector3() }, fade: { value: 0 }, opacity: { value: 0.95 } };
	const mat = new THREE.ShaderMaterial({
		uniforms, side: THREE.BackSide, transparent: true, depthWrite: false,
		vertexShader: `varying vec2 vUv; varying vec3 vPos;
			void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
		fragmentShader: `uniform sampler2D sat; uniform sampler2D overlay; uniform float satMix;
			uniform vec3 eye; uniform float fade; uniform float opacity;
			varying vec2 vUv; varying vec3 vPos;
			void main() {
				float d = distance(vPos, eye);
				vec3 base = mix(vec3(0.05, 0.16, 0.26), min(texture2D(sat, vUv).rgb * 1.25, 1.0), satMix);
				vec4 ov = texture2D(overlay, vUv);
				vec3 c = mix(base, ov.rgb, ov.a) * mix(1.0, 0.85, smoothstep(0.6, 2.0, d));
				// Atmosphere: a blue haze where the sight line grazes the surface, softer close to home
				// (just under the horizon, where it would be a glaring band across a level view).
				float graze = 1.0 - clamp(dot(normalize(vPos), normalize(vPos - eye)), 0.0, 1.0);
				c += vec3(0.30, 0.52, 1.0) * pow(graze, 3.0) * 0.75 * mix(0.3, 1.0, smoothstep(0.16, 0.5, d));
				gl_FragColor = vec4(c, fade * opacity * smoothstep(0.05, 0.16, d));
			}`,
	});
	const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), mat);
	globe.renderOrder = 0;
	scene.add(globe);
	// The core: additive fresnel shells, brightest at their rims, so the far side stays clear.
	const shell = (r, color, k, order) => {
		const m = new THREE.Mesh(new THREE.SphereGeometry(r, 96, 48), new THREE.ShaderMaterial({
			uniforms: { fade: uniforms.fade, col: { value: new THREE.Color(color) } },
			transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
			vertexShader: `varying vec3 vN; varying vec3 vV;
				void main() { vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(position); vV = normalize(cameraPosition - w.xyz);
					gl_Position = projectionMatrix * viewMatrix * w; }`,
			fragmentShader: `uniform float fade; uniform vec3 col; varying vec3 vN; varying vec3 vV;
				void main() { float r = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(col * pow(r, 9.0) * ${k.toFixed(2)} * fade, 1.0); }`,
		}));
		m.renderOrder = order;
		scene.add(m);
	};
	shell(1 - 2891 / E.R, 0xff8a2a, 0.5, 1);   // outer core
	shell(1 - 5150 / E.R, 0xffe2a0, 0.45, 2);    // inner core
}

function resize() {
	const w = innerWidth, h = innerHeight;
	if (renderer) { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(w, h, false); SKY.setPixelRatio(renderer.getPixelRatio()); }
	camera.aspect = w / h;
	setFov();
}
// A phone camera sees about 67° along its long side; the view matches that, times the zoom.
function setFov() {
	const w = innerWidth, h = innerHeight, half = 33.5 * DEG, t = Math.tan(half) * S.zoom;
	camera.fov = 2 * Math.atan(h >= w ? t : t * h / w) / DEG;
	camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---- Toasts --------------------------------------------------------------------------------------------
const toastQ = [];
let toastBusy = false;
function toast(msg) { toastQ.push(msg); if (!toastBusy) nextToast(); }
function nextToast() {
	const t = $('toast'), msg = toastQ.shift();
	if (!msg) { toastBusy = false; t.classList.remove('show'); return; }
	toastBusy = true;
	t.textContent = msg;
	t.classList.add('show');
	setTimeout(() => { t.classList.remove('show'); setTimeout(nextToast, 300); }, toastQ.length ? 2000 : 3200);
}

// ---- Looking: the phone, or dragging ----------------------------------------------------------------------
// One attitude, qScene, drives both cameras: the sky's at the origin of the local frame, and the
// globe's at P, turned into Earth-fixed axes by qBasis.
const euler = new THREE.Euler(0, 0, 0, 'YXZ'), fwd = new THREE.Vector3();
function updateCamera() {
	if (S.aimMode === 'sensor') {
		const q = src.getCameraQuat(S.decl);
		if (q) qScene.set(q[0], q[1], q[2], q[3]);
	} else {
		euler.set(-S.dep * DEG, -S.az * DEG, 0, 'YXZ');
		qScene.setFromEuler(euler);
	}
	camera.position.copy(P);
	camera.quaternion.multiplyQuaternions(qBasis, qScene);
	camera.updateMatrixWorld(true);
	SKY.setView(qScene, camera.fov, camera.aspect, !!S.stream);
	fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
	const up = fwd.dot(P), az = (Math.atan2(fwd.dot(East), fwd.dot(North)) / DEG + 360) % 360, dep = -Math.asin(Math.max(-1, Math.min(1, up))) / DEG;
	let hit = null;
	if (up < -0.01) { // the line of sight meets the far side at P + t·fwd, t = −2·(P·fwd)
		const t = -2 * up, X = fwd.clone().multiplyScalar(t).add(P), ll = latLon(X);
		hit = { ...ll, km: t * E.R, arcKm: 2 * dep * DEG * E.R };
	}
	S.look = { az, dep, fwd: new THREE.Vector3(0, 0, -1).applyQuaternion(qScene), hit };
}
{
	// Drag the globe (grab and move), wheel or pinch to zoom.
	const ptrs = new Map();
	let pinch0 = null;
	view.addEventListener('pointerdown', (e) => {
		ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
		if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: S.zoom }; }
	});
	addEventListener('pointermove', (e) => {
		const p = ptrs.get(e.pointerId);
		if (!p) return;
		if (ptrs.size === 2 && pinch0) {
			p.x = e.clientX; p.y = e.clientY;
			const [a, b] = [...ptrs.values()];
			setZoom(pinch0.zoom * pinch0.d / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)));
			return;
		}
		const k = camera.fov / innerHeight; // degrees per pixel, so the view follows the finger
		// A real drag (not a tap) while the compass is aiming takes over by hand from where it points.
		if (S.aimMode === 'sensor' && ptrs.size === 1 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 12) chooseDrag();
		if (S.aimMode === 'drag') {
			aimAnim = null;
			S.az = ((S.az - (e.clientX - p.x) * k) % 360 + 360) % 360;
			S.dep = Math.min(90, Math.max(-90, S.dep - (e.clientY - p.y) * k));
		}
		p.x = e.clientX; p.y = e.clientY;
	});
	const end = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; };
	addEventListener('pointerup', end); addEventListener('pointercancel', end);
	view.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(S.zoom * Math.exp(e.deltaY * 0.0012)); }, { passive: false });
	addEventListener('keydown', (e) => {
		// Not while typing, nor while a dialog is open: there the arrow keys scroll and move focus.
		if (e.target.closest('input, select, textarea, dialog') || document.querySelector('dialog[open]')) return;
		const k = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, -3], ArrowDown: [0, 3] }[e.key];
		if (!k) return;
		if (S.aimMode === 'sensor') chooseDrag();
		aimAnim = null;
		S.az = ((S.az + k[0]) % 360 + 360) % 360; S.dep = Math.min(90, Math.max(-90, S.dep + k[1]));
		e.preventDefault();
	});
}
function setZoom(z) { S.zoom = Math.min(1.5, Math.max(0.2, z)); setFov(); }

// ---- Sensors, camera, location (all asked for inside the Start tap) ------------------------------------
// Aiming: the compass, or dragging. The compass takes over once it gives readings. Dragging the
// view, the arrow keys or the button under the top bar switch to dragging from wherever the view
// points, and the button switches back. If readings stop (a permission taken away, a sensor that
// goes quiet) for STALE ms, the view drops to dragging by itself, and returns to the compass when
// they resume, unless the visitor chose to drag. Readings are timestamped here, from the same
// events orientation.js listens to, so its shared copy stays as orrery.live has it.
const STALE = 3000;
let lastReading = -1e9, userDrag = false, autoDrag = false;
// Only readings the compass can use count: all three angles, and either an absolute reading
// (Android) or an iPhone compass heading. A relative stream that carries on, or null readings,
// don't keep compass mode alive.
const reading = (e) => {
	if (Number.isFinite(e.alpha) && Number.isFinite(e.beta) && Number.isFinite(e.gamma) && (e.absolute === true || Number.isFinite(e.webkitCompassHeading))) lastReading = performance.now();
};
addEventListener('deviceorientation', reading);
addEventListener('deviceorientationabsolute', reading);
// A page coming back from the background gets a moment for the readings to restart.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lastReading = Math.max(lastReading, performance.now()); });
const compassLive = () => src.status === 'ok' && performance.now() - lastReading < STALE;
function toDrag() {
	if (S.aimMode !== 'drag' && S.look) { S.az = S.look.az; S.dep = Math.max(-90, Math.min(90, S.look.dep)); } // keep looking where the phone pointed
	S.aimMode = 'drag';
	modeUi();
}
function toCompass() { S.aimMode = 'sensor'; aimAnim = null; userDrag = autoDrag = false; modeUi(); }
function chooseDrag() {
	if (S.aimMode !== 'sensor') return;
	userDrag = true; autoDrag = false;
	toDrag();
	toast('Dragging now: tap “Use compass” to follow the phone again');
}
function modeUi() {
	const b = $('modeBtn');
	b.hidden = !(src.status === 'ok' || autoDrag); // only on a phone whose compass has worked
	b.textContent = S.aimMode === 'sensor' ? 'Drag instead' : 'Use compass';
}
$('modeBtn').addEventListener('click', () => {
	if (S.aimMode === 'sensor') chooseDrag();
	else if (compassLive()) toCompass();
	else toast('The compass isn’t giving readings just now: keep dragging, or try again in a moment');
});
// Called each frame: drop to dragging if the readings have stopped, and back when they resume.
function watchCompass() {
	if (S.aimMode === 'sensor' && !compassLive()) {
		autoDrag = true;
		toDrag();
		toast('The compass has stopped: drag to look around');
	} else if (S.aimMode === 'drag' && autoDrag && !userDrag && compassLive()) {
		toCompass();
		toast('The compass is back');
	}
}
src.onstatus = (st) => {
	if (st === 'ok' && S.aimMode !== 'sensor' && !userDrag) { toCompass(); toast('Point your phone up at the sky, or down at the ground'); }
	if ((st === 'unsupported' || st === 'denied' || st === 'relative-only') && S.started) toast(st === 'denied' ? 'Motion sensors are off for this site: drag the view instead' : 'No compass here: drag the view to look around');
	modeUi();
};
// The camera. Only one request can be in flight (camPending, with the Cam button disabled), and
// each request carries a token: stopCamera() bumps it, so a stream that arrives after the visitor
// has turned the camera off (or after a newer request) is stopped at once rather than left
// running unreachable. A track that ends by itself (another app takes the camera, the OS
// revokes it) turns the camera off here too. Capture only stops when every track is stopped.
let camToken = 0, camPending = false;
function camUi(on) {
	$('cam').classList.toggle('on', on);
	$('camBtn').setAttribute('aria-pressed', String(on));
	$('camBtn').disabled = camPending;
}
async function startCamera() {
	if (S.stream || camPending) return;
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('No camera available: showing the plain view'); return; }
	const token = ++camToken;
	camPending = true; camUi(false);
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
		if (token !== camToken) { stream.getTracks().forEach((t) => t.stop()); return; } // stopped meanwhile
		S.stream = stream;
		for (const t of stream.getTracks()) t.addEventListener('ended', () => { if (S.stream === stream) { stopCamera(); toast('The camera was turned off'); } });
		const v = $('cam');
		v.srcObject = stream;
		camPending = false; camUi(true);
		await v.play().catch(() => {});
	} catch (e) {
		if (token !== camToken) return;
		toast('Camera unavailable or blocked: showing the plain view');
	} finally {
		if (token === camToken && camPending) { camPending = false; camUi(!!S.stream); }
	}
}
function stopCamera() {
	camToken++; // any request still in flight is now stale
	camPending = false;
	const s = S.stream;
	S.stream = null;
	if (s) s.getTracks().forEach((t) => t.stop());
	const v = $('cam');
	v.pause();
	v.srcObject = null;
	camUi(false);
}
addEventListener('pagehide', stopCamera);

// Location. Each request gets a generation number, and choosing a place (a city, or a #at= link)
// moves the generation on, so a GPS fix that arrives later can't override the visitor's choice.
let locGen = 0;
function choosePlace(p) { locGen++; setPlace(p); }
function askLocation(quiet) {
	if (!navigator.geolocation) { if (!quiet) toast('Location is not available here: pick a city'); return; }
	const gen = ++locGen;
	navigator.geolocation.getCurrentPosition((pos) => {
		if (gen !== locGen) return;
		const lat = Math.round(pos.coords.latitude * 100) / 100, lon = Math.round(pos.coords.longitude * 100) / 100;
		setPlace({ name: 'Your location', lat, lon, source: 'gps' });
	}, () => {
		if (gen !== locGen || quiet) return;
		toast(`Couldn't get your location: looking from ${S.place.name}. Tap it to change.`);
	}, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}
addEventListener('hashchange', () => { const p = placeFromLink(); if (p) choosePlace(p); });
let wakeLock = null;
async function keepAwake() {
	try { if (navigator.wakeLock && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* optional */ }
}
document.addEventListener('visibilitychange', () => { if (S.started && document.visibilityState === 'visible') keepAwake(); });

function start(withCamera) {
	// Everything that needs the user gesture starts before the first await.
	const orient = src.start();
	if (withCamera) startCamera();
	if (S.place.source !== 'link') askLocation(false);
	keepAwake();
	S.started = true;
	closeSheet($('intro'));
	return orient;
}
$('startBtn').addEventListener('click', () => start(true));
$('startNoCam').addEventListener('click', () => start(false));
$('camBtn').addEventListener('click', () => (S.stream ? stopCamera() : startCamera()));

// ---- Sheets -------------------------------------------------------------------------------------------
// Native modal dialogs (showModal): focus moves in, stays in, and the rest of the page is inert
// until they close; Escape closes them. The intro can't be dismissed without choosing how to
// start. Focus goes back to whatever opened a dialog.
let lastFocus = null;
function openSheet(el) {
	lastFocus = document.activeElement;
	if (!el.open) el.showModal();
}
function closeSheet(el) { if (el.open) el.close(); }
for (const sh of document.querySelectorAll('dialog.sheet')) {
	// A click on the dialog element itself (not its contents) is a click on the backdrop.
	sh.addEventListener('click', (e) => { if (e.target === sh && sh.id !== 'intro') closeSheet(sh); });
	sh.addEventListener('close', () => { if (lastFocus && lastFocus.isConnected && lastFocus !== document.body) lastFocus.focus(); lastFocus = null; });
	const c = sh.querySelector('.close');
	if (c) c.addEventListener('click', () => closeSheet(sh));
}
$('intro').addEventListener('cancel', (e) => e.preventDefault());
$('infoBtn').addEventListener('click', () => openSheet($('about')));
$('placeBtn').addEventListener('click', () => openSheet($('placeSheet')));
$('gpsBtn').addEventListener('click', () => { askLocation(false); closeSheet($('placeSheet')); });
$('findBtn').addEventListener('click', () => { openSheet($('findSheet')); $('findInput').select(); });

// Results for both search sheets: a button per result, with its name and a grey line under it.
function resultList(box, items, pick) {
	box.replaceChildren(...items.map((it) => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'res';
		const n = document.createElement('span'), w = document.createElement('span');
		n.className = 'rn'; n.textContent = it.name;
		w.className = 'rw'; w.textContent = it.sub;
		b.append(n, w);
		b.addEventListener('click', () => pick(it));
		return b;
	}));
}

// "Where are you looking from?": any town, city or address, looked up online (places.js), as on
// weathermodels.app. Each search takes a number, so a slow answer can't replace a newer one.
let placeSeq = 0;
$('placeForm').addEventListener('submit', async (e) => {
	e.preventDefault();
	const q = $('placeInput').value.trim();
	if (!q) return;
	const mine = ++placeSeq, status = $('placeStatus'), box = $('placeResults');
	box.replaceChildren();
	status.textContent = `Searching for “${q}”…`;
	try {
		const list = await geocode(q);
		if (mine !== placeSeq) return;
		status.textContent = list.length ? '' : `No places found for “${q}”.`;
		resultList(box, list.map((p) => ({ ...p, sub: [p.type, p.where].filter(Boolean).join(' · ') || `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}` })), (p) => {
			choosePlace({ name: p.name.slice(0, 60), lat: p.lat, lon: p.lon, source: 'search' });
			closeSheet($('placeSheet'));
		});
	} catch (err) {
		if (mine !== placeSeq) return;
		status.textContent = `The search didn't work (${err.message}). Check the connection and try again.`;
	}
});

// The globe on or off. Off shows the full sky: below the horizon the dark sky beyond the far side
// of the Earth, with its stars and names. Remembered in this browser only.
const PREFS = 'lud-prefs-v1';
// Anything else stored under the key (true, 1, "text", [], a non-boolean globe) is ignored.
let prefs = {};
try {
	const raw = JSON.parse(localStorage.getItem(PREFS) || '{}');
	if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.globe === 'boolean') prefs = { globe: raw.globe };
} catch (e) { prefs = {}; }
function setGlobe(on) {
	S.globe = !!on;
	SKY.setFullSky(!S.globe);
	const b = $('globeBtn');
	b.setAttribute('aria-pressed', String(S.globe));
	b.title = S.globe ? 'Hide the Earth to see the whole sky' : 'Show the glass Earth';
	prefs.globe = S.globe;
	try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) { /* private mode: not kept */ }
}
$('globeBtn').addEventListener('click', () => setGlobe(!S.globe));
setGlobe(prefs.globe !== false);

// Find: the Sun, Moon and planets, named stars, constellations, countries and oceans, searched
// here on the phone as you type. Picking one aims the view at it when dragging; with the compass
// an arrow at the edge shows which way to turn. A ring marks it until the chip at the top clears it.
// Places on Earth are aimed at through the Earth, so picking one turns the globe back on.
const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^the /, '').trim();
let findIndex = null, findHasEarth = false;
function buildFindIndex() {
	const items = SKY.skyItems(), seen = new Set();
	for (const l of labels) {
		if (l.kind === 'opp' || seen.has(l.text)) continue; // the oceans have several label points: the first
		seen.add(l.text);
		items.push({ kind: 'earth', key: l.text, name: l.text, sub: l.kind === 'sea' ? 'ocean' : 'country or territory', v: l.v, rank: 2 });
	}
	for (const it of items) { it.f = fold(it.name); it.fa = it.also ? fold(it.also) : ''; }
	findHasEarth = labels.length > 0;
	return items;
}
function findMatches(q) {
	const f = fold(q);
	if (!f) return [];
	if (!findIndex || (!findHasEarth && labels.length)) findIndex = buildFindIndex();
	const scored = [];
	for (const it of findIndex) {
		const sc = it.f === f || it.fa === f ? 0 : it.f.startsWith(f) ? 1 : it.f.split(/[\s-]+/).some((w) => w.startsWith(f)) ? 2 : it.f.includes(f) ? 3 : -1;
		if (sc >= 0) scored.push([sc, it]);
	}
	scored.sort((a, b) => a[0] - b[0] || a[1].rank - b[1].rank || a[1].name.length - b[1].name.length);
	return scored.slice(0, 12).map((x) => x[1]);
}
function showFind() {
	const q = $('findInput').value, list = findMatches(q);
	resultList($('findResults'), list, pickTarget);
	$('findStatus').textContent = !q.trim() ? '' : list.length ? '' : `Nothing called “${q.trim()}” here.`;
}
$('findInput').addEventListener('input', showFind);
$('findForm').addEventListener('submit', (e) => { e.preventDefault(); const list = findMatches($('findInput').value); if (list.length) pickTarget(list[0]); });
$('targetChip').addEventListener('click', () => setTarget(null));

const tDir = new THREE.Vector3(), qInv = new THREE.Quaternion();
// The target's direction now, in the scene frame (unit), or null.
function targetDir() {
	const t = S.target;
	if (!t) return null;
	if (t.kind !== 'earth') return SKY.skyDir(t.kind, t.key, tDir);
	tDir.copy(t.v).sub(P); // through the Earth, from here
	if (tDir.lengthSq() < 1e-8) return null;
	return tDir.normalize().applyQuaternion(qInv.copy(qBasis).invert());
}
function setTarget(t) {
	S.target = t;
	SKY.setMarked(t && t.kind !== 'earth' ? { kind: t.kind, key: t.key } : null);
	$('targetChip').hidden = !t;
	if (t) $('targetName').textContent = t.name;
}
function pickTarget(it) {
	closeSheet($('findSheet'));
	if (it.kind === 'earth' && !S.globe) setGlobe(true);
	setTarget({ kind: it.kind, key: it.key, name: it.name, v: it.v });
	const d = targetDir();
	if (!d) { toast("That's where you are"); return; }
	if (S.aimMode === 'drag') aimTowards(d);
}
// Drag mode: swing the view round to a direction, eased (at once with reduced motion).
let aimAnim = null;
function aimTowards(d) {
	const az = (Math.atan2(d.x, -d.z) / DEG + 360) % 360, dep = -Math.asin(Math.max(-1, Math.min(1, d.y))) / DEG;
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) { S.az = az; S.dep = dep; aimAnim = null; return; }
	const from = { az: S.az, dep: S.dep }, dAz = ((az - from.az + 540) % 360) - 180, t0 = performance.now();
	aimAnim = (now) => {
		const k = Math.min(1, (now - t0) / 700), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
		S.az = (from.az + dAz * e + 360) % 360;
		S.dep = from.dep + (dep - from.dep) * e;
		if (k >= 1) aimAnim = null;
	};
}
// The ring on the target when it's on screen, or an arrow at the edge pointing the way to turn.
const _t = new THREE.Vector3(), qCam = new THREE.Quaternion();
function placeTarget() {
	const mk = $('targetMark'), ar = $('targetArrow'), d = targetDir();
	if (!d) { mk.hidden = ar.hidden = true; return; }
	_t.copy(d).multiplyScalar(SKY.R * 0.9).project(SKY.camera);
	const behind = _t.z > 1, x = _t.x, y = _t.y;
	if (!behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.88) {
		const px = (x + 1) / 2 * innerWidth, py = (1 - y) / 2 * innerHeight;
		mk.hidden = false; ar.hidden = true;
		mk.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
		SKY.claim(px, py, 44, 44);
		return;
	}
	// Off screen: the way to turn is the target's direction in the camera's own frame (x right,
	// y up), not its projected point, which far off-axis is stretched and behind is mirrored. The
	// arrow goes where a line from the middle of the screen that way leaves a box inset from the
	// edges and the top bar, stopping short of the card if it would end on it, so its angle holds.
	const c = _t.copy(d).applyQuaternion(qCam.copy(SKY.camera.quaternion).invert());
	let ux = c.x, uy = -c.y;
	const n = Math.hypot(ux, uy);
	if (n < 1e-6) { ux = 0; uy = 1; } else { ux /= n; uy /= n; } // straight behind: point down
	const cx = innerWidth / 2, cy = innerHeight / 2;
	const hud = $('hudTop').getBoundingClientRect(), card = $('card').getBoundingClientRect();
	const top = Math.min(cy - 20, hud.bottom + 30), bottom = innerHeight - 40;
	let t = Infinity;
	if (ux > 0) t = Math.min(t, (innerWidth - 56 - cx) / ux);
	if (ux < 0) t = Math.min(t, (56 - cx) / ux);
	if (uy > 0) t = Math.min(t, (bottom - cy) / uy);
	if (uy < 0) t = Math.min(t, (top - cy) / uy);
	let px = cx + ux * t, py = cy + uy * t;
	if (uy > 0 && py > card.top - 34 && px > card.left - 50 && px < card.right + 50 && card.top - 34 > cy + 20) {
		t = (card.top - 34 - cy) / uy;
		px = cx + ux * t; py = cy + uy * t;
	}
	mk.hidden = true; ar.hidden = false;
	ar.style.transform = `translate(${px.toFixed(0)}px, ${py.toFixed(0)}px)`;
	$('targetArrowHead').style.transform = `rotate(${(Math.atan2(uy, ux) / DEG + 90).toFixed(1)}deg)`;
	$('targetArrowName').textContent = S.target.name;
	SKY.claim(px, py, 90, 60);
}

// ---- The world: texture, place lookup, labels -------------------------------------------------------------
// Memory. The imagery is NASA Blue Marble 4096×2048 everywhere (about 32 MiB decoded, plus its
// GPU copy and mipmaps); the 8192 version (128 MiB decoded) is no longer used. The line overlay
// is a 4096-wide canvas on desktops and 2048 on phones, tablets (iPadOS reports itself as a Mac,
// so touch points give it away) and devices with 4 GB or less. Each decode or canvas that fails
// to allocate is retried smaller. Once three.js has uploaded a texture (its onUpdate callback,
// which runs after the upload and mipmaps), the decoded bitmap is closed, as three.js leaves
// ImageBitmap.close() to the app, and the overlay canvas is shrunk to nothing. Neither can be
// re-uploaded after that, so a lost-and-restored WebGL context rebuilds both from scratch.
const UA = navigator.userAgent;
const MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1) || matchMedia('(pointer: coarse)').matches;
const LOW_MEM = !!(navigator.deviceMemory && navigator.deviceMemory <= 4);
const MAX_TEX = renderer ? renderer.capabilities.maxTextureSize : 0;
const sizes = (first) => [first, 2048, 1024].filter((w, i, a) => w <= Math.max(first, 1024) && a.indexOf(w) === i);
S.tex = { overlay: 0, sat: 0, satClosed: false, builds: 0 };
const getTopo = () => fetch('data/countries-10m.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

async function loadSatellite() {
	const resp = await fetch('data/bm-4096.jpg');
	if (!resp.ok) throw new Error(resp.status);
	const blob = await resp.blob();
	let bitmap = null;
	for (const w of sizes(Math.min(4096, MAX_TEX))) {
		try {
			// Decoded with createImageBitmap (an <img> from a blob: URL would need a wider CSP),
			// flipped at decode because three.js ignores flipY for bitmaps.
			bitmap = await createImageBitmap(blob, w >= 4096 ? { imageOrientation: 'flipY' } : { imageOrientation: 'flipY', resizeWidth: w, resizeHeight: w / 2, resizeQuality: 'high' });
			break;
		} catch (e) { /* too big for this device: try smaller */ }
	}
	if (!bitmap) throw new Error('could not decode the imagery');
	const tex = new THREE.Texture(bitmap);
	tex.flipY = false; // colours pass through untouched, like the canvas textures
	tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
	tex.onUpdate = () => { bitmap.close(); S.tex.satClosed = true; };
	tex.needsUpdate = true;
	setTex('sat', tex);
	S.tex.sat = bitmap.width;
	S.satTarget = 1;
}
function canvasTexture(paint, first) {
	for (const w of sizes(Math.min(first, MAX_TEX))) {
		let cv = null;
		try { cv = paint(w); } catch (e) { continue; } // canvas too big for this device: try smaller
		const tex = new THREE.CanvasTexture(cv);
		tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
		tex.onUpdate = () => { cv.width = cv.height = 0; }; // on the GPU now: free the canvas
		return { tex, w };
	}
	return null;
}
function setTex(name, tex) {
	const old = uniforms[name].value;
	uniforms[name].value = tex;
	if (old && old !== tex) old.dispose();
}
async function buildTextures(topoP) {
	S.tex.builds++;
	const sat = loadSatellite(); // the download starts at once, alongside the map data
	// The Milky Way (the same 4k picture as the night sky's, decoded and freed the same way).
	SKY.loadMilkyWay(sizes(Math.min(4096, MAX_TEX))).catch(() => { /* the sky works without it */ });
	const topo = await topoP;
	const ov = canvasTexture((w) => paintOverlay(topo, window.topojson, w), MOBILE || LOW_MEM ? 2048 : 4096);
	if (ov) { setTex('overlay', ov.tex); S.tex.overlay = ov.w; }
	try { await sat; } catch (e) {
		// No imagery: the coloured map stands in for it.
		const pol = canvasTexture((w) => paintGlobe(topo, window.topojson, w), 2048);
		if (pol) { setTex('sat', pol.tex); S.satTarget = 1; }
	}
}
if (renderer) {
	view.addEventListener('webglcontextlost', () => { S.satTarget = 0; uniforms.satMix.value = 0; setTex('sat', null); setTex('overlay', null); SKY.dropMilkyWay(); });
	view.addEventListener('webglcontextrestored', () => { buildTextures(getTopo()).catch(() => toast("Couldn't reload the map after a graphics reset")); });
}

// The map of the world: the country outlines behind the names, the place lookup, Find's
// countries and the line overlay. If it fails to load, the Earth card says so, with a Try again
// button (S.worldError), rather than "Loading the world…" for ever.
let labels = [];
function loadWorld() {
	S.worldError = false;
	const topoP = getTopo();
	topoP
		.then((topo) => new Promise((ok) => setTimeout(() => ok(topo), 30)))
		.then((topo) => {
			G.load(topo, window.topojson);
			// Find aims at these, so each must lie in its country by the lookup the card uses.
			labels = labelPoints(topo, window.topojson, (name, lat, lon) => G.countryAt(lat, lon) === name).map((l) => ({ text: l.name, v: vec(l.lat, l.lon), size: Math.sqrt(l.area) * DEG, kind: 'land' }));
			for (const [text, lat, lon] of OCEANS) labels.push({ text, v: vec(lat, lon), size: 1, kind: 'sea' });
			anti = { text: 'Exact opposite side', v: P.clone().negate(), size: 9, kind: 'opp' };
			findIndex = null;
			S.ready = true;
		})
		.catch(() => { S.worldError = true; toast("Couldn't load the map of the world"); });
	if (renderer) buildTextures(topoP).catch(() => {});
}
loadWorld();
$('retryBtn').addEventListener('click', () => { if (!S.ready) { loadWorld(); readouts(); } });

// Names. All of them share one declutter (skyview.js's claim grid): the top bar and the card are
// taken first, then the sky's bodies and compass points, then the globe's names (the
// opposite-side marker, which may sit on the reticle, then countries and oceans, biggest first),
// then the sky's stars and constellations. Countries only appear where the globe is solid: more
// than ~1,600 km away and drawn more than 22 px across.
const pool = [], labelBox = $('labels');
function labelEl(i) {
	if (!pool[i]) { const d = document.createElement('div'); d.className = 'pl'; labelBox.append(d); pool[i] = { el: d, text: '', cls: '' }; }
	return pool[i];
}
const tmp = new THREE.Vector3(), camSpace = new THREE.Vector3();
let nEarth = 0;
function placeEarthLabels() {
	const w = innerWidth, h = innerHeight, focal = h / (2 * Math.tan(camera.fov * DEG / 2));
	nEarth = 0;
	const list = !labels.length || !S.globe ? [] : anti ? [anti, ...labels] : labels;
	let reticleTaken = false;
	for (const l of list) {
		if (nEarth >= 32) break;
		if (!reticleTaken && l !== anti) { SKY.claim(w / 2, h / 2, 48, 48); reticleTaken = true; }
		const d = l.v.distanceTo(P);
		if (d < 0.25) continue;
		camSpace.copy(l.v).applyMatrix4(camera.matrixWorldInverse);
		if (camSpace.z > -0.01) continue;
		const px = l.kind === 'land' ? l.size / d * focal : 999;
		if (px < 22) continue;
		tmp.copy(l.v).project(camera);
		// What Find picked has its name dropped below the ring drawn round it.
		const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h + (S.target && S.target.kind === 'earth' && S.target.key === l.text ? 36 : 0);
		const big = l.kind === 'land' && px > 160, opp = l.kind === 'opp';
		const fs = l.kind === 'sea' ? 11 : big ? 15 : 13, bw = l.text.length * fs * 0.6 + (opp ? 34 : 10), bh = fs + 8;
		// Names are centred on their point; the opposite-side marker's ring is centred on it instead,
		// with the words to its right, clear of the reticle (tte.css: a 14 px ring in a 16 px line).
		const left = opp ? x - 7 : x - bw / 2;
		if (left < 4 || left + bw > w - 4 || y - bh / 2 < 0 || y + bh / 2 > h) continue;
		if (!SKY.claim(left + bw / 2, y, bw, bh)) continue;
		const p = labelEl(nEarth++), cls = 'pl' + (l.kind === 'sea' ? ' sea' : opp ? ' opp' : big ? ' big' : '');
		if (p.text !== l.text) { p.el.textContent = l.text; p.text = l.text; }
		if (p.cls !== cls) { p.el.className = cls; p.cls = cls; }
		p.el.style.transform = opp ? `translate(${left.toFixed(1)}px, ${(y - 8).toFixed(1)}px)` : `translate(${(left + 5).toFixed(1)}px, ${(y - bh / 2).toFixed(1)}px)`;
		p.el.style.opacity = String(Math.min(1, S.fade * 1.2));
		p.el.hidden = false;
	}
	if (!reticleTaken) SKY.claim(w / 2, h / 2, 48, 48);
	for (let i = nEarth; i < pool.length; i++) pool[i].el.hidden = true;
}
function placeLabels() {
	SKY.resetOcc();
	SKY.claimRect($('hudTop').getBoundingClientRect());
	SKY.claimRect($('card').getBoundingClientRect());
	placeTarget();
	SKY.placeLabels(placeEarthLabels);
}

// ---- Readouts ---------------------------------------------------------------------------------------------
// The card names what is under the reticle: in the sky (a body, a bright star or the
// constellation), or, from 2° below the horizon, the place on the far side of the Earth.
function readouts() {
	const L = S.look;
	if (!L) return;
	$('aimText').textContent = L.dep > 88 ? 'Looking straight down' : L.dep < -88 ? 'Looking straight up'
		: L.dep >= 0 ? `Looking ${Math.round(L.az)}° ${point(L.az)} · ${Math.round(L.dep)}° down`
		: `Looking ${Math.round(L.az)}° ${point(L.az)} · ${Math.round(-L.dep)}° up`;
	const cal = $('calib');
	const showCal = src.calibrating || (src.accuracy !== null && src.accuracy > 25 && src.status === 'ok');
	cal.hidden = !showCal;
	if (showCal) cal.textContent = src.calibrating ? 'Settling the compass: hold the phone flat over the floor for a moment.' : 'The compass is unsure here: move the phone in a figure of eight, away from metal.';
	const card = $('card'), earth = S.globe && !!L.hit && L.dep >= EARTH_FROM;
	card.classList.toggle('sky', !earth);
	$('retryBtn').hidden = !(earth && S.worldError && !S.ready);
	if (!earth) {
		const d = SKY.describe(L.fwd);
		$('cKicker').textContent = d.kicker;
		$('cName').textContent = d.name;
		$('cName').style.color = d.color;
		$('cDetail').textContent = d.detail;
		return;
	}
	$('cName').style.color = '';
	if (!S.ready) {
		const failed = !!S.worldError;
		$('cKicker').textContent = failed ? 'The map of the world didn’t load' : 'One moment';
		$('cName').textContent = failed ? 'No map to show' : 'Loading the world…';
		$('cDetail').textContent = failed ? 'Check the connection, then try again.' : '';
		return;
	}
	const where = G.whereIs(L.hit.lat, L.hit.lon), deep = E.deepestPoint(L.dep);
	const through = deep > 5150 ? 'through both cores' : deep > 2891 ? 'through the outer core' : deep > 660 ? 'through the lower mantle' : deep > 35 ? 'through the upper mantle' : 'through the crust';
	// A Sun, Moon or planet in the same direction, out beyond the far side, or what Find picked.
	const b = SKY.bodyAt(L.fwd);
	let beyond = b ? SKY.bodyTitle(b).replace(/^The /, 'the ') : '';
	if (!beyond && S.target && S.target.kind !== 'earth') {
		const d = targetDir();
		if (d && d.angleTo(L.fwd) < 6 * camera.fov / 67 * DEG) beyond = S.target.name;
	}
	$('cKicker').textContent = (L.dep > 88 ? 'Straight down, the other side of the world' : 'Straight through the Earth') + (beyond ? ` · ${beyond} beyond` : '');
	$('cName').textContent = cap(where.name);
	$('cDetail').textContent = `${nf(L.hit.km)} km away in a straight line, ${through} (${nf(L.hit.arcKm)} km round the surface)`;
}

// ---- The frame loop -----------------------------------------------------------------------------------------
// The sky is worked out for now once a second (and at once when the place changes): the
// stars move a quarter of a degree a minute, the Moon about half that against them.
let lastT = performance.now(), lastDom = 0, lastSky = -1e9, skyPlace = null;
function frame(now) {
	const dt = Math.min((now - lastT) / 1000, 0.1);
	lastT = now;
	if (now - lastSky > 1000 || skyPlace !== S.place) {
		lastSky = now; skyPlace = S.place;
		SKY.setTime(dateToDays(new Date()), S.place.lat, S.place.lon);
	}
	if (aimAnim) aimAnim(now);
	watchCompass();
	updateCamera();
	S.fade += (1 - S.fade) * Math.min(1, dt * 4);
	if (renderer) {
		uniforms.satMix.value += ((S.satTarget || 0) - uniforms.satMix.value) * Math.min(1, dt * 3);
		uniforms.fade.value = S.fade;
		uniforms.opacity.value = S.stream ? 0.8 : 0.95;
		renderer.clear();
		renderer.render(SKY.scene, SKY.camera);
		if (S.globe) {
			renderer.clearDepth();
			renderer.render(scene, camera);
		}
	}
	placeLabels();
	if (now - lastDom > 100) { lastDom = now; readouts(); }
	requestAnimationFrame(frame);
}

setPlace(S.place);
S.az = S.place.lat >= 0 ? 180 : 0; // start facing the equator, with the horizon across the middle
resize();
if (S.nogl) toast("This browser can't draw the sky and the globe (no WebGL): the names and the card still work");
if (!window.DeviceOrientationEvent || !('ontouchstart' in window)) $('introHint').textContent = 'No motion sensors here? Drag the view to look around, and scroll to zoom.';
openSheet($('intro'));
requestAnimationFrame(frame);

window.__TTE = {
	S, src, SKY,
	setAim(az, dep) { S.aimMode = 'drag'; S.az = az; S.dep = dep; },
	setPlace,
	placeFromLink,
	startCamera, stopCamera,
	get camPending() { return camPending; },
	get ready() { return S.ready; },
	visibleLabels() { return pool.filter((p) => !p.el.hidden).map((p) => p.text); },
	skyLabels() { return [...labelBox.children].filter((el) => !el.hidden && !el.classList.contains('pl')).map((el) => el.textContent); },
	setGlobe,
	get compassLive() { return compassLive(); },
	loadWorld,
	find: (q) => findMatches(q).map((it) => ({ name: it.name, sub: it.sub, kind: it.kind })),
	get aiming() { return !!aimAnim; },
	targetInCamera() { const d = targetDir(); return d ? d.clone().applyQuaternion(SKY.camera.quaternion.clone().invert()).toArray() : null; },
	targetUi() { return { chip: !$('targetChip').hidden, mark: !$('targetMark').hidden, arrow: !$('targetArrow').hidden, name: S.target && S.target.name }; },
};
