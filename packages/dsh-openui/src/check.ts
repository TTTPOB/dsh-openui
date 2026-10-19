import { createParser, type LibraryJSONSchema } from '@openuidev/lang-core';
import { diagnostics, type Diagnostic } from './diagnostics';

export interface CheckResult { ok: boolean; errors: Diagnostic[] }

/** Static parsing and catalog validation; never execute custom functions or UI actions. */
export function createCheck(schema: LibraryJSONSchema) {
  return (source: string): CheckResult => {
    try {
      const result = createParser(schema, 'Card').parse(source);
      const errors = diagnostics(result.meta.errors, source);
      if (result.meta.incomplete) errors.push({
        line: null, code: 'incomplete', message: 'The program contains an incomplete expression.',
        suggestion: 'Close all strings, brackets and parentheses before output.',
      });
      if (!result.root && !result.rootExpression && !errors.some(error => error.code === 'no-root')) errors.push({
        line: null, code: 'no-root', message: 'No renderable root was produced.',
        suggestion: 'Define root = Card(...) using the openui skill catalog.',
      });
      for (const name of result.meta.unresolved) errors.push({
        line: null, code: 'unresolved', message: 'Unresolved reference: ' + name,
        suggestion: 'Define ' + name + ' in this complete program.',
      });
      return { ok: errors.length === 0, errors };
    } catch (error) { return { ok: false, errors: diagnostics(error, source) }; }
  };
}

export function createCheckTool(check: (source: string) => CheckResult) {
  return {
    name: 'openui_check',
    description: 'Statically check complete openui-lang source against the available component and function catalog before outputting a complex UI. Returns ok or errors with statement-start line, message and suggestion. Does not execute custom function implementations, repair code, send messages or perform external actions.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['source'],
      properties: { source: { type: 'string', description: 'Complete openui-lang fence body, without Markdown fences.' } },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false, required: ['ok', 'errors'],
        properties: {
          ok: { type: 'boolean' },
          errors: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['line', 'code', 'message', 'suggestion'],
              properties: {
                line: { type: ['integer', 'null'] }, code: { type: 'string' },
                message: { type: 'string' }, suggestion: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args: unknown, value: CheckResult) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute(args: { source: string }): CheckResult {
      if (typeof args?.source !== 'string') throw new TypeError('openui_check source must be a string');
      return check(args.source);
    },
  };
}
