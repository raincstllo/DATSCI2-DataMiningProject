const mongoose = require('mongoose');
const {
  SERVICES,
  TOOTH,
  PATIENT_ID,
  VISIT_ID,
  MAX_FEE,
  MAX_SERVICES_PER_VISIT,
} = require('../constants/records');

const serviceSchema = new mongoose.Schema(
  {
    nature_of_visit: { type: String, required: true, enum: SERVICES },
    teeth_operated: {
      type: [String],
      default: [],
      validate: { validator: (teeth) => teeth.every((t) => TOOTH.test(t)), message: 'Invalid tooth' },
    },
    fee: { type: Number, required: true, min: 0, max: MAX_FEE },
  },
  { _id: false, strict: 'throw' },
);

// One document per visit; a visit can include several services.
const visitSchema = new mongoose.Schema(
  {
    visit_id: { type: String, required: true, unique: true, match: VISIT_ID },
    patient_id: { type: String, required: true, match: PATIENT_ID },
    date_visited: { type: Date, required: true },
    services: {
      type: [serviceSchema],
      validate: {
        validator: (s) => s.length >= 1 && s.length <= MAX_SERVICES_PER_VISIT,
        message: `A visit needs 1 to ${MAX_SERVICES_PER_VISIT} services`,
      },
    },
  },
  {
    strict: 'throw',
    collection: 'visits',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

visitSchema.index({ patient_id: 1, date_visited: -1 });
visitSchema.index({ date_visited: -1 });

module.exports = mongoose.model('Visit', visitSchema);
