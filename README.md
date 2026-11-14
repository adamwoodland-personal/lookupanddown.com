# Look Up and Down

**https://lookupanddown.com/**

Point your phone up to see the sky above you, right now: the Sun, the Moon, the planets, the stars, the constellations and the Milky Way. Point it down and the Earth turns to glass, so you see straight through it to the other side of the world, from underneath.

Night mode (the ☾ button) draws the night sky even in the daytime, so the stars, the constellations and the Milky Way show where they really are; with the camera on, the camera picture is dimmed so they show over it.

Share, on the card, sends a link to the place and to what the view is on: whoever opens it is turned to the same thing (a planet or star where it is in the sky when the link is opened; a place through the Earth in exactly the same direction). The place in the link is rounded to 0.01° (about a kilometre), and a GPS position or a searched street address is not named.

Earthquakes are a setting, off by default (tap ⓘ and tick **Show recent earthquakes**): the last seven days' earthquakes of magnitude 4.5 and above, from the US Geological Survey's public list, appear inside the glass Earth where they happened, each at its real depth. Put the circle on one and the card gives its magnitude, place and depth, how far it is through the Earth, and how long its waves took to reach you. It is a look back, not a warning: the list is published some minutes after each earthquake.

A card names whatever is in the middle of the view: a planet, star or constellation above the horizon; below it, the country or ocean on the far side, how far away it is, and which of the Earth's layers the line of sight passes through. Without a compass (on a computer, say) you drag to look around.

Just for fun. Everything runs in the browser; the location and camera picture never leave the phone. Only a place name you type into the "looking from" search is sent, to Photon (OpenStreetMap) or Open-Meteo's place finder. With earthquakes turned on, the page downloads the USGS's public list, the same for everyone; your position is not sent.

## How it's built

Static files, no build step, no backend:

- `index.html`, `tte.css`, `tte.js`: the page, the glass Earth (drawn from the inside) and the controls.
- `skyview.js`: the sky, drawn first, from a camera with the same attitude.
- `places.js`: the "looking from" place search (Photon, then Open-Meteo's place finder), as on [weathermodels.app](https://weathermodels.app/).
- `quakes.js`: the earthquakes setting's list (the USGS feed, checked and trimmed) and wording. `quake-times.js`: how long the waves take, by distance and depth (generated from the ak135 model; do not edit by hand).
- `earth.js`: the Preliminary Reference Earth Model (layers, depths). `geo.js`: what lies at a latitude and longitude. `texture.js`: the coastline and border overlay.
- `orientation.js`: the phone's attitude, the iPhone compass calibration and the World Magnetic Model 2025.
- Copied from [orrery.live](https://orrery.live/) (also MIT): `sky/astro.js`, `sky/vsop87.js`, `sky/constellation-names.js`, `guide-orbits.js`, `stars.js`, `constellations.js`.
- `lib/`: [three.js](https://threejs.org/) (MIT) and [topojson-client](https://github.com/topojson/topojson-client) (ISC).
- `sw.js`, `manifest.json` and the icons: an installable app that works offline once opened (apart from the place search and the earthquake list). Bump `CACHE` in `sw.js` whenever a precached file changes.

## Data and credits

- Earth imagery: NASA Blue Marble (public domain). Country outlines: [Natural Earth](https://www.naturalearthdata.com/) via world-atlas (public domain).
- Stars: [HYG database](https://codeberg.org/astronexus/hyg) (CC BY-SA 4.0), in `stars.js`.
- Constellation figures: [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3, © Olaf Frohn), in `constellations.js`. Boundaries: IAU (Delporte 1930) via Roman (1987), CDS VI/42.
- Milky Way: NASA/Goddard Space Flight Center Scientific Visualization Studio, Deep Star Maps 2020; Gaia DR2: ESA/Gaia/DPAC.
- Earthquakes: the [US Geological Survey's real-time feed](https://earthquake.usgs.gov/earthquakes/feed/) (public domain), fetched only while the setting is on. Wave travel times: the ak135 Earth model (Kennett, Engdahl and Buland, 1995).
- Earth's interior: PREM (Dziewonski and Anderson, 1981). Magnetic declination: NOAA World Magnetic Model 2025 (public domain).

## Licence

The code is MIT-licensed (see `LICENSE`). The data files keep their own licences, listed above.

Design, code and content developed with the assistance of AI (Anthropic Claude).
