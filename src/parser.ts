import type { CronFieldName } from "./errors.js";
import { CronParseError } from "./errors.js";

/** Maximum accepted expression length in characters. */
export const MAX_EXPRESSION_LENGTH = 256;

const MAX_DIGITS = 4;
const MAX_ECHO = 40;

/** The five expanded fields of a cron expression, sorted and deduplicated. */
export interface CronFields {
  readonly minute: readonly number[];
  readonly hour: readonly number[];
  readonly dayOfMonth: readonly number[];
  readonly month: readonly number[];
  /** Day of week, 0 = Sunday .. 6 = Saturday (7 is folded into 0). */
  readonly dayOfWeek: readonly number[];
}

/** A parsed cron expression. */
export interface CronExpression {
  /** The original text. */
  readonly source: string;
  readonly fields: CronFields;
  /** True when the day-of-month field begins with `*`. */
  readonly domStar: boolean;
  /** True when the day-of-week field begins with `*`. */
  readonly dowStar: boolean;
}

interface FieldSpec {
  readonly name: Exclude<CronFieldName, "expression">;
  readonly min: number;
  readonly max: number;
  readonly top: number;
  readonly names: readonly string[];
  readonly nameBase: number;
}

interface Token {
  readonly text: string;
  readonly start: number;
}

const MONTH_WORDS = "jan feb mar apr may jun jul aug sep oct nov dec";
const WEEKDAY_WORDS = "sun mon tue wed thu fri sat";

const MINUTE: FieldSpec = {
  name: "minute",
  min: 0,
  max: 59,
  top: 59,
  names: [],
  nameBase: 0,
};
const HOUR: FieldSpec = {
  name: "hour",
  min: 0,
  max: 23,
  top: 23,
  names: [],
  nameBase: 0,
};
const DAY_OF_MONTH: FieldSpec = {
  name: "dayOfMonth",
  min: 1,
  max: 31,
  top: 31,
  names: [],
  nameBase: 0,
};
const MONTH: FieldSpec = {
  name: "month",
  min: 1,
  max: 12,
  top: 12,
  names: MONTH_WORDS.split(" "),
  nameBase: 1,
};
const DAY_OF_WEEK: FieldSpec = {
  name: "dayOfWeek",
  min: 0,
  max: 7,
  top: 6,
  names: WEEKDAY_WORDS.split(" "),
  nameBase: 0,
};

const MACROS: ReadonlyMap<string, string> = new Map([
  ["@yearly", "0 0 1 1 *"],
  ["@annually", "0 0 1 1 *"],
  ["@monthly", "0 0 1 * *"],
  ["@weekly", "0 0 * * 0"],
  ["@daily", "0 0 * * *"],
  ["@midnight", "0 0 * * *"],
  ["@hourly", "0 * * * *"],
]);

function echo(text: string): string {
  return text.slice(0, MAX_ECHO);
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

function isLetter(ch: string | undefined): boolean {
  if (ch === undefined) {
    return false;
  }
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let start = -1;
  for (let i = 0; i <= input.length; i += 1) {
    const ch = input[i];
    const space = ch === undefined || ch === " " || ch === "\t";
    if (space && start >= 0) {
      tokens.push({ text: input.slice(start, i), start });
      start = -1;
    } else if (!space && start < 0) {
      start = i;
    }
  }
  return tokens;
}

function tokenAt(tokens: readonly Token[], index: number): Token {
  const token = tokens[index];
  if (token === undefined) {
    throw new CronParseError("expression", 0, "expected five fields");
  }
  return token;
}

function parseField(text: string, offset: number, spec: FieldSpec): number[] {
  const isWeekday = spec.name === "dayOfWeek";
  const values = new Set<number>();
  let pos = 0;

  const fail = (at: number, message: string): never => {
    throw new CronParseError(spec.name, offset + at, message);
  };

  const readNumber = (): number => {
    const start = pos;
    while (isDigit(text[pos])) {
      pos += 1;
    }
    if (pos - start > MAX_DIGITS) {
      return fail(start, "number has too many digits");
    }
    return Number(text.slice(start, pos));
  };

  const readValue = (rangeEnd: boolean, low: number): number => {
    const start = pos;
    if (isDigit(text[pos])) {
      const value = readNumber();
      if (value < spec.min || value > spec.max) {
        return fail(start, `value must be ${spec.min}-${spec.max}`);
      }
      return value;
    }
    if (isLetter(text[pos])) {
      while (isLetter(text[pos])) {
        pos += 1;
      }
      if (spec.names.length === 0) {
        return fail(start, "names are not allowed in this field");
      }
      const word = text.slice(start, pos).toLowerCase();
      const index = spec.names.indexOf(word);
      if (index < 0) {
        return fail(start, "unknown name");
      }
      const value = index + spec.nameBase;
      return rangeEnd && isWeekday && value === 0 && low >= 1 ? 7 : value;
    }
    return fail(start, "expected a value");
  };

  const readStep = (): number => {
    const start = pos;
    if (!isDigit(text[pos])) {
      return fail(start, "expected a step value");
    }
    const step = readNumber();
    return step < 1 ? fail(start, "step must be at least 1") : step;
  };

  for (;;) {
    const itemStart = pos;
    let low: number;
    let high: number;
    let canStep = true;
    if (text[pos] === "*") {
      pos += 1;
      low = spec.min;
      high = spec.top;
    } else {
      low = readValue(false, 0);
      high = low;
      canStep = false;
      if (text[pos] === "-") {
        pos += 1;
        high = readValue(true, low);
        canStep = true;
      }
    }
    let step = 1;
    if (text[pos] === "/") {
      if (!canStep) {
        fail(pos, "a step needs a range or *");
      }
      pos += 1;
      step = readStep();
    }
    if (low > high) {
      fail(itemStart, "range start is greater than range end");
    }
    for (let v = low; v <= high; v += step) {
      values.add(isWeekday && v === 7 ? 0 : v);
    }
    if (pos >= text.length) {
      break;
    }
    if (text[pos] !== ",") {
      fail(pos, "unexpected character");
    }
    pos += 1;
  }
  return [...values].sort((a, b) => a - b);
}

function parseToken(tokens: readonly Token[], index: number, spec: FieldSpec): readonly number[] {
  const token = tokenAt(tokens, index);
  return Object.freeze(parseField(token.text, token.start, spec));
}

function expandMacro(tokens: readonly Token[]): Token[] {
  const macro = tokenAt(tokens, 0);
  const extra = tokens[1];
  if (extra !== undefined) {
    throw new CronParseError("expression", extra.start, "a macro takes no other fields");
  }
  const key = macro.text.toLowerCase();
  if (key === "@reboot") {
    throw new CronParseError("expression", macro.start, "@reboot is not supported");
  }
  const body = MACROS.get(key);
  if (body === undefined) {
    throw new CronParseError("expression", macro.start, `unknown macro ${echo(macro.text)}`);
  }
  return tokenize(body);
}

/**
 * Parses a five-field Vixie cron expression or a macro such as `@daily`.
 *
 * Supports lists, ranges, steps on ranges and on `*`, month and weekday
 * names (`JAN`-`DEC`, `SUN`-`SAT`, case-insensitive) and 7 as Sunday.
 * `@reboot`, seconds and Quartz extensions (`L`, `W`, `#`, `?`) are rejected.
 *
 * @param expr - The expression, at most 256 characters.
 * @returns An immutable CronExpression.
 * @throws {CronParseError} With code `parse` for any invalid input.
 */
export function parseCron(expr: string): CronExpression {
  if (typeof expr !== "string") {
    throw new CronParseError("expression", 0, "expression must be a string");
  }
  if (expr.length > MAX_EXPRESSION_LENGTH) {
    throw new CronParseError(
      "expression",
      MAX_EXPRESSION_LENGTH,
      `expression is longer than ${MAX_EXPRESSION_LENGTH} characters`,
    );
  }
  const tokens = tokenize(expr);
  const first = tokens[0];
  if (first === undefined) {
    throw new CronParseError("expression", 0, "expression is empty");
  }
  const fieldTokens = first.text.startsWith("@") ? expandMacro(tokens) : tokens;
  if (fieldTokens.length !== 5) {
    const position = fieldTokens.length < 5 ? expr.length : tokenAt(fieldTokens, 5).start;
    throw new CronParseError(
      "expression",
      position,
      `expected 5 fields, found ${fieldTokens.length}`,
    );
  }
  const minute = parseToken(fieldTokens, 0, MINUTE);
  const hour = parseToken(fieldTokens, 1, HOUR);
  const dayOfMonth = parseToken(fieldTokens, 2, DAY_OF_MONTH);
  const month = parseToken(fieldTokens, 3, MONTH);
  const dayOfWeek = parseToken(fieldTokens, 4, DAY_OF_WEEK);
  return Object.freeze({
    source: expr,
    fields: Object.freeze({ minute, hour, dayOfMonth, month, dayOfWeek }),
    domStar: tokenAt(fieldTokens, 2).text.startsWith("*"),
    dowStar: tokenAt(fieldTokens, 4).text.startsWith("*"),
  });
}

function normalizeValues(value: unknown, spec: FieldSpec): readonly number[] {
  const limit = spec.top - spec.min + 1;
  const problem = "field must be a non-empty array of in-range integers";
  if (!Array.isArray(value) || value.length === 0 || value.length > limit) {
    throw new CronParseError(spec.name, 0, problem);
  }
  const unique = new Set<number>();
  for (const item of value as unknown[]) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < spec.min || item > spec.top) {
      throw new CronParseError(spec.name, 0, problem);
    }
    unique.add(item);
  }
  return Object.freeze([...unique].sort((a, b) => a - b));
}

/**
 * Accepts either an expression string (parsed) or a CronExpression object
 * (validated and normalized, since it may come from untrusted code).
 *
 * @param input - String or CronExpression.
 * @returns A validated CronExpression.
 * @throws {CronParseError} When the input is invalid.
 */
export function toExpression(input: unknown): CronExpression {
  if (typeof input === "string") {
    return parseCron(input);
  }
  if (typeof input !== "object" || input === null) {
    throw new CronParseError("expression", 0, "expected a cron string or a CronExpression");
  }
  const candidate = input as Record<string, unknown>;
  const rawFields = candidate.fields;
  const source = candidate.source;
  const domStar = candidate.domStar;
  const dowStar = candidate.dowStar;
  if (
    typeof rawFields !== "object" ||
    rawFields === null ||
    typeof source !== "string" ||
    source.length > MAX_EXPRESSION_LENGTH ||
    typeof domStar !== "boolean" ||
    typeof dowStar !== "boolean"
  ) {
    throw new CronParseError("expression", 0, "malformed CronExpression");
  }
  const raw = rawFields as Record<string, unknown>;
  return Object.freeze({
    source,
    fields: Object.freeze({
      minute: normalizeValues(raw.minute, MINUTE),
      hour: normalizeValues(raw.hour, HOUR),
      dayOfMonth: normalizeValues(raw.dayOfMonth, DAY_OF_MONTH),
      month: normalizeValues(raw.month, MONTH),
      dayOfWeek: normalizeValues(raw.dayOfWeek, DAY_OF_WEEK),
    }),
    domStar,
    dowStar,
  });
}
