import { diagnostics } from './diagnostics';

export interface Options {
  response: string; streaming?: boolean; theme?: 'light' | 'dark';
  onReady?: () => void; onError?: (error: unknown) => void;
  initialState?: Record<string, unknown>; onStateChange?: (state: Record<string, unknown>) => void;
}
export interface Handle { update(options: Partial<Options>): void; unmount(): void }
export interface Island { mount(root: ShadowRoot, options: Options): Handle }
export interface Fence { code: HTMLElement; original: HTMLElement; streaming: boolean; response?: string; stateKey?: string }

interface Entry {
  host: HTMLElement; original: HTMLElement; hidden: boolean; handle?: Handle;
  notice?: HTMLElement; message?: HTMLElement;
  response: string; streaming: boolean; theme: 'light' | 'dark'; failed: boolean;
}

/** Own only island nodes; preserve the host's source and its original visibility. */
export function createRenderer(load: () => Promise<Island>, environment?: { theme(): 'light' | 'dark'; loadState(key: string): Record<string, unknown> | undefined; saveState(key: string, state: Record<string, unknown>): void }) {
  const entries = new Map<HTMLElement, Entry>();
  let disposed = false;
  function fail(entry: Entry, error: unknown) {
    entry.failed = true; entry.original.hidden = entry.hidden; entry.host.hidden = true;
    if (!entry.notice) {
      const doc = entry.original.ownerDocument;
      entry.notice = doc.createElement('div');
      entry.notice.setAttribute('data-dsh-openui-error', ''); entry.notice.setAttribute('role', 'alert');
      const root = entry.notice.attachShadow({ mode: 'open' });
      const style = doc.createElement('style');
      style.textContent = ':host{display:block;margin:8px 0;color:var(--dsw-alias-label-primary,inherit);font:inherit}p{margin:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#b45309);border-radius:8px;background:var(--dsw-alias-bg-layer-2,transparent);white-space:pre-wrap;overflow-wrap:anywhere}';
      entry.message = doc.createElement('p'); root.append(style, entry.message);
      entry.original.before(entry.notice);
    }
    const errors = diagnostics(error, entry.response);
    entry.message!.textContent = 'OpenUI 无法渲染，已保留原始代码。\n' + errors.slice(0, 3).map(error => (error.line === null ? '位置未知' : '第 ' + error.line + ' 行（语句起始）') + '：' + error.message + '\n建议：' + error.suggestion).join('\n');
    console.warn('[dsh-openui] render failed', error);
  }
  function remove(code: HTMLElement) {
    const entry = entries.get(code);
    if (!entry) return;
    entries.delete(code);
    entry.original.hidden = entry.hidden;
    entry.handle?.unmount();
    entry.host.remove(); entry.notice?.remove();
  }
  function reconcile(fences: Fence[]) {
    const current = new Set(fences.map(fence => fence.code));
    for (const code of entries.keys()) if (!current.has(code)) remove(code);
    for (const { code, original, streaming, response: source, stateKey } of fences) {
      const response = source ?? code.textContent ?? '';
      const theme = environment?.theme() ?? 'light';
      const previous = entries.get(code);
      if (previous) {
        if (previous.response !== response || previous.streaming !== streaming || previous.theme !== theme) {
          previous.response = response; previous.streaming = streaming; previous.theme = theme;
          try { previous.handle?.update({ response, streaming, theme }); }
          catch (error) { fail(previous, error); }
        }
        continue;
      }
      const host = original.ownerDocument.createElement('div');
      host.setAttribute('data-dsh-openui-island', '');
      original.before(host);
      const root = host.attachShadow({ mode: 'open' });
      // Touch range inputs can keep the composer's focus. Give the island control ownership
      // without cancelling its native pointer behavior or the island's React handlers.
      root.addEventListener('pointerdown', event => {
        if (event.target instanceof HTMLElement) {
          event.target.closest<HTMLElement>('input, button, select, textarea, [tabindex], [contenteditable="true"]')?.focus({ preventScroll: true });
        }
      });
      const entry: Entry = { host, original, hidden: original.hidden, response, streaming, theme, failed: false };
      entries.set(code, entry);
      void load().then(island => {
        if (disposed || entries.get(code) !== entry || !code.isConnected) return;
        entry.handle = island.mount(root, {
          response: entry.response, streaming: entry.streaming,
          theme: entry.theme,
          initialState: stateKey ? environment?.loadState(stateKey) : undefined,
          onStateChange: stateKey ? state => environment?.saveState(stateKey, state) : undefined,
          onReady() { if (!entry.failed && entries.get(code) === entry) original.hidden = true; },
          onError(error) {
            if (entries.get(code) === entry) fail(entry, error);
          },
        });
      }).catch(error => {
        if (entries.get(code) !== entry) return;
        fail(entry, error);
      });
    }
  }
  return { reconcile, dispose() { disposed = true; for (const code of entries.keys()) remove(code); } };
}
