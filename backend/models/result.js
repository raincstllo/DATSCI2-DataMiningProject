const mongoose = require('mongoose');

// Written by the Python pipeline; the API only reads it.
const resultSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    generated_at: { type: Date, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    metrics: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { strict: 'throw', collection: 'results' },
);

resultSchema.index({ type: 1, generated_at: -1 });

module.exports = mongoose.model('Result', resultSchema);
