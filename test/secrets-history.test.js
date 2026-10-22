// Credentials must not be committed in the tree or in any reachable commit.
// The regression job checks out with fetch-depth: 0 so this sees history.
// A match is reported as commit and path only — the line itself stays out
// of the test log.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const PATTERN = [
  '-----BEGIN [A-Z ]*PRIVATE KEY-----',
  'ghp_[A-Za-z0-9]{20,}',
  'github_pat_[A-Za-z0-9_]{20,}',
  'AKIA[0-9A-Z]{16}',
  'xox[baprs]-[A-Za-z0-9-]{10,}',
  'deploy_hooks/[A-Za-z0-9_-]{8,}',
  '(api_key|api_token|LASTFM_API_KEY|CLOUDFLARE_API_TOKEN|DEPLOY_HOOK)["\']?[[:space:]]*[:=][[:space:]]*["\'][A-Za-z0-9_/+-]{16,}',
].join('|');

function gitGrep(args) {
  try {
    return execFileSync('git', ['grep', '-I', '-E', '-n', '-e', PATTERN, ...args], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    if (err.status === 1) return '';
    throw err;
  }
}

function places(output) {
  /** @type {string[]} */
  const found = [];
  for (const line of output.split('\n')) {
    if (!line) continue;
    const parts = line.split(':');
    const historical = /^[0-9a-f]{40}$/.test(parts[0]);
    const file = historical ? parts[1] : parts[0];
    if (!file || file.startsWith('test/') || file.includes('/test/')) continue;
    found.push(historical ? `${parts[0].slice(0, 12)}:${file}` : file);
  }
  return [...new Set(found)];
}

test('the checkout is not shallow', () => {
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim();
  assert.equal(shallow, 'false', 'secret history cannot be scanned from a shallow clone');
});

test('tracked files and git history contain no credential material', () => {
  const worktree = places(gitGrep([]));
  const commits = execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  const history = places(gitGrep(commits));
  assert.deepEqual(worktree, [], `working tree: ${worktree.join(', ')}`);
  assert.deepEqual(history, [], `history: ${history.join(', ')}`);
});
