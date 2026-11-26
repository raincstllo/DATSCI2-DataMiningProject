// Loads the visits CSV into the `visits` collection, replacing what is there.
// Usage: npm run import:visits -- [path/to/file.csv]
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const Visit = require('../models/visit');

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
const TOOTH = /^([1-9]|[12]\d|3[0-2]|[A-T])$/;

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

function parseCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(',').map((h) => h.trim());
  if (header.join('|') !== HEADER.join('|')) {
    throw new Error(`Unexpected header. Expected: ${HEADER.join(', ')}`);
  }

  const docs = [];
  const errors = [];
  lines.slice(1).forEach((line, i) => {
    const row = i + 2; // 1-based, counting the header
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length !== HEADER.length) {
      return errors.push(`row ${row}: expected ${HEADER.length} fields, got ${cells.length}`);
    }

    const [visitId, patientId, name, contactRaw, date, nature, teeth, fee] = cells;
    const contact = contactRaw.replace(/[\s-]/g, '');
    const dateVisited = parseDate(date);
    const teethOperated = parseTeeth(teeth);
    const feeNum = Number(fee.replace(/,/g, ''));

    if (!/^V\d+$/.test(visitId)) errors.push(`row ${row}: bad Visit ID`);
    if (!/^P\d+$/.test(patientId)) errors.push(`row ${row}: bad Patient ID`);
    if (!name) errors.push(`row ${row}: empty Name`);
    if (!/^09\d{9}$/.test(contact)) errors.push(`row ${row}: bad Contact Number (expected 09XXXXXXXXX)`);
    if (!dateVisited) errors.push(`row ${row}: bad Date Visited (expected MM/DD/YYYY)`);
    if (!nature) errors.push(`row ${row}: empty Nature of Visit`);
    if (!teethOperated) errors.push(`row ${row}: bad Teeth Operated`);
    if (!Number.isFinite(feeNum) || feeNum < 0) errors.push(`row ${row}: bad Fee`);

    docs.push({
      visit_id: visitId,
      patient_id: patientId,
      name: name.replace(/\s+/g, ' '),
      contact_number: contact,
      date_visited: dateVisited,
      nature_of_visit: nature,
      teeth_operated: teethOperated,
      fee: feeNum,
      source_row: row,
    });
  });
  return { docs, errors };
}

async function main() {
  const file = path.resolve(process.argv[2] || DEFAULT_CSV);
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set in backend/.env');

  const { docs, errors } = parseCsv(file);
  if (errors.length) {
    console.error(`Import aborted, ${errors.length} invalid row(s):`);
    errors.slice(0, 20).forEach((e) => console.error(`  ${e}`));
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const removed = await Visit.deleteMany({});
    const inserted = await Visit.insertMany(docs);
    await Visit.syncIndexes();
    console.log(`Removed ${removed.deletedCount} old document(s), inserted ${inserted.length}.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(`Import failed: ${err.message}`);
  process.exitCode = 1;
});
