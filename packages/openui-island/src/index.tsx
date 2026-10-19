import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import { Renderer } from '@openuidev/react-lang';
import { library, ReadyContext } from './catalog';

export interface OpenUIAction { type: string; payload?: unknown }
export interface MountOptions {
  response: string;
  streaming?: boolean;
  onAction?: (action: OpenUIAction) => void;
  theme?: 'light' | 'dark';
  onReady?: () => void;
  onError?: (error: unknown) => void;
}
export interface IslandHandle { update(options: Partial<MountOptions>): void; unmount(): void }
const styles = "@keyframes openui-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}:host{display:block;color:var(--openui-color,#172033);font:14px/1.5 system-ui,sans-serif}*{box-sizing:border-box}.card{min-width:0;overflow-wrap:anywhere;border:1px solid #cbd5e1;border-radius:12px;padding:20px;background:var(--openui-background,#fff)}h2{margin:0 0 16px;font-size:18px}.stack{display:flex;flex-direction:column;gap:10px}.slider{display:flex;flex-direction:column;gap:6px}input[type=range]{width:100%;min-height:44px;margin:0;touch-action:pan-y;accent-color:#2563eb}output{font-variant-numeric:tabular-nums}button{min-height:44px;padding:8px 12px;border:1px solid #94a3b8;border-radius:6px;cursor:pointer}[data-theme=dark]{--openui-background:#172033;--openui-color:#f1f5f9;color:var(--openui-color)}";
class Boundary extends Component<{ children: React.ReactNode; onError: (error: unknown) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}
// All DOM nodes are created through the target document, not the ambient host.
export function mount(root: ShadowRoot, initial: MountOptions): IslandHandle {
  const doc = root.ownerDocument;
  const style = doc.createElement('style'); style.textContent = styles;
  const container = doc.createElement('div'); container.dataset.openuiContent = '';
  root.append(style, container);
  let options = { ...initial };
  let disposed = false;
  const reactRoot = createRoot(container, { onUncaughtError: error => options.onError?.(error) });
  const ready = () => { if (!disposed && container.querySelector('.card')) options.onReady?.(); };
  const render = () => {
    container.dataset.theme = options.theme ?? 'light';
    reactRoot.render(<Boundary key={options.response} onError={error => options.onError?.(error)}><ReadyContext.Provider value={ready}><Renderer.Root response={options.response} library={library} isStreaming={options.streaming ?? false} publishObservability={false} onError={errors => { if (!options.streaming && errors.some(error => error.severity !== 'warning')) options.onError?.(errors); }}><Renderer.Content /></Renderer.Root></ReadyContext.Provider></Boundary>);
  };
  render();
  return {
    update(next) { if (disposed) return; options = { ...options, ...next }; render(); },
    unmount() { if (disposed) return; disposed = true; reactRoot.unmount(); container.remove(); style.remove(); },
  };
}
(globalThis as typeof globalThis & { __DSH_OPENUI_ISLAND__?: unknown }).__DSH_OPENUI_ISLAND__ = { version: '0.1.0', reactVersion: React.version };
