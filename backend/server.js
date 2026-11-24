const config = require('./config');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { rejectOperatorKeys } = require('./middleware/sanitize');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const analysisRoutes = require('./routes/analysis');

mongoose.set('sanitizeFilter', true);

const app = express();
app.use(helmet());
app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json({ limit: '10kb' }));
app.use(rejectOperatorKeys);

app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, analysisRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Generic errors only: never echo request data or internals back to the client or logs.
app.use((err, req, res, next) => {
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
    console.error(`MongoDB connection failed: ${err.name}`);
    process.exit(1);
  });
