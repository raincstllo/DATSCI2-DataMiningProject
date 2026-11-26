// Prompts for the owner login and prints the lines to put in backend/.env.
// The password is read without echo and only its bcrypt hash is printed.
// Usage: npm run setup-owner   (run it in your own terminal)
const readline = require('readline');
const { randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');

const MIN_PASSWORD = 12;

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else if (!/[\r\n]/.test(s)) rl.output.write('*');
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('Run this in an interactive terminal: npm run setup-owner');
    process.exitCode = 1;
    return;
  }

  const username = (await ask('Owner username: ')).trim();
  if (!/^[A-Za-z0-9_.-]{3,100}$/.test(username)) {
    console.error('Username must be 3-100 letters, numbers, dots, dashes or underscores.');
    process.exitCode = 1;
    return;
  }

  const password = await ask(`Owner password (min ${MIN_PASSWORD} characters): `, true);
  if (password.length < MIN_PASSWORD) {
    console.error(`Password must be at least ${MIN_PASSWORD} characters.`);
    process.exitCode = 1;
    return;
  }
  if ((await ask('Repeat password: ', true)) !== password) {
    console.error('Passwords do not match.');
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  console.log('\nAdd these lines to backend/.env (replace any existing ones):\n');
  console.log(`OWNER_USERNAME=${username}`);
  console.log(`OWNER_PASSWORD_HASH='${hash}'`);
  console.log(`JWT_SECRET=${randomBytes(48).toString('base64url')}`);
}

main();
