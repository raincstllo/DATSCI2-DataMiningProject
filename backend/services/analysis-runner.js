// Launches the Python pipeline as a child process and tracks its progress in memory.
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const readline = require('readline');
const config = require('../config');

// Must match ANALYSES in analysis/run.py.
const ANALYSES = {
  retention: 'Patient retention segments (K-Means)',
  revenue: 'Revenue forecast (Random Forest) and service combinations (Apriori)',
};

const MAX_JOBS_KEPT = 20;
const SECRET_ENV = ['JWT_SECRET', 'OWNER_PASSWORD_HASH', 'OWNER_USERNAME'];
const jobs = new Map();
let runningJobId = null;

function publicJob(job) {
  const { child, timer, ...rest } = job;
  return rest;
}

function childEnv() {
  const env = { ...process.env };
  for (const key of SECRET_ENV) delete env[key];
  return env;
}

function killTree(child) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGTERM');
  }
}

function finish(job, status, error) {
  if (job.status !== 'running') return;
  clearTimeout(job.timer);
  job.status = status;
  job.finishedAt = new Date().toISOString();
  if (error) job.error = error;
  runningJobId = null;
}

function start(type) {
  if (runningJobId) return { conflict: publicJob(jobs.get(runningJobId)) };

  const job = {
    id: randomUUID(),
    type,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: [],
    error: null,
  };

  // Argument array with an allowlisted type, no shell.
  const child = spawn(config.analysisPython, [config.analysisScript, type], {
    cwd: config.root,
    env: childEnv(),
    shell: false,
    windowsHide: true,
  });
  job.child = child;
  job.timer = setTimeout(() => {
    killTree(child);
    finish(job, 'failed', 'Analysis timed out');
  }, config.analysisTimeoutMs);

  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return; // ignore non-JSON output such as Spark shutdown messages
    }
    if (!event || typeof event.step !== 'string') return;
    job.steps.push({ ...event, at: new Date().toISOString() });
    if (event.step === 'error') job.error = String(event.message || 'Analysis failed');
  });
  child.stderr.resume(); // drain Spark/JVM logs without storing them

  child.on('error', () => finish(job, 'failed', 'Could not start the analysis process'));
  child.on('close', (code) => {
    if (code === 0 && !job.error) finish(job, 'succeeded');
    else finish(job, 'failed', job.error || `Analysis exited with code ${code}`);
  });

  jobs.set(job.id, job);
  runningJobId = job.id;
  while (jobs.size > MAX_JOBS_KEPT) jobs.delete(jobs.keys().next().value);
  return { job: publicJob(job) };
}

function get(id) {
  const job = jobs.get(id);
  return job ? publicJob(job) : null;
}

module.exports = { ANALYSES, start, get };
