// src/utils/jsonSchema.ts
// A deliberately small JSON Schema validator for Test Suite output checks.
//
// It covers the keywords people actually use to assert model output — `type`,
// `required`, `properties`, `items`, `enum`, `const`, numeric/string bounds,
// `additionalProperties`, and the `allOf`/`anyOf`/`oneOf`/`not` combinators —
// and ignores the rest. Full Draft 2020-12 support would mean a large
// dependency; these checks only need a pass/fail signal for structured output.
//
// Unknown keywords are ignored (not treated as errors), matching JSON Schema's
// "annotations" behaviour.

export interface SchemaIssue {
  /** JSON Pointer-ish path of the offending value (`$`, `$.foo`, `$[0]`). */
  path: string;
  message: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && sameJson(a[k], b[k]));
  }
  return false;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object':
      return isObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

/**
 * Validates `value` against `schema`.
 * Returns an empty array when valid; every issue found otherwise.
 */
export function validateJsonSchema(value: unknown, schema: unknown, path = '$'): SchemaIssue[] {
  if (schema === true) return [];
  if (schema === false) return [{ path, message: 'no value is allowed here' }];
  if (!isObject(schema)) return [];

  const issues: SchemaIssue[] = [];
  const push = (p: string, message: string) => issues.push({ path: p, message });

  // --- type ---------------------------------------------------------------
  const type = schema.type;
  if (typeof type === 'string') {
    if (!matchesType(value, type)) {
      push(path, `expected ${type}`);
      return issues; // later keywords assume the type matched
    }
  } else if (Array.isArray(type)) {
    const names = type.filter((t): t is string => typeof t === 'string');
    if (names.length > 0 && !names.some((t) => matchesType(value, t))) {
      push(path, `expected one of: ${names.join(', ')}`);
      return issues;
    }
  }

  // --- value equality -----------------------------------------------------
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => sameJson(v, value))) {
    push(path, 'value is not one of the allowed values');
  }
  if ('const' in schema && !sameJson(schema.const, value)) {
    push(path, 'value does not match the required constant');
  }

  // --- objects ------------------------------------------------------------
  if (isObject(value)) {
    const props = isObject(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === 'string' && !(key in value)) {
          push(`${path}.${key}`, 'required property is missing');
        }
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) issues.push(...validateJsonSchema(value[key], sub, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) push(`${path}.${key}`, 'additional property is not allowed');
      }
    } else if (isObject(schema.additionalProperties)) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) {
          issues.push(
            ...validateJsonSchema(value[key], schema.additionalProperties, `${path}.${key}`)
          );
        }
      }
    }
  }

  // --- arrays -------------------------------------------------------------
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      push(path, `expected at least ${schema.minItems} item(s)`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      push(path, `expected at most ${schema.maxItems} item(s)`);
    }
    if (Array.isArray(schema.items)) {
      schema.items.forEach((sub, i) => {
        if (i < value.length) issues.push(...validateJsonSchema(value[i], sub, `${path}[${i}]`));
      });
    } else if (isObject(schema.items)) {
      value.forEach((v, i) => issues.push(...validateJsonSchema(v, schema.items, `${path}[${i}]`)));
    }
  }

  // --- strings ------------------------------------------------------------
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      push(path, `expected at least ${schema.minLength} character(s)`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      push(path, `expected at most ${schema.maxLength} character(s)`);
    }
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          push(path, `does not match /${schema.pattern}/`);
        }
      } catch {
        // Invalid pattern inside the schema: ignore rather than block the run.
      }
    }
  }

  // --- numbers ------------------------------------------------------------
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      push(path, `expected >= ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      push(path, `expected <= ${schema.maximum}`);
    }
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      push(path, `expected > ${schema.exclusiveMinimum}`);
    }
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      push(path, `expected < ${schema.exclusiveMaximum}`);
    }
  }

  // --- combinators --------------------------------------------------------
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) issues.push(...validateJsonSchema(value, sub, path));
  }
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((sub) => validateJsonSchema(value, sub, path).length === 0)) {
      push(path, 'does not match any of the allowed schemas');
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter(
      (sub) => validateJsonSchema(value, sub, path).length === 0
    ).length;
    if (matches !== 1) {
      push(path, `matches ${matches} schemas but exactly 1 is required`);
    }
  }
  if (isObject(schema.not) && validateJsonSchema(value, schema.not, path).length === 0) {
    push(path, 'matches a disallowed schema');
  }

  return issues;
}

/** True when `text` parses as a JSON Schema (object or boolean). */
export function isJsonSchemaText(text: string): boolean {
  if (!text.trim()) return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'boolean' || isObject(parsed);
  } catch {
    return false;
  }
}
