# Backend assets

## fonts/Lato-Regular.ttf, fonts/Lato-Bold.ttf

[Lato](https://fonts.google.com/specimen/Lato) by Łukasz Dziedzic, under the
[SIL Open Font License 1.1](https://openfontlicense.org/), which allows
embedding and redistribution. The TTFs as Google ships them in
[google/fonts](https://github.com/google/fonts/tree/main/ofl/lato).

`src/ogCard.js` draws each case's share card with them. They are committed
because the container has no fonts of its own, and because resvg reads TTF and
OTF but not the woff2 files the site and `instagram/assets/fonts` use — a
missing face renders the card blank rather than failing.

## basemaps/*.jpg

The map behind each case card: a 472x514 window at zoom 9, cut from the
[OpenStreetMap](https://www.openstreetmap.org/) standard tiles around each port
in the database. Map data © OpenStreetMap contributors, available under the
[Open Database License](https://www.openstreetmap.org/copyright); the rendered
tiles are the OSM Foundation's, under CC BY-SA 2.0. `src/ogCard.js` prints
"© OpenStreetMap contributors" under the panel on every card that carries one.

They are committed for the same reason the fonts are: the card has to be there
whenever a crawler asks, and Render's free plan keeps nothing between deploys,
so a card drawn from live tiles would call OpenStreetMap's servers on every cold
request — the automated use their
[tile policy](https://operations.osmfoundation.org/policies/tiles/) asks clients
not to make.

`scripts/bake-basemaps.js` draws them, one per port, fetching each distinct tile
once at two requests at a time. The daily refresh runs it and commits any new
panels with the data that needs them, so ports don't go uncovered; run it by
hand after changing the panel size, the zoom or the JPEG quality.
`test/basemap.test.js` fails while any port is missing one.
