#!/usr/bin/env node
/**
 * Public-safety guard: makes sure nothing in this repository would be unsafe if the repo were
 * public — no secrets, tokens, private keys, personal details, copyrighted media or lyrics.
 *
 *   node scripts/public-safety.mjs              scan every file that is (or is about to be) tracked
 *   node scripts/public-safety.mjs --staged     scan only what is staged (used by the pre-commit hook)
 *   node scripts/public-safety.mjs --history    scan every file version in the whole git history (CI)
 *   node scripts/public-safety.mjs --install-hooks   point git at .githooks/ (runs on npm install)
 *
 * Personal words to watch for (your email, real name, Windows user name) go one per line in
 * `.public-safety.local`, which is git-ignored so the list itself never gets published.
 *
 * A line that is a deliberate false positive can be allowed with the comment `public-safety: allow`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOW_MARK = 'public-safety: allow';

/** Paths that must never be in the repo, whatever they contain. */
export const FORBIDDEN_PATHS = [
  { re: /(^|\/)(refrences|references)\//i, why: 'third-party reference material' },
  { re: /(^|\/)user-data\//i, why: 'private user data' },
  { re: /(^|\/)\.env(\.(?!example$)[^/]*)?$/i, why: 'environment file (secrets)' },
  { re: /\.(pem|key|p12|pfx|keystore|jks|ppk)$/i, why: 'private key / certificate' },
  { re: /(^|\/)id_(rsa|ed25519|ecdsa|dsa)$/i, why: 'SSH private key' },
  { re: /(^|\/)\.claude\/settings\.local\.json$/i, why: 'local Claude settings' },
  { re: /(^|\/)\.public-safety\.local$/i, why: 'personal word list' },
  { re: /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|mp4|mov|mkv|webm|avi)$/i, why: 'audio/video media' },
  { re: /\.(lrc|srt|ttml|vtt)$/i, why: 'lyric/subtitle file', unless: /(^|\/)demo-songs\// },
];

/** Content that looks like a credential. */
export const SECRET_PATTERNS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'private key block' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}/, why: 'GitHub token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{40,}/, why: 'GitHub token' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, why: 'Anthropic API key' },
  { re: /\bsk-(proj-)?[A-Za-z0-9]{32,}/, why: 'OpenAI-style API key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS access key' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, why: 'Google API key' },
  { re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/, why: 'Slack token' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, why: 'JWT' },
  { re: /\bBearer\s+[A-Za-z0-9._~+/-]{24,}/, why: 'bearer token' },
  {
    re: /(client[_-]?secret|refresh[_-]?token|access[_-]?token|api[_-]?key|secret[_-]?key|password|passwd)["'`]?\s*[:=]\s*["'`][^"'`\s]{12,}["'`]/i,
    why: 'hard-coded credential',
  },
];

/** Personal details that shouldn't be published. */
export const PERSONAL_PATTERNS = [
  { re: /\b[A-Za-z]:\\{1,2}Users\\{1,2}(?![<{$%])[^\\\s"'`]+/i, why: 'personal Windows user path' },
  { re: /(^|[\s"'`(])\/(Users|home)\/[a-z][\w.-]+/, why: 'personal home directory path' },
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const ALLOWED_EMAIL =
  /(@example\.(com|org|net)|@users\.noreply\.github\.com|^noreply@github\.com|^noreply@anthropic\.com)$/i;

/** Files whose content is generated / not ours to scan line by line. */
const SKIP_CONTENT = [/(^|\/)package-lock\.json$/];

/** Check one file. Returns a list of `{ path, line, why }`. */
export function scanFile(path, content, personalWords = []) {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  const found = [];
  const p = path.replace(/\\/g, '/');
  for (const f of FORBIDDEN_PATHS)
    if (f.re.test(p) && !(f.unless && f.unless.test(p)))
      found.push({ path: p, line: 0, why: f.why });
  if (buf.length > MAX_BYTES && !SKIP_CONTENT.some((r) => r.test(p)))
    found.push({ path: p, line: 0, why: `large file (${(buf.length / 1e6).toFixed(1)} MB)` });
  if (SKIP_CONTENT.some((r) => r.test(p))) return found;
  if (buf.subarray(0, 8000).includes(0)) return found; // binary

  const lines = buf.toString('utf8').split(/\r?\n/);
  const words = personalWords.map((w) => w.toLowerCase());
  lines.forEach((text, i) => {
    if (text.includes(ALLOW_MARK)) return;
    const hit = (why) => found.push({ path: p, line: i + 1, why });
    for (const s of SECRET_PATTERNS) if (s.re.test(text)) hit(s.why);
    for (const s of PERSONAL_PATTERNS) if (s.re.test(text)) hit(s.why);
    for (const m of text.matchAll(EMAIL_RE))
      if (!ALLOWED_EMAIL.test(m[0])) hit(`email address (${mask(m[0])})`);
    const lower = text.toLowerCase();
    for (const w of words)
      if (w && lower.includes(w)) hit(`personal word from .public-safety.local (${mask(w)})`);
  });
  return found;
}

/** Never print the sensitive value itself in full — logs can end up public too. */
const mask = (s) => (s.length <= 4 ? '****' : `${s.slice(0, 2)}…${s.slice(-2)}`);

function git(args, opts = {}) {
  const input = opts.input === undefined ? undefined : Buffer.from(opts.input, 'utf8');
  const r = spawnSync('git', args, { maxBuffer: 1 << 30, input });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}
const list = (buf) => buf.toString('utf8').split('\0').filter(Boolean);

function personalWords(root) {
  const f = resolve(root, '.public-safety.local');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function* tracked(root) {
  for (const p of list(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']))) {
    const abs = resolve(root, p);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    yield [p, readFileSync(abs)];
  }
}

function* staged() {
  for (const p of list(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])))
    yield [p, git(['show', `:${p}`])];
}

function* history() {
  // Every blob reachable from any ref, with the first path it was seen at.
  const seen = new Map();
  for (const line of git(['rev-list', '--objects', '--all']).toString('utf8').split('\n')) {
    const sp = line.indexOf(' ');
    if (sp > 0 && !seen.has(line.slice(0, sp))) seen.set(line.slice(0, sp), line.slice(sp + 1));
  }
  const shas = [...seen.keys()];
  const types = git(['cat-file', '--batch-check=%(objecttype)'], { input: shas.join('\n') + '\n' })
    .toString('utf8')
    .split('\n');
  const blobs = shas.filter((_, i) => types[i] === 'blob');
  const out = git(['cat-file', '--batch'], { input: blobs.join('\n') + '\n' });
  let at = 0;
  for (const sha of blobs) {
    const nl = out.indexOf(10, at);
    const size = Number(out.subarray(at, nl).toString('utf8').split(' ')[2]);
    yield [seen.get(sha), out.subarray(nl + 1, nl + 1 + size)];
    at = nl + 1 + size + 1;
  }
}

function checkAuthorEmail() {
  const r = spawnSync('git', ['config', 'user.email'], { encoding: 'utf8' });
  const email = r.stdout.trim();
  if (email && !/@users\.noreply\.github\.com$/i.test(email) && !process.env.CI)
    return [
      {
        path: '(git config user.email)',
        line: 0,
        why: `commit author email is not a private GitHub noreply address (${mask(email)})`,
      },
    ];
  return [];
}

function main() {
  const args = new Set(process.argv.slice(2));
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  process.chdir(root);

  if (args.has('--install-hooks')) {
    const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { encoding: 'utf8' });
    if (r.status === 0) console.log('public-safety: git hooks installed (.githooks)');
    return; // never fail an install (e.g. no git available)
  }

  const words = personalWords(root);
  const source = args.has('--history')
    ? history()
    : args.has('--staged')
      ? staged()
      : tracked(root);
  const problems = args.has('--staged') ? checkAuthorEmail() : [];
  let files = 0;
  for (const [p, buf] of source) {
    files++;
    problems.push(...scanFile(p, buf, words));
  }
  const unique = [...new Map(problems.map((x) => [`${x.path}:${x.line}:${x.why}`, x])).values()];

  if (unique.length === 0) {
    console.log(`public-safety: OK — ${files} file(s) checked, nothing unsafe for a public repo.`);
    return;
  }
  console.error(`public-safety: ${unique.length} problem(s) — this must not be published:\n`);
  for (const x of unique) console.error(`  ${x.path}${x.line ? `:${x.line}` : ''}  —  ${x.why}`);
  console.error(
    `\nRemove it (or git-ignore it). If a line is a genuine false positive, add the comment "${ALLOW_MARK}" to it.`,
  );
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
