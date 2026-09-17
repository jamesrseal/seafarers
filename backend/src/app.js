const express = require('express');
const cors = require('cors');
const path = require('path');

const shipsRouter = require('./routes/ships');
const scrapesRouter = require('./routes/scrapes');
const siteRouter = require('./routes/site');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/ships', shipsRouter);
app.use('/api/scrapes', scrapesRouter);

// Serve React build in production. index: false leaves "/" to the site
// router, which fills in each page for search engines.
const frontendBuild = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendBuild, { index: false }));
app.use(siteRouter(frontendBuild));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));

module.exports = app;
