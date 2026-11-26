// Loads the visits CSV into the `patients` and `visits` collections, replacing what is there,
// and sets the ID counters so new records continue after the imported ones.
// Usage: npm run import:visits -- [path/to/file.csv]
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const Patient = require('../models/patient');
const Visit = require('../models/visit');
const { Counter } = require('../models/counter');
const { SERVICES, TOOTH, PATIENT_ID, VISIT_ID, CONTACT } = require('../constants/records');

const DEFAULT_CSV = path.join(__dirname, '..', '..', 'data', 'dental_records_2025_2026.csv');
const HEADER = [
  'Visit ID',
  'Patient ID',
  'Name',
  'Contact Number',
  'Date Visited',
  'Nature of Visit',
  'Teeth Operated',
  'Fee',
];

function parseDate(value) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return null;
  const [, mm, dd, yyyy] = m.map(Number);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd ? d : null;
}

function parseTeeth(value) {
  if (value.toUpperCase() === 'N/A') return [];
  const teeth = value.split(/[;\s/]+/).filter(Boolean).map((t) => t.toUpperCase());
  return teeth.every((t) => TOOTH.test(t)) ? teeth : null;
}

const idNumber = (id) => Number(id.slice(1));

function parseCsv(file) {
  const lines = fs
    .readFileSync(file, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const header = lines[0].split(',').map((h) => h.trim());
  if (header.join('|') !== HEADER.join('|')) {
    throw new Error(`Unexpected header. Expected: ${HEADER.join(', ')}`);
  }

  const patients = new Map();
  const visits = new Map();
  const errors = [];

  lines.slice(1).forEach((line, i) => {
    const row = i + 2; // 1-based, counting the header
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length !== HEADER.length) {
      return errors.push(`row ${row}: expected ${HEADER.length} fields, got ${cells.length}`);
    }

    const [visitId, patientId, rawName, rawContact, date, nature, rawTeeth, rawFee] = cells;
    const name = rawName.replace(/\s+/g, ' ');
    const contact = rawContact.replace(/[\s-]/g, '');
    const dateVisited = parseDate(date);
    const teeth = parseTeeth(rawTeeth);
    const fee = Number(rawFee.replace(/,/g, ''));

    if (!VISIT_ID.test(visitId)) errors.push(`row ${row}: bad Visit ID`);
    if (!PATIENT_ID.test(patientId)) errors.push(`row ${row}: bad Patient ID`);
    if (!name) errors.push(`row ${row}: empty Name`);
    if (!CONTACT.test(contact)) errors.push(`row ${row}: bad Contact Number (expected 09XXXXXXXXX)`);
    if (!dateVisited) errors.push(`row ${row}: bad Date Visited (expected MM/DD/YYYY)`);
    if (!SERVICES.includes(nature)) errors.push(`row ${row}: unknown Nature of Visit`);
    if (!teeth) errors.push(`row ${row}: bad Teeth Operated`);
    if (!Number.isFinite(fee) || fee < 0) errors.push(`row ${row}: bad Fee`);

    const known = patients.get(patientId);
    if (!known) patients.set(patientId, { patient_id: patientId, name, contact_number: contact });
    else if (known.name !== name || known.contact_number !== contact) {
      errors.push(`row ${row}: Patient ID ${patientId} has a different name or number on another row`);
    }

    const visit = visits.get(visitId);
    if (!visit) {
      visits.set(visitId, {
        visit_id: visitId,
        patient_id: patientId,
        date_visited: dateVisited,
        services: [],
      });
    } else if (visit.patient_id !== patientId || visit.date_visited?.getTime() !== dateVisited?.getTime()) {
      errors.push(`row ${row}: Visit ID ${visitId} has a different patient or date on another row`);
    }
    visits.get(visitId).services.push({ nature_of_visit: nature, teeth_operated: teeth ?? [], fee });
  });

  return { patients: [...patients.values()], visits: [...visits.values()], errors };
}

async function main() {
  const file = path.resolve(process.argv[2] || DEFAULT_CSV);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in backend/.env');

  const { patients, visits, errors } = parseCsv(file);
  if (errors.length) {
    console.error(`Import aborted, ${errors.length} problem(s):`);
    errors.slice(0, 20).forEach((e) => console.error(`  ${e}`));
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    // Drop the collections so old document shapes and indexes don't linger.
    for (const model of [Visit, Patient]) {
      await model.collection.drop().catch((err) => {
        if (err.codeName !== 'NamespaceNotFound') throw err;
      });
    }
    await Patient.insertMany(patients);
    await Visit.insertMany(visits);
    await Promise.all([Patient.syncIndexes(), Visit.syncIndexes()]);

    const maxPatient = Math.max(0, ...patients.map((p) => idNumber(p.patient_id)));
    const maxVisit = Math.max(0, ...visits.map((v) => idNumber(v.visit_id)));
    await Counter.bulkWrite([
      { updateOne: { filter: { _id: 'patient' }, update: { seq: maxPatient }, upsert: true } },
      { updateOne: { filter: { _id: 'visit' }, update: { seq: maxVisit }, upsert: true } },
    ]);

    const lines = visits.reduce((n, v) => n + v.services.length, 0);
    console.log(`Imported ${patients.length} patients and ${visits.length} visits (${lines} services).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(`Import failed: ${err.message}`);
  process.exitCode = 1;
});
