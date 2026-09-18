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
