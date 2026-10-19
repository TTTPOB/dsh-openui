import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import { Renderer } from '@openuidev/react-lang';
import { library, ReadyContext } from './catalog';
import styles from './styles.css';

export interface OpenUIAction { type: string; payload?: unknown }
export interface MountOptions {
  response: string;
  streaming?: boolean;
  onAction?: (action: OpenUIAction) => void;
  theme?: 'light' | 'dark';
  /** Hydrated OpenUI runtime state; read once when mounting. */
  initialState?: Record<string, unknown>;
  onStateChange?: (state: Record<string, unknown>) => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
}
export interface IslandHandle { update(options: Partial<MountOptions>): void; unmount(): void }
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
    reactRoot.render(<Boundary key={options.response} onError={error => options.onError?.(error)}><ReadyContext.Provider value={ready}><Renderer.Root response={options.response} library={library} initialState={initial.initialState} onStateUpdate={state => options.onStateChange?.(state)} isStreaming={options.streaming ?? false} publishObservability={false} onError={errors => { if (!options.streaming && errors.some(error => error.severity !== 'warning')) options.onError?.(errors); }}><Renderer.Content /></Renderer.Root></ReadyContext.Provider></Boundary>);
  };
  render();
  return {
    update(next) { if (disposed) return; options = { ...options, ...next }; render(); },
    unmount() { if (disposed) return; disposed = true; reactRoot.unmount(); container.remove(); style.remove(); },
  };
}
(globalThis as typeof globalThis & { __DSH_OPENUI_ISLAND__?: unknown }).__DSH_OPENUI_ISLAND__ = { version: '0.1.0', reactVersion: React.version };
