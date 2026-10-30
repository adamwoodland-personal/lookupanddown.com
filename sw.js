// Service worker for lookupanddown.com (same pattern as whatsacross.com / orrery.live).
//
//  - Code, data and navigations: NETWORK-FIRST, cache fallback. Everything the page needs is
//    precached (the code, three.js, the 3.7 MB country map, the Earth imagery and the Milky Way),
//    so the sky and the glass Earth both work offline once the page has been opened. Only the
//    place search (Photon, Open-Meteo) needs a connection; cross-origin requests aren't touched.
//  - Images, and the two pictures the page fetch()es (destination ""): CACHE-FIRST.
//  - Bump CACHE on every deploy that changes a precached file.
const CACHE = 'lud-v2';
const CORE = [
	'/',
	'/index.html',
	'/tte.css',
	'/tte.js',
	'/skyview.js',
	'/places.js',
	'/earth.js',
	'/geo.js',
	'/texture.js',
	'/orientation.js',
	'/guide-orbits.js',
	'/stars.js',
	'/constellations.js',
	'/sky/astro.js',
	'/sky/vsop87.js',
	'/sky/constellation-names.js',
	'/lib/three.module.js',
	'/lib/three.core.js',
	'/lib/topojson-client.min.js',
	'/data/countries-10m.json',
	'/data/bm-4096.jpg',
	'/data/milkyway-gaia-4k.jpg',
	'/favicon.svg',
	'/icon-192.png',
	'/manifest.json'
];

self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e) => {
	const req = e.request;
	if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

	if (req.destination === 'image' || /\/data\/.+\.jpg$/.test(new URL(req.url).pathname)) {
		e.respondWith(
			caches.open(CACHE).then(async (c) => {
				const hit = await c.match(req);
				if (hit) return hit;
				const res = await fetch(req);
				// waitUntil, so the worker isn't stopped before the write lands.
				if (res.ok) e.waitUntil(c.put(req, res.clone()));
				return res;
			})
		);
		return;
	}

	e.respondWith(
		fetch(req)
			.then((res) => {
				if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy))); }
				return res;
			})
			.catch(async () => {
				// ignoreSearch: a navigation can carry a query; the shell is the same page.
				const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
				if (hit) return hit;
				if (req.mode === 'navigate') { const shell = await caches.match('/index.html'); if (shell) return shell; }
				return Response.error();
			})
	);
});
