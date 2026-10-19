import { createRenderer, type Island } from './lifecycle';
import { findContainer, findFences, type ChatSnapshot } from './discovery';

export const name = 'dsh-openui';
export const inject = ['sessions', 'uiSession', 'uiConversation', 'theme'];
interface Observable<T> { getSnapshot(): T; subscribe(listener: () => void): () => void }
interface ClientContext {
  sessions: { binding(id: string): unknown };
  uiConversation: { binding(binding: unknown): { target(name: 'chat'): Observable<ChatSnapshot | undefined> } };
  effect(install: () => () => void, label?: string): void;
  on(event: 'theme/change', listener: () => void): () => void;
  theme: { getTheme(): { active: { colorScheme: 'light' | 'dark' } } };
  uiSession: { adapter: { current: { getSnapshot(): { key?: string }; subscribe(listener: () => void): () => void } } };
}
const PREFIX = 'dsh-openui:state:';

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    // State survives session switches, but a page reload starts from DSL defaults.
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key); }
    catch (error) { console.warn('[dsh-openui] session storage unavailable', error); }
    let island: Promise<Island> | undefined;
    const renderer = createRenderer(() => island ??= import(/* @vite-ignore */ new URL('dsh-openui/island.js', document.baseURI).href), {
      theme: () => ctx.theme.getTheme().active.colorScheme,
      loadState(key) {
        try { const value = sessionStorage.getItem(PREFIX + key); return value ? JSON.parse(value) : undefined; }
        catch (error) { console.warn('[dsh-openui] state restore failed', error); return undefined; }
      },
      saveState(key, state) {
        try { sessionStorage.setItem(PREFIX + key, JSON.stringify(state)); }
        catch (error) { console.warn('[dsh-openui] state save failed', error); }
      },
    });
    let container: HTMLElement | null = null;
    let snapshot: ChatSnapshot | undefined;
    let stopTarget: (() => void) | undefined;
    let frame = 0;
    const scan = () => {
      frame = 0;
      connect();
      const sessionId = ctx.uiSession.adapter.current.getSnapshot().key;
      renderer.reconcile(container?.isConnected && sessionId ? findFences(container, sessionId, snapshot) : []);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(scan); };
    const observer = new MutationObserver(schedule);
    const connect = () => {
      const next = findContainer(document);
      if (next === container) return;
      observer.disconnect(); renderer.reconcile([]); container = next;
      if (container) observer.observe(container, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-streaming', 'data-chat-group-part', 'data-turn-process-hidden'] });
    };
    schedule();
    const bindSession = () => {
      stopTarget?.(); stopTarget = undefined; snapshot = undefined;
      const id = ctx.uiSession.adapter.current.getSnapshot().key;
      const binding = id ? ctx.sessions.binding(id) : undefined;
      if (binding) {
        const target = ctx.uiConversation.binding(binding).target('chat');
        const update = () => { snapshot = target.getSnapshot(); schedule(); };
        stopTarget = target.subscribe(update); update();
      } else schedule();
    };
    const unsubscribeSession = ctx.uiSession.adapter.current.subscribe(bindSession);
    bindSession();
    const unsubscribeTheme = ctx.on('theme/change', schedule);
    // Snapshot events connect next frame; polling only catches silent container replacement.
    const timer = window.setInterval(() => { if (findContainer(document) !== container) schedule(); }, 500);
    return () => {
      window.clearInterval(timer); observer.disconnect(); unsubscribeSession(); unsubscribeTheme(); stopTarget?.();
      if (frame) cancelAnimationFrame(frame);
      renderer.dispose();
    };
  }, 'dsh-openui: assistant fences');
}
