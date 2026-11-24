const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../config');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

function isText(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {};
    if (!isText(username, 100) || !isText(password, 200)) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Always run bcrypt so a wrong username takes as long as a wrong password.
    const passwordOk = await bcrypt.compare(password, config.ownerPasswordHash);
    if (!passwordOk || username !== config.ownerUsername) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({}, config.jwtSecret, {
      algorithm: 'HS256',
      subject: config.ownerUsername,
      expiresIn: config.jwtExpiresIn,
    });
    res.json({ token, expiresIn: config.jwtExpiresIn });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
