export interface Diagnostic { line: number | null; code: string; message: string; suggestion: string }
interface Failure { code?: string; message?: string; statementId?: string; component?: string; hint?: string }
const suggestions: Record<string, string> = {
  'unknown-component': 'Use a component from the openui skill catalog.',
  'unknown-function': 'Use a supported @function and its documented positional arguments.',
  'missing-required': 'Supply every required positional argument shown in the component signature.',
  'null-required': 'Define the referenced value and pass a non-null required argument.',
  'type-mismatch': 'Match the argument type and position shown in the component signature.',
  'excess-args': 'Remove arguments beyond the documented component signature.',
  'no-root': 'Define root = Card(...) as the entry statement.',
  'incomplete': 'Complete the expression, closing strings, brackets and parentheses.',
  'unresolved': 'Define each referenced variable in this complete program.',
};

/** Locations refer to a known statement start, never a guessed parser offset. */
export function diagnostics(error: unknown, source: string): Diagnostic[] {
  const failures = Array.isArray(error) ? error : [error];
  return failures.map(value => {
    const failure: Failure = value && typeof value === 'object' ? value : { message: String(value) };
    const index = failure.statementId ? source.split(/\r?\n/).findIndex(line => line.split('=')[0].trim() === failure.statementId) : -1;
    const code = failure.code ?? 'render-error';
    return { line: index >= 0 ? index + 1 : null, code, message: failure.message ?? 'OpenUI rendering failed.', suggestion: failure.hint ?? suggestions[code] ?? 'Check the program with openui_check and the openui skill.' };
  });
}
