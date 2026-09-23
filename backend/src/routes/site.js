const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { casePage, viewPage, VIEW_PAGES, homePage, sitemapXml } = require('../seo');
const { caseEvents, feedXml, FEED_PATH } = require('../feed');
const { caseCardPng } = require('../ogCard');

const NOT_FOUND = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Page not found | Abandoned Seafarers</title>
  </head>
  <body>
    <p>There's no page here. <a href="/">Go to the map of abandoned seafarer cases</a>.</p>
  </body>
</html>
`;

// The app's pages, served from the frontend build with what search engines
// need filled in (see ../seo.js). The app only uses "/" and its query string,
// so any other path is a real 404 rather than a copy of the home page.
module.exports = function siteRouter(frontendBuild) {
  const router = express.Router();

  let template;
  const indexHtml = () => (template ??= fs.readFileSync(path.join(frontendBuild, 'index.html'), 'utf8'));

  const latestShip = db.prepare(`SELECT * FROM ships WHERE abandonment_id = ? ORDER BY scraped_at DESC LIMIT 1`);
  // The other cases close enough to fall inside a card's map panel. Two degrees
  // covers it at every latitude — the panel is about 1.4 degrees tall at the
  // equator and narrower towards the poles — and anything beyond the edge is
  // clipped when it's drawn. min() over the longitude gap counts a neighbour on
  // the far side of the antimeridian as the neighbour it is.
  const casesNear = db.prepare(
    `SELECT abandonment_id, ship_status, num_seafarers, port_latitude, port_longitude FROM ships
     WHERE scraped_at = (SELECT MAX(s2.scraped_at) FROM ships s2 WHERE s2.abandonment_id = ships.abandonment_id)
       AND port_latitude IS NOT NULL AND port_longitude IS NOT NULL
       AND ABS(port_latitude - ?) <= 2
       AND MIN(ABS(port_longitude - ?), 360 - ABS(port_longitude - ?)) <= 2`
  );
  const caseDates = db.prepare(
    `SELECT abandonment_id, MAX(scraped_at) AS scraped_at FROM ships
     GROUP BY abandonment_id ORDER BY CAST(abandonment_id AS INTEGER)`
  );
  // notification_date is free text ending in the year, so the year is its last four characters.
  const datasetFacts = db.prepare(
    `SELECT COUNT(DISTINCT abandonment_id) AS cases, MAX(scraped_at) AS modified,
            MIN(CASE WHEN TRIM(notification_date) GLOB '*[0-9][0-9][0-9][0-9]'
                     THEN CAST(SUBSTR(TRIM(notification_date), -4) AS INTEGER) END) AS firstYear
     FROM ships`
  );

  // Enough of each row to write a feed entry, in the order caseEvents() walks.
  const historyRows = db.prepare(
    `SELECT abandonment_id, scraped_at, ship_status, ship_name, flag, imo_number,
            port_of_abandonment, abandonment_date, num_seafarers
     FROM ships ORDER BY abandonment_id, scraped_at`
  );
  const firstRun = db.prepare(`SELECT MIN(scraped_at) AS at FROM scrape_runs`);

  router.get('/sitemap.xml', (req, res) => {
    const { modified } = datasetFacts.get();
    res.type('application/xml').send(sitemapXml({ modified, cases: caseDates.all() }));
  });

  router.get(FEED_PATH, (req, res) => {
    const events = caseEvents(historyRows.all(), firstRun.get().at);
    res.type('application/atom+xml').send(feedXml(events));
  });

  // Rendered on demand and kept in memory: a crawler asks for a case's card
  // once, and the data only changes when a refresh redeploys the site anyway.
  // Keyed by the row it was drawn from, so a changed case redraws.
  const cards = new Map();
  const CARD_CACHE = 200;
  const cardFor = ship => {
    const key = `${ship.abandonment_id}:${ship.scraped_at}`;
    if (!cards.has(key)) {
      if (cards.size >= CARD_CACHE) cards.delete(cards.keys().next().value);
      const { port_latitude: lat, port_longitude: lon } = ship;
      const nearby = lat == null || lon == null ? [] : casesNear.all(lat, lon, lon);
      cards.set(key, caseCardPng(ship, nearby));
    }
    return cards.get(key);
  };

  router.get('/og/case-:id.png', (req, res) => {
    const ship = /^\d+$/.test(req.params.id) ? latestShip.get(req.params.id) : undefined;
    if (!ship) return res.status(404).type('html').send(NOT_FOUND);
    res.type('png').set('Cache-Control', 'public, max-age=86400').send(cardFor(ship));
  });

  router.get('/', (req, res) => {
    const id = [].concat(req.query.ship ?? [])[0];
    // A case wins over the view: the app opens its detail on top of whatever view is named.
    if (!id) {
      const view = [].concat(req.query.view ?? [])[0];
      return res.send(Object.hasOwn(VIEW_PAGES, view ?? '')
        ? viewPage(indexHtml(), view)
        : homePage(indexHtml(), datasetFacts.get()));
    }
    const ship = /^\d+$/.test(id) ? latestShip.get(id) : undefined;
    // An unknown case still opens the app, but isn't a page to index.
    if (!ship) return res.status(404).send(indexHtml());
    res.send(casePage(indexHtml(), ship));
  });

  router.use((req, res) => res.status(404).send(NOT_FOUND));

  return router;
};
