import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs script without type declarations
import { scanFile } from '../../scripts/public-safety.mjs';

type Finding = { path: string; line: number; why: string };
const scan = (path: string, text: string, words: string[] = []): Finding[] =>
  scanFile(path, text, words);

// Fake secrets are assembled at runtime so this test file never contains one itself.
const j = (...parts: string[]) => parts.join('');

describe('public-safety scan', () => {
  it('passes ordinary source code', () => {
    expect(scan('src/a.ts', 'const clientId = import.meta.env.VITE_ID;\nexport {};')).toEqual([]);
  });

  it.each([
    ['private key', j('-----BEGIN RSA ', 'PRIVATE KEY-----')],
    ['GitHub token', j('gh', 'p_', 'a'.repeat(36))],
    ['Anthropic key', j('sk-', 'ant-', 'b'.repeat(30))],
    ['AWS key', j('AK', 'IA', 'ABCDEFGHIJKLMNOP')],
    ['JWT', j('ey', 'JhbGciOiJIUzI1NiJ9.', 'ey', 'JzdWIiOiIxMjM0NTYifQ.', 'c'.repeat(20))],
    ['hard-coded Spotify secret', j('client_', "secret = '", 'd'.repeat(32), "'")],
    ['refresh token', j('refresh', 'Token: "', 'AQ', 'e'.repeat(40), '"')],
  ])('catches a %s', (_name, line) => {
    expect(scan('src/x.ts', `ok\n${line}\n`).length).toBeGreaterThan(0);
  });

  it('catches personal emails and paths, but allows noreply addresses', () => {
    expect(scan('a.md', j('mail me at someone', '@gmail.com'))).toHaveLength(1);
    expect(scan('a.md', j('C:', '\\Users\\', 'someone\\Desktop'))).toHaveLength(1);
    expect(scan('a.md', j('1+me', '@users.noreply.github.com'))).toEqual([]);
  });

  it('catches words from the private word list, case-insensitively', () => {
    expect(scan('a.md', 'Made by JANE DOE', ['jane doe'])).toHaveLength(1);
  });

  it.each([
    'refrences/clip.mp4',
    'src/song.mp3',
    'lyrics/real-song.lrc',
    '.env',
    '.env.local',
    'certs/app.pfx',
    'user-data/history.json',
    '.claude/settings.local.json',
  ])('forbids the file %s', (path) => {
    expect(scan(path, 'x').length).toBeGreaterThan(0);
  });

  it('allows .env.example and original demo-song lyric files', () => {
    expect(scan('.env.example', 'SPOTIFY_CLIENT_ID=')).toEqual([]);
    expect(scan('demo-songs/glass/song.lrc', '[00:01.00] la')).toEqual([]);
  });

  it('respects the explicit allow marker', () => {
    const line = j('pass', "word = '", 'f'.repeat(20), "' // public-safety: allow");
    expect(scan('src/x.ts', line)).toEqual([]);
  });
});
