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
  response: string; streaming: boolean; theme: 'light' | 'dark'; failed: boolean;
}

/** Own only island nodes; preserve the host's source and its original visibility. */
export function createRenderer(load: () => Promise<Island>, environment?: { theme(): 'light' | 'dark'; loadState(key: string): Record<string, unknown> | undefined; saveState(key: string, state: Record<string, unknown>): void }) {
  const entries = new Map<HTMLElement, Entry>();
  let disposed = false;
  function remove(code: HTMLElement) {
    const entry = entries.get(code);
    if (!entry) return;
    entries.delete(code);
    entry.original.hidden = entry.hidden;
    entry.handle?.unmount();
    entry.host.remove();
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
          catch (error) { previous.failed = true; original.hidden = previous.hidden; previous.host.hidden = true; console.warn('[dsh-openui] update failed', error); }
        }
        continue;
      }
      const host = original.ownerDocument.createElement('div');
      host.setAttribute('data-dsh-openui-island', '');
      original.before(host);
      const root = host.attachShadow({ mode: 'open' });
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
            entry.failed = true; original.hidden = entry.hidden; host.hidden = true;
            console.warn('[dsh-openui] render failed', error);
          },
        });
      }).catch(error => {
        if (entries.get(code) !== entry) return;
        entry.failed = true; original.hidden = entry.hidden; host.hidden = true;
        console.warn('[dsh-openui] island unavailable', error);
      });
    }
  }
  return { reconcile, dispose() { disposed = true; for (const code of entries.keys()) remove(code); } };
}
