const express = require('express');
const mongoose = require('mongoose');
const Patient = require('../models/patient');
const Visit = require('../models/visit');
const { nextId } = require('../models/counter');
const { PATIENT_ID } = require('../constants/records');
const { patientInput, intParam, escapeRegex } = require('../validation');
const { toVisit } = require('./visits');

const router = express.Router();

const PUBLIC_FIELDS = { _id: 0, patient_id: 1, name: 1, contact_number: 1, created_at: 1, updated_at: 1 };

function validId(req, res, next) {
  if (!PATIENT_ID.test(req.params.id)) return res.status(404).json({ error: 'Patient not found' });
  next();
}

/** Builds a filter from one search box: patient ID, part of a number, or part of a name. */
function searchFilter(q) {
  const text = typeof q === 'string' ? q.trim().slice(0, 100) : '';
  if (!text) return {};
  const or = [{ name: { $regex: escapeRegex(text), $options: 'i' } }];
  if (/^p\d+$/i.test(text)) or.push({ patient_id: { $regex: `^${text.toUpperCase()}` } });
  const digits = text.replace(/\D/g, '');
  if (digits.length >= 3) or.push({ contact_number: { $regex: escapeRegex(digits) } });
  return { $or: or };
}

router.get('/', async (req, res, next) => {
  try {
    const pageSize = intParam(req.query.pageSize, 25, 1, 100);
    const page = intParam(req.query.page, 1, 1, 100000);
    const [result] = await Patient.aggregate([
      { $match: searchFilter(req.query.q) },
      { $addFields: { num: { $toInt: { $substrCP: ['$patient_id', 1, 12] } } } },
      { $sort: { num: -1 } },
      {
        $facet: {
          total: [{ $count: 'n' }],
          items: [
            { $skip: (page - 1) * pageSize },
            { $limit: pageSize },
            {
              $lookup: {
                from: 'visits',
                localField: 'patient_id',
                foreignField: 'patient_id',
                pipeline: [{ $project: { _id: 0, date_visited: 1 } }],
                as: 'visits',
              },
            },
            {
              $project: {
                _id: 0,
                patient_id: 1,
                name: 1,
                contact_number: 1,
                visit_count: { $size: '$visits' },
                last_visit: { $max: '$visits.date_visited' },
              },
            },
          ],
        },
      },
    ]);
    res.json({ items: result.items, total: result.total[0]?.n ?? 0, page, pageSize });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = patientInput(req.body);
    const existing = await Patient.findOne(
      {
        contact_number: input.contact_number,
        // Built server-side from escaped input, so the operator is trusted (sanitizeFilter is on).
        name: mongoose.trusted({ $regex: `^${escapeRegex(input.name)}$`, $options: 'i' }),
      },
      PUBLIC_FIELDS,
    ).lean();
    if (existing) {
      return res.status(409).json({ error: 'This patient is already recorded', patient: existing });
    }
    const patient = await Patient.create({ ...input, patient_id: await nextId('patient', 'P') });
    const { _id, __v, ...out } = patient.toObject();
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', validId, async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ patient_id: req.params.id }, PUBLIC_FIELDS).lean();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const visits = await Visit.find({ patient_id: req.params.id })
      .sort({ date_visited: -1, visit_id: -1 })
      .lean();
    res.json({ ...patient, visits: visits.map((v) => toVisit(v)) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', validId, async (req, res, next) => {
  try {
    const input = patientInput(req.body);
    const patient = await Patient.findOneAndUpdate({ patient_id: req.params.id }, input, {
      new: true,
      runValidators: true,
      projection: PUBLIC_FIELDS,
    }).lean();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json(patient);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', validId, async (req, res, next) => {
  try {
    const visits = await Visit.countDocuments({ patient_id: req.params.id });
    if (visits > 0) {
      return res.status(409).json({
        error: `This patient has ${visits} recorded visit${visits === 1 ? '' : 's'}. Delete those first.`,
      });
    }
    const deleted = await Patient.deleteOne({ patient_id: req.params.id });
    if (!deleted.deletedCount) return res.status(404).json({ error: 'Patient not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
