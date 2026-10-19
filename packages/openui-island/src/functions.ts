import { defineFunction } from '@openuidev/react-lang';
import { z } from 'zod/v4';

const number = z.number();
const digits = z.number().int().min(0).max(15).default(2);
const list = z.array(number);
const nonemptyList = list.min(1);

function numeric<T extends z.ZodRawShape>(name: string, description: string, shape: T, calculate: (args: z.infer<z.ZodObject<T>>) => number) {
  const params = z.object(shape);
  return defineFunction({ name, description, params, returns: number,
    fn: input => { const result = number.parse(calculate(params.parse(input))); return result === 0 ? 0 : result; },
  });
}
function formatted<T extends z.ZodRawShape>(name: string, description: string, shape: T, calculate: (args: z.infer<z.ZodObject<T>>) => string) {
  const params = z.object(shape);
  return defineFunction({ name, description, params, returns: z.string(),
    fn: input => calculate(params.parse(input)),
  });
}
// Decimal exponent shifting avoids the 1.005 * 100 floating-point tie error.
function shift(value: number, places: number) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  return Number(mantissa + 'e' + (Number(exponent) + places));
}
function rounded(x: number, places: number) {
  if (Number.isInteger(x)) return x;
  const result = shift(Math.round(shift(Math.abs(x), places)), -places) * Math.sign(x);
  return result === 0 ? 0 : result;
}
function fixed(x: number, places: number) {
  return new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: places, maximumFractionDigits: places }).format(number.parse(rounded(x, places)));
}

export const functions = [
  numeric('clamp', 'Constrain x to the inclusive lower/upper interval; lower must not exceed upper.', { x: number, lower: number, upper: number }, ({ x, lower, upper }) => {
    if (lower > upper) throw new RangeError('lower must be <= upper');
    return Math.min(upper, Math.max(lower, x));
  }),
  numeric('pow', 'x raised to exponent. The real-valued result must be finite.', { x: number, exponent: number }, ({ x, exponent }) => Math.pow(x, exponent)),
  numeric('sqrt', 'Nonnegative real square root; x must be >= 0.', { x: number.nonnegative() }, ({ x }) => Math.sqrt(x)),
  numeric('log', 'Natural logarithm; x must be > 0.', { x: number.positive() }, ({ x }) => Math.log(x)),
  numeric('exp', 'Natural exponential; the result must be finite.', { x: number }, ({ x }) => Math.exp(x)),
  numeric('median', 'Median of a nonempty numeric list; does not modify the input.', { values: nonemptyList }, ({ values }) => {
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
  }),
  formatted('fixed', 'Fixed-point string with 0–15 digits after the decimal point (default 2); no grouping. Ties away from zero.', { x: number, digits }, ({ x, digits }) => fixed(x, digits)),
  formatted('thousands', 'Format with English comma thousands grouping and at most 15 fractional digits; locale-independent.', { x: number }, ({ x }) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 15 }).format(x)),
];
