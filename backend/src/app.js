const express = require('express');
const cors = require('cors');
const path = require('path');

const shipsRouter = require('./routes/ships');
const scrapesRouter = require('./routes/scrapes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/ships', shipsRouter);
app.use('/api/scrapes', scrapesRouter);

// Serve React build in production
const frontendBuild = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendBuild));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuild, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));

module.exports = app;
