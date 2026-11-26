const express = require('express');
const Result = require('../models/result');
const runner = require('../services/analysis-runner');

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function knownType(req, res, next) {
  if (!Object.hasOwn(runner.ANALYSES, req.params.type)) {
    return res.status(404).json({ error: 'Unknown analysis type' });
  }
  next();
}

router.get('/analysis/types', (req, res) => {
  res.json(Object.entries(runner.ANALYSES).map(([type, label]) => ({ type, label })));
});

router.post('/analysis/:type/run', knownType, (req, res) => {
  const { job, conflict } = runner.start(req.params.type);
  if (conflict) {
    return res.status(409).json({ error: 'An analysis is already running', job: conflict });
  }
  res.status(202).location(`/api/analysis/jobs/${job.id}`).json(job);
});

router.get('/analysis/jobs/:id', (req, res) => {
  const job = UUID.test(req.params.id) ? runner.get(req.params.id) : null;
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

router.get('/results/:type/latest', knownType, async (req, res, next) => {
  try {
    const result = await Result.findOne({ type: req.params.type })
      .sort({ generated_at: -1 })
      .select('-__v')
      .lean();
    if (!result) return res.status(404).json({ error: 'No results yet, run the analysis first' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
