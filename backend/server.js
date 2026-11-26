const config = require('./config');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { rejectOperatorKeys } = require('./middleware/sanitize');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');
const patientRoutes = require('./routes/patients');
const visitRoutes = require('./routes/visits');

mongoose.set('sanitizeFilter', true);

const app = express();
app.use(helmet());
app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json({ limit: '10kb' }));
app.use(rejectOperatorKeys);

app.use('/api/auth', authRoutes);
app.use('/api/patients', requireAuth, patientRoutes);
app.use('/api/visits', requireAuth, visitRoutes);
app.use('/api', requireAuth, analysisRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Generic errors only: never echo request data or internals back to the client or logs.
// Field messages are fixed strings written in validation.js, never user input.
app.use((err, req, res, next) => {
  if (err.status === 400 && err.fields) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: err.fields });
  }
  if (['ValidationError', 'CastError', 'StrictModeError'].includes(err.name)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (err.code === 11000) return res.status(409).json({ error: 'That record already exists' });
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(`Request failed: ${err.name}`);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : 'Invalid request' });
});

mongoose
  .connect(config.mongodbUri)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(config.port, () => console.log(`Server on http://localhost:${config.port}`));
  })
  .catch((err) => {
    const code = err.codeName ? ` (${err.codeName} ${err.code})` : '';
    const hint = err.code === 8000 ? '. Check the database username and password in MONGODB_URI' : '';
    console.error(`MongoDB connection failed: ${err.name}${code}${hint}`);
    process.exit(1);
  });
