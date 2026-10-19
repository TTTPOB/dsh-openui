import { defineFunction } from '@openuidev/react-lang';
import { z } from 'zod/v4';

const number = z.number();
const digits = z.number().int().min(0).max(15).default(2);
const list = z.array(number);
const nonemptyList = list.min(1);
const rate = number.gt(-1).describe('Rate per period as a ratio, greater than -1.');
const periods = number.int().positive();

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
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }

export const functions = [
  numeric('round', 'Round to 0–15 decimal places (default 2), ties away from zero.', { x: number, digits }, ({ x, digits }) => rounded(x, digits)),
  numeric('floor', 'Largest integer not greater than x.', { x: number }, ({ x }) => Math.floor(x)),
  numeric('ceil', 'Smallest integer not less than x.', { x: number }, ({ x }) => Math.ceil(x)),
  numeric('abs', 'Absolute value.', { x: number }, ({ x }) => Math.abs(x)),
  numeric('min', 'Minimum of a nonempty numeric list.', { values: nonemptyList }, ({ values }) => values.reduce((a, b) => Math.min(a, b))),
  numeric('max', 'Maximum of a nonempty numeric list.', { values: nonemptyList }, ({ values }) => values.reduce((a, b) => Math.max(a, b))),
  numeric('clamp', 'Constrain x to the inclusive lower/upper interval; lower must not exceed upper.', { x: number, lower: number, upper: number }, ({ x, lower, upper }) => {
    if (lower > upper) throw new RangeError('lower must be <= upper');
    return Math.min(upper, Math.max(lower, x));
  }),
  numeric('pow', 'x raised to exponent. The real-valued result must be finite.', { x: number, exponent: number }, ({ x, exponent }) => Math.pow(x, exponent)),
  numeric('sqrt', 'Nonnegative real square root; x must be >= 0.', { x: number.nonnegative() }, ({ x }) => Math.sqrt(x)),
  numeric('log', 'Natural logarithm; x must be > 0.', { x: number.positive() }, ({ x }) => Math.log(x)),
  numeric('exp', 'Natural exponential; the result must be finite.', { x: number }, ({ x }) => Math.exp(x)),
  numeric('sum', 'Sum of a numeric list; empty list returns 0.', { values: list }, ({ values }) => sum(values)),
  numeric('mean', 'Arithmetic mean of a nonempty numeric list.', { values: nonemptyList }, ({ values }) => sum(values) / values.length),
  numeric('median', 'Median of a nonempty numeric list; does not modify the input.', { values: nonemptyList }, ({ values }) => {
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
  }),
  numeric('count', 'Number of entries of any type in a list; empty list returns 0.', { values: z.array(z.unknown()) }, ({ values }) => values.length),
  numeric('pmt', 'End-of-period payment with zero final balance. Rate is per period; n is a positive integer. Cash-flow sign: positive pv gives negative payment. Zero rate supported.', { rate, n: periods, pv: number }, ({ rate, n, pv }) => rate === 0 ? -pv / n : -pv * rate / -Math.expm1(-n * Math.log1p(rate))),
  numeric('fv', 'Future value for end-of-period payments. Rate is per period; n is a nonnegative integer; pv defaults to 0. Cash-flow signs follow pmt; zero rate supported.', { rate, n: number.int().nonnegative(), payment: number, pv: number.default(0) }, ({ rate, n, payment, pv }) => {
    if (rate === 0) return -(pv + payment * n);
    const growthMinusOne = Math.expm1(n * Math.log1p(rate));
    return -(pv * (growthMinusOne + 1) + payment * (growthMinusOne / rate));
  }),
  numeric('npv', 'Net present value of end-of-period cashflows: the first is discounted one period. Add any initial t=0 cashflow separately. Rate > -1; empty list returns 0.', { rate, cashflows: list }, ({ rate, cashflows }) => cashflows.reduce((value, flow, index) => value + flow / Math.pow(1 + rate, index + 1), 0)),
  formatted('fixed', 'Fixed-point string with 0–15 digits after the decimal point (default 2); no grouping. Ties away from zero.', { x: number, digits }, ({ x, digits }) => fixed(x, digits)),
  formatted('percent', 'Format a ratio as percent: 0.125 -> "12.50%". Digits 0–15, default 2.', { x: number, digits }, ({ x, digits }) => fixed(number.parse(x * 100), digits) + '%'),
  formatted('thousands', 'Format with English comma thousands grouping and at most 15 fractional digits; locale-independent.', { x: number }, ({ x }) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 15 }).format(x)),
];
