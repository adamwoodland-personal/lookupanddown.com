# Look Up and Down

**https://lookupanddown.com/**

Point your phone up to see the sky above you, right now: the Sun, the Moon, the planets, the stars, the constellations and the Milky Way. Point it down and the Earth turns to glass, so you see straight through it to the other side of the world, from underneath.

A card names whatever is in the middle of the view: a planet, star or constellation above the horizon; below it, the country or ocean on the far side, how far away it is, and which of the Earth's layers the line of sight passes through. Without a compass (on a computer, say) you drag to look around.

Just for fun. Everything runs in the browser; the location and camera picture never leave the phone. Only a place name you type into the "looking from" search is sent, to Photon (OpenStreetMap) or Open-Meteo's place finder.

## How it's built

Static files, no build step, no backend:

- `index.html`, `tte.css`, `tte.js`: the page, the glass Earth (drawn from the inside) and the controls.
- `skyview.js`: the sky, drawn first, from a camera with the same attitude.
- `places.js`: the "looking from" place search (Photon, then Open-Meteo's place finder), as on [weathermodels.app](https://weathermodels.app/).
- `earth.js`: the Preliminary Reference Earth Model (layers, depths). `geo.js`: what lies at a latitude and longitude. `texture.js`: the coastline and border overlay.
- `orientation.js`: the phone's attitude, the iPhone compass calibration and the World Magnetic Model 2025.
- Copied from [orrery.live](https://orrery.live/) (also MIT): `sky/astro.js`, `sky/vsop87.js`, `sky/constellation-names.js`, `guide-orbits.js`, `stars.js`, `constellations.js`.
- `lib/`: [three.js](https://threejs.org/) (MIT) and [topojson-client](https://github.com/topojson/topojson-client) (ISC).
- `sw.js`, `manifest.json` and the icons: an installable app that works offline once opened (apart from the place search). Bump `CACHE` in `sw.js` whenever a precached file changes.

## Data and credits

- Earth imagery: NASA Blue Marble (public domain). Country outlines: [Natural Earth](https://www.naturalearthdata.com/) via world-atlas (public domain).
- Stars: [HYG database](https://codeberg.org/astronexus/hyg) (CC BY-SA 4.0), in `stars.js`.
- Constellation figures: [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3, © Olaf Frohn), in `constellations.js`. Boundaries: IAU (Delporte 1930) via Roman (1987), CDS VI/42.
- Milky Way: NASA/Goddard Space Flight Center Scientific Visualization Studio, Deep Star Maps 2020; Gaia DR2: ESA/Gaia/DPAC.
- Earth's interior: PREM (Dziewonski and Anderson, 1981). Magnetic declination: NOAA World Magnetic Model 2025 (public domain).

## Licence

The code is MIT-licensed (see `LICENSE`). The data files keep their own licences, listed above.

Design, code and content developed with the assistance of AI (Anthropic Claude).
