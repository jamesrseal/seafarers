const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { casePage, viewPage, VIEW_PAGES, homePage, sitemapXml } = require('../seo');

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

  router.get('/sitemap.xml', (req, res) => {
    const { modified } = datasetFacts.get();
    res.type('application/xml').send(sitemapXml({ modified, cases: caseDates.all() }));
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
