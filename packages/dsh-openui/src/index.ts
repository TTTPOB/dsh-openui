import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createCheck, createCheckTool } from './check';

export const name = 'dsh-openui';
export const ISLAND_PATH = '/dsh-openui/island.js';
interface WebContext {
  effect(install: () => () => void, label?: string): void;
  webServer: { register(route: { kind: 'exact'; path: string; handler(req: IncomingMessage, res: ServerResponse): void }): () => void };
}
interface PromptContext {
  effect(install: () => () => void, label?: string): void;
  systemPrompt: { section(section: { name: string; order: number; text: string }): () => void };
  skills: { register(skill: { name: string; description: string; whenToUse: string; content: string; invocation: { modelInvocable: boolean; userInvocable: boolean } }): () => void };
}
interface ToolContext {
  effect(install: () => () => void, label?: string): void;
  tools: { register(tool: ReturnType<typeof createCheckTool>): () => void };
}
interface HostContext { inject(services: string[], apply: (ctx: WebContext & PromptContext & ToolContext) => void): void }

export function apply(ctx: HostContext): void {
  ctx.inject(['tools'], scoped => {
    const schema = JSON.parse(readFileSync(new URL('./library.schema.json', import.meta.url), 'utf8'));
    const check = createCheck(schema);
    scoped.effect(() => scoped.tools.register(createCheckTool(check)), 'dsh-openui: check tool');
  });
  ctx.inject(['systemPrompt', 'skills'], scoped => {
    scoped.effect(() => scoped.systemPrompt.section({
      name: 'openui:policy', order: 3200,
      text: 'You can render local interactive UI with openui-lang fenced code blocks when it improves the task. Keep code, commands, logs and troubleshooting as ordinary text. Before generating UI, load the openui skill. All interactions are local calculations; never imply that a UI control sends a request or performs an external action.',
    }), 'dsh-openui: policy');
    const content = readFileSync(new URL('./openui-skill.md', import.meta.url), 'utf8');
    scoped.effect(() => scoped.skills.register({
      name: 'openui', description: 'OpenUI Lang syntax, component catalog and examples for local interactive UI.',
      whenToUse: 'Before generating an interactive calculator, parameter explorer or local visual comparison.',
      content, invocation: { modelInvocable: true, userInvocable: false },
    }), 'dsh-openui: skill');
  });
  ctx.inject(['webServer'], web => {
    const body = readFileSync(new URL('./island.js', import.meta.url));
    const etag = '"' + createHash('sha256').update(body).digest('hex').slice(0, 16) + '"';
    web.effect(() => web.webServer.register({
      kind: 'exact', path: ISLAND_PATH,
      handler(req, res) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
        }
        if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag });
        res.end(req.method === 'HEAD' ? undefined : body);
      },
    }), 'dsh-openui: island asset');
  });
}
