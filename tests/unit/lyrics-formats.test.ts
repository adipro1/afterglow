import { describe, expect, it } from 'vitest';
import {
  detectFormat,
  parseLrc,
  parseLyricsFile,
  parsePlainText,
  parseSrt,
  toLrc,
} from '@/lyrics/formats';

// All lyrics in these tests are original, written for the test suite.

describe('LRC', () => {
  it('reads timestamps in every common precision', () => {
    const p = parseLrc(
      '[00:01]one\n[00:02.5]two\n[00:03.25]three\n[00:04.125]four\n[01:05:50]five',
    );
    expect(p.lines.map((l) => l.startMs)).toEqual([1000, 2500, 3250, 4125, 65500]);
    expect(p.sync).toBe('line');
    expect(p.warnings).toEqual([]);
  });

  it('handles BOM, CRLF, metadata, comments and blank lines', () => {
    const p = parseLrc(
      '﻿[ti:Night Bus]\r\n[ar:Test Band]\r\n[al:Tests]\r\n# a comment\r\n\r\n[00:10.00]First\r\n[00:12.00]Second\r\n',
    );
    expect(p.meta).toMatchObject({ title: 'Night Bus', artist: 'Test Band', album: 'Tests' });
    expect(p.lines.map((l) => l.text)).toEqual(['First', 'Second']);
  });

  it('expands lines that carry several timestamps (repeated choruses)', () => {
    const p = parseLrc('[00:05.00][00:25.00]Hold on\n[00:10.00]Verse');
    expect(p.lines.map((l) => [l.startMs, l.text])).toEqual([
      [5000, 'Hold on'],
      [10000, 'Verse'],
      [25000, 'Hold on'],
    ]);
  });

  it('applies [offset] the LRC way (positive = lyrics sooner)', () => {
    expect(parseLrc('[offset:+500]\n[00:10.00]a').lines[0]!.startMs).toBe(9500);
    expect(parseLrc('[offset:-250]\n[00:10.00]a').lines[0]!.startMs).toBe(10250);
    // Never before the song starts.
    expect(parseLrc('[offset:5000]\n[00:01.00]a').lines[0]!.startMs).toBe(0);
  });

  it('an empty timestamp is a silence that ends the line before it', () => {
    const p = parseLrc('[00:01.00]Short line\n[00:02.20]\n[00:30.00]Much later');
    expect(p.lines[0]!.endMs).toBe(2200);
    expect(p.lines).toHaveLength(2);
  });

  it('ends a line when it has plausibly been sung, so real gaps survive', () => {
    const p = parseLrc('[00:01.00]Four little words here\n[00:40.00]Next');
    const first = p.lines[0]!;
    expect(first.endMs).toBeGreaterThan(2000);
    expect(first.endMs).toBeLessThan(5000);
    // Back-to-back lines run into each other.
    const q = parseLrc('[00:01.00]A long line with a lot of words in it today\n[00:03.00]Next');
    expect(q.lines[0]!.endMs).toBe(3000);
  });

  it('reads enhanced (word-timed) LRC', () => {
    const p = parseLrc(
      '[00:01.00]<00:01.00>Paper <00:01.50>moon <00:02.20>rising <00:03.00>\n[00:05.00]<00:05.00>Next',
    );
    expect(p.sync).toBe('word');
    expect(p.lines[0]!.text).toBe('Paper moon rising');
    expect(p.lines[0]!.words).toEqual([
      { text: 'Paper', startMs: 1000, endMs: 1500 },
      { text: 'moon', startMs: 1500, endMs: 2200 },
      { text: 'rising', startMs: 2200, endMs: 3000 },
    ]);
    expect(p.lines[0]!.endMs).toBe(3000);
  });

  it('marks a mix of word-timed and plain lines as line-synced', () => {
    const p = parseLrc('[00:01.00]<00:01.00>Word <00:01.50>timed\n[00:04.00]Plain line');
    expect(p.sync).toBe('line');
    expect(p.lines[0]!.words).toHaveLength(2);
    expect(p.lines[1]!.words).toBeUndefined();
  });

  it('recognises duet voice markers', () => {
    const p = parseLrc(
      '[00:01.00]v1: Mine\n[00:03.00]v2: Yours\n[00:05.00]D: Ours\n[00:07.00]F: Hers',
    );
    expect(p.lines.map((l) => [l.text, l.singer])).toEqual([
      ['Mine', 'lead'],
      ['Yours', 'feat'],
      ['Ours', 'duet'],
      ['Hers', 'feat'],
    ]);
  });

  it('sorts out-of-order lines and says so', () => {
    const p = parseLrc('[00:09.00]late\n[00:02.00]early');
    expect(p.lines.map((l) => l.text)).toEqual(['early', 'late']);
    expect(p.warnings.join(' ')).toMatch(/sorted/);
  });

  it('keeps "[Chorus]" labels out of the timestamps and warns about untimed lines', () => {
    const p = parseLrc('[Chorus]\n[00:01.00]Timed');
    expect(p.lines).toHaveLength(1);
    expect(p.warnings.join(' ')).toMatch(/1 line had no timestamp/);
  });

  it('ignores impossible timestamps and junk without throwing', () => {
    const p = parseLrc('[00:75.00]bad seconds\n[xx:yy]junk\n<<<>>>\n[00:01.00]ok');
    expect(p.lines.map((l) => l.text)).toEqual(['ok']);
  });

  it('a file with no timestamps at all is untimed, not empty', () => {
    const p = parseLrc('[ti:Only Words]\nFirst words\nSecond words');
    expect(p.sync).toBe('none');
    expect(p.untimed).toEqual(['First words', 'Second words']);
  });

  it('two lines on the same timestamp both survive with a visible duration', () => {
    const p = parseLrc('[00:01.00]one\n[00:01.00]two');
    expect(p.lines).toHaveLength(2);
    for (const l of p.lines) expect(l.endMs).toBeGreaterThan(l.startMs);
  });

  it('[length] caps the last line', () => {
    const p = parseLrc('[length:00:03]\n[00:02.00]A line with several words in it');
    expect(p.lines[0]!.endMs).toBe(3000);
  });
});

describe('SRT and WebVTT', () => {
  it('reads cues with explicit end times', () => {
    const p = parseSrt(
      '1\n00:00:01,000 --> 00:00:03,500\nFirst cue\n\n2\n00:00:04,000 --> 00:00:06,000\nSecond cue\n',
    );
    expect(p.sync).toBe('line');
    expect(p.lines.map((l) => [l.startMs, l.endMs, l.text])).toEqual([
      [1000, 3500, 'First cue'],
      [4000, 6000, 'Second cue'],
    ]);
  });

  it('joins wrapped cue lines, strips markup, and survives CRLF and a BOM', () => {
    const p = parseSrt(
      '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>Half a line</i>\r\n{\\an8}and the rest &amp; more\r\n\r\n',
    );
    expect(p.lines[0]!.text).toBe('Half a line and the rest & more');
  });

  it('trims overlapping cues so only one line shows at a time', () => {
    const p = parseSrt(
      '1\n00:00:01,000 --> 00:00:05,000\nA\n\n2\n00:00:03,000 --> 00:00:06,000\nB\n',
    );
    expect(p.lines[0]!.endMs).toBe(3000);
    expect(p.warnings.join(' ')).toMatch(/overlapping/);
  });

  it('reads WebVTT (dot separators, no hours, cue settings)', () => {
    const p = parseSrt('WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nHello there\n\n');
    expect(p.lines[0]).toMatchObject({ startMs: 1000, endMs: 2500, text: 'Hello there' });
  });

  it('skips unreadable blocks with a warning', () => {
    const p = parseSrt('1\nnot a time --> nope\nBad\n\n2\n00:00:01,000 --> 00:00:02,000\nGood\n');
    expect(p.lines.map((l) => l.text)).toEqual(['Good']);
    expect(p.warnings).toHaveLength(1);
  });
});

describe('plain text and detection', () => {
  it('keeps lyric lines and drops section labels', () => {
    const p = parsePlainText('[Verse 1]\nOne\n\nTwo\n(Chorus)\nThree\nPre-Chorus:\nFour');
    expect(p.untimed).toEqual(['One', 'Two', 'Three', 'Four']);
    expect(p.sync).toBe('none');
  });

  it('detects the format from the extension, then the content', () => {
    expect(detectFormat('a.LRC', '')).toBe('lrc');
    expect(detectFormat('a.srt', '')).toBe('srt');
    expect(detectFormat('a.vtt', '')).toBe('srt');
    expect(detectFormat('a.txt', '[00:01.00]x')).toBe('text');
    expect(detectFormat('clipboard', '[00:01.00]x')).toBe('lrc');
    expect(detectFormat('clipboard', '00:00:01,000 --> 00:00:02,000')).toBe('srt');
    expect(detectFormat('clipboard', 'just words')).toBe('text');
    expect(parseLyricsFile('x.lrc', '[00:01.00]hi').lines).toHaveLength(1);
  });
});

describe('writing LRC', () => {
  it('round-trips word timing and silences', () => {
    const src = parseLrc(
      '[00:01.00]<00:01.00>Paper <00:01.50>moon <00:02.20>rising <00:03.00>\n[00:10.00]<00:10.00>Late <00:10.40>line <00:11.00>',
    );
    const text = toLrc({ lines: src.lines, sync: src.sync }, { title: 'T', artist: 'A' });
    expect(text).toContain('[ti:T]');
    const back = parseLrc(text);
    expect(back.sync).toBe('word');
    expect(back.lines.map((l) => [l.startMs, l.endMs, l.text])).toEqual(
      src.lines.map((l) => [l.startMs, l.endMs, l.text]),
    );
    expect(back.lines[0]!.words).toEqual(src.lines[0]!.words);
  });

  it('round-trips line timing and singers', () => {
    const src = parseLrc('[00:01.00]v1: Lead line\n[00:03.00]v2: Answer\n[00:20.00]Alone');
    const back = parseLrc(toLrc({ lines: src.lines, sync: src.sync }));
    expect(back.lines.map((l) => [l.startMs, l.endMs, l.text, l.singer])).toEqual(
      src.lines.map((l) => [l.startMs, l.endMs, l.text, l.singer]),
    );
  });
});
