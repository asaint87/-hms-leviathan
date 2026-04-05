const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function stripProtocol(domain) {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

const rawDomain =
  process.env.REPLIT_INTERNAL_APP_DOMAIN ||
  process.env.REPLIT_DEV_DOMAIN ||
  process.env.EXPO_PUBLIC_DOMAIN;

if (!rawDomain) {
  console.error('ERROR: No deployment domain found. Set REPLIT_INTERNAL_APP_DOMAIN, REPLIT_DEV_DOMAIN, or EXPO_PUBLIC_DOMAIN.');
  process.exit(1);
}

const domain = stripProtocol(rawDomain);
console.log(`Building HMS Leviathan web app for domain: ${domain}`);

const result = spawnSync(
  'pnpm',
  ['exec', 'expo', 'export', '--platform', 'web'],
  {
    stdio: 'inherit',
    cwd: projectRoot,
    env: {
      ...process.env,
      EXPO_PUBLIC_DOMAIN: domain,
      NODE_ENV: 'production',
    },
  }
);

if (result.status !== 0) {
  console.error('Build failed with exit code', result.status);
  process.exit(result.status || 1);
}

console.log('Web build complete — files output to dist/');
