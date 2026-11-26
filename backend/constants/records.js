// Shared rules for patient and visit records (used by the API and the CSV import).

const SERVICES = [
  'Cleaning',
  'Consultation',
  'Crown',
  'Denture',
  'Denture Adjustment',
  'Extraction',
  'Fluoride',
  'Orthodontic Adjustment',
  'Restoration',
  'Root Canal Treatment',
  'Sealant',
  'X-ray',
];

// Permanent teeth 1-32, primary teeth A-T (Universal numbering).
const TOOTH = /^([1-9]|[12]\d|3[0-2]|[A-T])$/;
const PATIENT_ID = /^P\d+$/;
const VISIT_ID = /^V\d+$/;
// Philippine mobile number, 11 digits.
const CONTACT = /^09\d{9}$/;

const MAX_FEE = 1_000_000;
const MAX_SERVICES_PER_VISIT = 20;

module.exports = {
  SERVICES,
  TOOTH,
  PATIENT_ID,
  VISIT_ID,
  CONTACT,
  MAX_FEE,
  MAX_SERVICES_PER_VISIT,
};
