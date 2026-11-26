const mongoose = require('mongoose');
const { PATIENT_ID, CONTACT } = require('../constants/records');

// Name and contact number are personal data: never logged, never used as model features.
const patientSchema = new mongoose.Schema(
  {
    patient_id: { type: String, required: true, unique: true, match: PATIENT_ID },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    contact_number: { type: String, required: true, match: CONTACT },
  },
  {
    strict: 'throw',
    collection: 'patients',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

patientSchema.index({ name: 1 });
patientSchema.index({ contact_number: 1 });

module.exports = mongoose.model('Patient', patientSchema);
