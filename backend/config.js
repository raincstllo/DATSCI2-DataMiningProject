const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const ROOT = path.resolve(__dirname, '..');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in backend/.env`);
  return value;
}

function load() {
  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

  const ownerPasswordHash = required('OWNER_PASSWORD_HASH');
  if (!/^\$2[aby]\$\d{2}\$/.test(ownerPasswordHash)) {
    throw new Error('OWNER_PASSWORD_HASH must be a bcrypt hash (run npm run setup-owner)');
  }

  const defaultPython =
    process.platform === 'win32'
      ? path.join(ROOT, 'analysis', '.venv', 'Scripts', 'python.exe')
      : path.join(ROOT, 'analysis', '.venv', 'bin', 'python');

  return {
    root: ROOT,
    port: Number(process.env.PORT) || 3000,
    mongodbUri: required('MONGODB_URI'),
    jwtSecret,
    jwtExpiresIn: '30m',
    ownerUsername: required('OWNER_USERNAME'),
    ownerPasswordHash,
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:4200',
    analysisPython: process.env.ANALYSIS_PYTHON || defaultPython,
    analysisScript: path.join(ROOT, 'analysis', 'run.py'),
    analysisTimeoutMs: 10 * 60 * 1000,
  };
}

module.exports = load();
