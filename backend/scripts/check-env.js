// Checks backend/.env and repairs its encoding if needed. Prints key names only, never values.
// Usage: npm run check-env  [-- path/to/file, defaults to backend/.env]
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', '.env'));
const REQUIRED = ['MONGODB_URI', 'PORT', 'OWNER_USERNAME', 'OWNER_PASSWORD_HASH', 'JWT_SECRET'];

function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString('utf16le'), was: 'UTF-16 LE' };
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return { text: swapped.toString('utf16le'), was: 'UTF-16 BE' };
  }
  const zeros = buf.filter((b) => b === 0).length;
  if (zeros > buf.length / 4) return { text: buf.toString('utf16le'), was: 'UTF-16 (no BOM)' };
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), was: 'UTF-8 with BOM' };
  }
  return { text: buf.toString('utf8'), was: null };
}

function main() {
  if (!fs.existsSync(FILE)) {
    const near = fs.readdirSync(path.dirname(FILE)).filter((f) => /^\.env/i.test(f) && f !== '.env.example');
    console.log('backend/.env does not exist.');
    if (near.length) console.log(`Found instead: ${near.join(', ')}. Rename it to exactly ".env".`);
    process.exitCode = 1;
    return;
  }

  const { text, was } = decode(fs.readFileSync(FILE));
  if (was) {
    fs.writeFileSync(FILE, text.replace(/\r\n/g, '\n'), 'utf8');
    console.log(`Fixed: .env was saved as ${was}, re-saved as plain UTF-8.`);
  } else {
    console.log('Encoding is fine (UTF-8).');
  }

  const values = dotenv.parse(text);
  const keys = Object.keys(values);
  console.log(`Keys found: ${keys.join(', ') || '(none)'}`);

  const missing = REQUIRED.filter((k) => !values[k]);
  if (missing.length) console.log(`Missing or empty: ${missing.join(', ')}`);

  const hash = values.OWNER_PASSWORD_HASH;
  if (hash && !/^\$2[aby]\$\d{2}\$.{53}$/.test(hash)) {
    console.log('OWNER_PASSWORD_HASH is not a complete bcrypt hash. Paste the setup-owner line again, single quotes included.');
  }
  if (values.JWT_SECRET && values.JWT_SECRET.length < 32) console.log('JWT_SECRET is shorter than 32 characters.');

  const ok = !missing.length && (!hash || /^\$2[aby]\$\d{2}\$.{53}$/.test(hash));
  console.log(ok ? 'All good. The server can start.' : 'Fix the items above, then run this again.');
  if (!ok) process.exitCode = 1;
}

main();
