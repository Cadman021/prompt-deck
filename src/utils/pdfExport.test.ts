// Unit tests for the text-PDF helpers (markdown stripping + script routing).
import { describe, expect, it } from 'vitest';
import { mdToText, needsImageFallback } from './pdfExport';

describe('mdToText', () => {
  it('strips common markdown to plain lines', () => {
    expect(mdToText('# Title\n\n**bold** and `code`')).toBe('Title\n\nbold and code');
    expect(mdToText('> quote')).toBe('quote');
    expect(mdToText('- a\n- b')).toBe('• a\n• b');
    expect(mdToText('[text](https://x)')).toBe('text');
  });

  it('flattens tables and keeps code content', () => {
    expect(mdToText('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('a | b');
    expect(mdToText('```ts\nconst x = 1;\n```')).toContain('const x = 1;');
  });
});

describe('needsImageFallback', () => {
  const r = (output: string) => [{ model: 'm', output, tps: 1, ttft: 1 }];
  it('routes non-latin scripts to the image export', () => {
    expect(needsImageFallback('hello', r('hello'))).toBe(false);
    expect(needsImageFallback('سلام', r('hi'))).toBe(true);
    expect(needsImageFallback('hi', r('你好'))).toBe(true);
    expect(needsImageFallback('hi', r('Привет'))).toBe(true);
    expect(needsImageFallback('hi', r('🎉'))).toBe(true);
  });
});
