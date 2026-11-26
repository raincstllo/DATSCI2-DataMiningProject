const mongoose = require('mongoose');

// Sequence numbers for generated IDs (P0001, V0001, ...).
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, min: 0 },
  },
  { strict: 'throw', collection: 'counters', versionKey: false },
);

const Counter = mongoose.model('Counter', counterSchema);

/** Atomically reserves the next number and returns it as e.g. "P0868". */
async function nextId(name, prefix) {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return `${prefix}${String(counter.seq).padStart(4, '0')}`;
}

module.exports = { Counter, nextId };
