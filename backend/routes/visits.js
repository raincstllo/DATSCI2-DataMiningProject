const express = require('express');
const mongoose = require('mongoose');
const Patient = require('../models/patient');
const Visit = require('../models/visit');
const { nextId } = require('../models/counter');
const { SERVICES, VISIT_ID } = require('../constants/records');
const { visitInput, intParam, escapeRegex } = require('../validation');

const router = express.Router();

const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : null);

/** API shape of a visit: dates as YYYY-MM-DD, total fee included. */
function toVisit(v, patient) {
  return {
    visit_id: v.visit_id,
    patient_id: v.patient_id,
    ...(patient !== undefined ? { patient_name: patient?.name ?? null } : {}),
    date_visited: isoDate(v.date_visited),
    services: v.services.map((s) => ({
      nature_of_visit: s.nature_of_visit,
      teeth_operated: s.teeth_operated ?? [],
      fee: s.fee,
    })),
    total_fee: v.services.reduce((sum, s) => sum + s.fee, 0),
  };
}

function validId(req, res, next) {
  if (!VISIT_ID.test(req.params.id)) return res.status(404).json({ error: 'Visit not found' });
  next();
}

async function requirePatient(patientId) {
  const patient = await Patient.findOne({ patient_id: patientId }, { _id: 0, name: 1 }).lean();
  if (!patient) {
    const err = new Error('Unknown patient');
    err.status = 400;
    err.fields = { patient_id: 'This patient does not exist. Choose another one.' };
    throw err;
  }
  return patient;
}

const dateParam = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);

router.get('/services', (req, res) => res.json(SERVICES));

router.get('/', async (req, res, next) => {
  try {
    const pageSize = intParam(req.query.pageSize, 25, 1, 100);
    const page = intParam(req.query.page, 1, 1, 100000);
    const filter = {};

    const from = dateParam(req.query.from);
    const to = dateParam(req.query.to);
    // Operator objects below are built server-side from validated input, so they are trusted
    // (mongoose sanitizeFilter would otherwise neutralize them).
    if (from || to) {
      filter.date_visited = mongoose.trusted({ ...(from && { $gte: from }), ...(to && { $lte: to }) });
    }
    if (typeof req.query.service === 'string' && SERVICES.includes(req.query.service)) {
      filter['services.nature_of_visit'] = req.query.service;
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q) {
      const or = [{ name: mongoose.trusted({ $regex: escapeRegex(q), $options: 'i' }) }];
      if (/^p\d+$/i.test(q)) or.push({ patient_id: q.toUpperCase() });
      const ids = await Patient.find({ $or: or }, { _id: 0, patient_id: 1 }).limit(500).lean();
      const visitIds = /^v\d+$/i.test(q) ? [q.toUpperCase()] : [];
      filter.$or = [
        { patient_id: mongoose.trusted({ $in: ids.map((p) => p.patient_id) }) },
        ...(visitIds.length ? [{ visit_id: visitIds[0] }] : []),
      ];
    }

    const [total, visits] = await Promise.all([
      Visit.countDocuments(filter),
      Visit.find(filter)
        .sort({ date_visited: -1, visit_id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);
    const patients = await Patient.find(
      { patient_id: mongoose.trusted({ $in: [...new Set(visits.map((v) => v.patient_id))] }) },
      { _id: 0, patient_id: 1, name: 1 },
    ).lean();
    const byId = new Map(patients.map((p) => [p.patient_id, p]));
    res.json({
      items: visits.map((v) => toVisit(v, byId.get(v.patient_id) ?? null)),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = visitInput(req.body);
    const patient = await requirePatient(input.patient_id);
    const visit = await Visit.create({ ...input, visit_id: await nextId('visit', 'V') });
    res.status(201).json(toVisit(visit.toObject(), patient));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', validId, async (req, res, next) => {
  try {
    const visit = await Visit.findOne({ visit_id: req.params.id }).lean();
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    const patient = await Patient.findOne({ patient_id: visit.patient_id }, { _id: 0, name: 1 }).lean();
    res.json(toVisit(visit, patient));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validId, async (req, res, next) => {
  try {
    const input = visitInput(req.body);
    const patient = await requirePatient(input.patient_id);
    const visit = await Visit.findOneAndUpdate({ visit_id: req.params.id }, input, {
      new: true,
      runValidators: true,
    }).lean();
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    res.json(toVisit(visit, patient));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', validId, async (req, res, next) => {
  try {
    const deleted = await Visit.deleteOne({ visit_id: req.params.id });
    if (!deleted.deletedCount) return res.status(404).json({ error: 'Visit not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.toVisit = toVisit;
