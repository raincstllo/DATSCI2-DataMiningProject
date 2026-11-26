// Input validation for patient and visit requests. Each check returns a clean value or
// records a field error, so the UI can show the message next to the right field.
const { SERVICES, TOOTH, CONTACT, MAX_FEE, MAX_SERVICES_PER_VISIT } = require('./constants/records');

class ValidationError extends Error {
  constructor(fields) {
    super('Invalid input');
    this.status = 400;
    this.fields = fields;
  }
}

/** Today's date in the clinic's time zone, as YYYY-MM-DD. */
function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

function rejectUnknownKeys(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError({ _: 'Expected a JSON object' });
  }
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new ValidationError({ _: 'Unexpected fields in request' });
}

function name(value, errors) {
  const v = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (v.length < 2 || v.length > 100) errors.name = 'Enter a name of 2 to 100 characters.';
  else if (!/^[\p{L}\p{M} .,'-]+$/u.test(v)) errors.name = 'Use letters, spaces, periods, commas, apostrophes or hyphens only.';
  return v;
}

function contact(value, errors) {
  const v = typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
  const normalized = v.startsWith('+639') ? `0${v.slice(3)}` : v;
  if (!CONTACT.test(normalized)) errors.contact_number = 'Enter an 11-digit mobile number starting with 09.';
  return normalized;
}

function visitDate(value, errors) {
  const v = typeof value === 'string' ? value.trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!d || d.getUTCDate() !== +m[3] || d.getUTCMonth() !== +m[2] - 1) {
    errors.date_visited = 'Enter a valid date.';
  } else if (v > todayInManila()) {
    errors.date_visited = 'The visit date cannot be in the future.';
  } else if (v < '2000-01-01') {
    errors.date_visited = 'The visit date is too far in the past.';
  }
  return d;
}

function teeth(value, path, errors) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;\s]+/)
      : value == null
        ? []
        : null;
  if (!list) {
    errors[path] = 'Enter teeth as numbers 1-32 or letters A-T, separated by commas.';
    return [];
  }
  const cleaned = [...new Set(list.map((t) => String(t).trim().toUpperCase()).filter(Boolean))];
  if (cleaned.length > 32 || !cleaned.every((t) => TOOTH.test(t))) {
    errors[path] = 'Enter teeth as numbers 1-32 or letters A-T, separated by commas.';
  }
  return cleaned;
}

function services(value, errors) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SERVICES_PER_VISIT) {
    errors.services = `Add 1 to ${MAX_SERVICES_PER_VISIT} services.`;
    return [];
  }
  return value.map((s, i) => {
    const item = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
    const extra = Object.keys(item).filter((k) => !['nature_of_visit', 'teeth_operated', 'fee'].includes(k));
    if (extra.length) errors[`services.${i}`] = 'Unexpected fields.';
    if (!SERVICES.includes(item.nature_of_visit)) {
      errors[`services.${i}.nature_of_visit`] = 'Choose a service.';
    }
    const fee = typeof item.fee === 'number' ? item.fee : Number(item.fee);
    if (item.fee === '' || item.fee == null || !Number.isFinite(fee) || fee < 0 || fee > MAX_FEE) {
      errors[`services.${i}.fee`] = `Enter a fee from 0 to ${MAX_FEE.toLocaleString('en-PH')}.`;
    }
    return {
      nature_of_visit: item.nature_of_visit,
      teeth_operated: teeth(item.teeth_operated, `services.${i}.teeth_operated`, errors),
      fee: Math.round(fee * 100) / 100,
    };
  });
}

function patientInput(body) {
  rejectUnknownKeys(body, ['name', 'contact_number']);
  const errors = {};
  const out = { name: name(body.name, errors), contact_number: contact(body.contact_number, errors) };
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

function visitInput(body) {
  rejectUnknownKeys(body, ['patient_id', 'date_visited', 'services']);
  const errors = {};
  const out = {
    patient_id: typeof body.patient_id === 'string' ? body.patient_id.trim().toUpperCase() : '',
    date_visited: visitDate(body.date_visited, errors),
    services: services(body.services, errors),
  };
  if (!/^P\d+$/.test(out.patient_id)) errors.patient_id = 'Choose a patient.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

/** Positive integer query parameter with bounds. */
function intParam(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  ValidationError,
  patientInput,
  visitInput,
  intParam,
  escapeRegex,
  todayInManila,
};
