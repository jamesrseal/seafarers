# Card assets

## ocean.jpg / ocean-source.jpg

"Blue sea water background" by Petr Kratochvil, from
[PublicDomainPictures.net](https://www.publicdomainpictures.net/en/view-image.php?image=4386&picture=blue-sea-water-background).
Dedicated to the public domain by its author: free to use and modify, including
commercially, with no attribution required. Credited here anyway.

`ocean-source.jpg` is the file as downloaded (1280x853). `ocean.jpg` is the
card's background: a 4:5 centre crop scaled to 1080x1350, the exact size the
card renders at, so the browser never scales it.

## fonts/lato-*.woff2

[Lato](https://fonts.google.com/specimen/Lato) by Łukasz Dziedzic, under the
[SIL Open Font License 1.1](https://openfontlicense.org/), which allows
embedding and redistribution. These are the latin-subset woff2 files Google
Fonts serves, at weights 300, 400 and 700 — the same family and weights the
site's pages load.

They are committed rather than fetched at render time so a card looks the same
whatever fonts the machine rendering it happens to have. A GitHub Actions
runner has almost none.
