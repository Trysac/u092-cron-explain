/** Stable machine-readable error codes. */
export type CronErrorCode = "parse" | "time_zone" | "range";

/** Names the part of an expression a parse error refers to. */
export type CronFieldName = "minute" | "hour" | "dayOfMonth" | "month" | "dayOfWeek" | "expression";

const MAX_MESSAGE_LENGTH = 200;

/** Base class of every error thrown by this library. */
export class CronError extends Error {
  /** Stable machine-readable code: `parse`, `time_zone` or `range`. */
  readonly code: CronErrorCode;

  /**
   * @param code - Machine-readable error code.
   * @param message - Human-readable message, cut to 200 characters.
   */
  constructor(code: CronErrorCode, message: string) {
    super(message.slice(0, MAX_MESSAGE_LENGTH));
    this.name = "CronError";
    this.code = code;
  }
}

/** Thrown when an expression (or a CronExpression object) is invalid. */
export class CronParseError extends CronError {
  /** The field that failed, or `expression` for whole-expression problems. */
  readonly field: CronFieldName;
  /** 0-based character index in the source expression. */
  readonly position: number;

  /**
   * @param field - Field that failed.
   * @param position - 0-based character index of the problem.
   * @param message - Human-readable message.
   */
  constructor(field: CronFieldName, position: number, message: string) {
    super("parse", message);
    this.name = "CronParseError";
    this.field = field;
    this.position = position;
  }
}
