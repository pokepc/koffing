export function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || /[\r\n]/u.test(value)) {
    throw new TypeError(`${label} must be a single-line string`);
  }
  return value.trim() || undefined;
}

export function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function flag(value: unknown, label: string): true | undefined {
  if (value === undefined || value === false) return undefined;
  if (value !== true) throw new TypeError(`${label} must be a boolean`);
  return true;
}

export function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}
