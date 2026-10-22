// Unit tests for the compact JSON Schema validator.
import { describe, expect, it } from 'vitest';
import { isJsonSchemaText, validateJsonSchema } from './jsonSchema';

const valid = (value: unknown, schema: unknown): boolean =>
  validateJsonSchema(value, schema).length === 0;

describe('validateJsonSchema', () => {
  it('accepts values that satisfy the schema', () => {
    const schema = {
      type: 'object',
      required: ['answer'],
      properties: { answer: { type: 'string' }, score: { type: 'integer' } },
    };
    expect(valid({ answer: 'yes', score: 3 }, schema)).toBe(true);
    expect(validateJsonSchema({ answer: 'yes' }, schema)).toEqual([]);
  });

  it('reports type mismatches with a path and does not cascade', () => {
    const issues = validateJsonSchema(
      { answer: 42 },
      { type: 'object', properties: { answer: { type: 'string', minLength: 5 } } }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({ path: '$.answer', message: 'expected string' });
  });

  it('checks required properties and additionalProperties: false', () => {
    const schema = {
      type: 'object',
      required: ['a', 'b'],
      additionalProperties: false,
      properties: { a: { type: 'number' } },
    };
    const issues = validateJsonSchema({ a: 'x', c: true }, schema);
    expect(issues.map((i) => i.path)).toEqual(['$.b', '$.a', '$.c']);
  });

  it('validates array items and item counts', () => {
    const schema = {
      type: 'array',
      minItems: 2,
      items: { type: 'string', pattern: '^[a-z]+$' },
    };
    expect(valid(['aa', 'bb'], schema)).toBe(true);
    const issues = validateJsonSchema(['aa'], schema);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('at least 2');
    expect(validateJsonSchema(['AA'], schema).map((i) => `${i.path} ${i.message}`)).toEqual([
      '$ expected at least 2 item(s)',
      '$[0] does not match /^[a-z]+$/',
    ]);
  });

  it('supports enum, const and numeric bounds', () => {
    expect(valid('b', { enum: ['a', 'b'] })).toBe(true);
    expect(valid('c', { enum: ['a', 'b'] })).toBe(false);
    expect(valid(7, { const: 7 })).toBe(true);
    expect(valid(0.5, { minimum: 1 })).toBe(false);
    expect(valid(10, { exclusiveMaximum: 10 })).toBe(false);
  });

  it('supports anyOf / oneOf / not', () => {
    expect(valid('x', { anyOf: [{ type: 'number' }, { type: 'string' }] })).toBe(true);
    expect(valid(true, { anyOf: [{ type: 'number' }, { type: 'string' }] })).toBe(false);
    expect(valid(1, { oneOf: [{ type: 'number' }, { type: 'integer' }] })).toBe(false);
    expect(valid(1.5, { oneOf: [{ type: 'number' }, { type: 'integer' }] })).toBe(true);
    expect(valid(null, { not: { type: 'null' } })).toBe(false);
  });

  it('treats boolean schemas as always/never valid', () => {
    expect(valid({ anything: true }, true)).toBe(true);
    expect(valid({ anything: true }, false)).toBe(false);
  });

  it('ignores unknown keywords', () => {
    expect(valid('x', { type: 'string', $comment: 'hi', format: 'email' })).toBe(true);
  });
});

describe('isJsonSchemaText', () => {
  it('only accepts objects and booleans', () => {
    expect(isJsonSchemaText('{"type":"object"}')).toBe(true);
    expect(isJsonSchemaText('true')).toBe(true);
    expect(isJsonSchemaText('[1,2]')).toBe(false);
    expect(isJsonSchemaText('{oops')).toBe(false);
    expect(isJsonSchemaText('   ')).toBe(false);
  });
});
