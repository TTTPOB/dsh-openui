import React, { createContext, useContext, useEffect } from 'react';
import { createLibrary, defineComponent, reactive, useStateField, useRenderNode, useIsStreaming } from '@openuidev/react-lang';
import { z } from 'zod/v4';

export const ReadyContext = createContext<(() => void) | undefined>(undefined);
const Text = defineComponent({
  name: 'Text', description: 'Display text or a computed number. Formats: text, percent, decimal.',
  props: z.object({ value: z.union([z.string(), z.number()]), format: z.enum(['text', 'percent', 'decimal']).optional() }),
  component: ({ props }) => <output>{typeof props.value === 'number' && props.format === 'percent' ? (props.value * 100).toFixed(2) + '%' : typeof props.value === 'number' && props.format === 'decimal' ? props.value.toFixed(2) : String(props.value ?? '')}</output>,
});
const Stack = defineComponent({
  name: 'Stack', description: 'Vertical group of components.', props: z.object({ children: z.array(z.any()) }),
  component: ({ props }) => { const render = useRenderNode(); return <div className="stack">{props.children?.map((child, i) => <React.Fragment key={i}>{render(child)}</React.Fragment>)}</div>; },
});
const Card = defineComponent({
  name: 'Card', description: 'A titled panel. Use as the root component.', props: z.object({ title: z.string(), children: z.array(z.any()) }),
  component: ({ props }) => { const render = useRenderNode(); const ready = useContext(ReadyContext); useEffect(() => { ready?.(); }, [ready]); return <section className="card"><h2>{props.title}</h2><div className="stack">{props.children?.map((child, i) => <React.Fragment key={i}>{render(child)}</React.Fragment>)}</div></section>; },
});
const Slider = defineComponent({
  name: 'Slider', description: 'Local numeric slider. Pass a $variable as value for two-way reactive binding.',
  props: z.object({ label: z.string(), min: z.number(), max: z.number(), step: z.number(), value: reactive(z.number()) }),
  component: ({ props }) => { const field = useStateField<number>(props.label, props.value); const streaming = useIsStreaming(); return <label className="slider"><span>{props.label}: <output>{String(field.value ?? props.min)}</output></span><input type="range" aria-label={props.label} min={props.min} max={props.max} step={props.step} value={Number(field.value ?? props.min)} disabled={streaming} onChange={event => field.setValue(Number(event.currentTarget.value))} /></label>; },
});
const Button = defineComponent({
  name: 'Button', description: 'Set a bound local numeric variable. Never sends a model request.', props: z.object({ label: z.string(), value: reactive(z.number()), next: z.number() }),
  component: ({ props }) => { const field = useStateField<number>(props.label, props.value); const streaming = useIsStreaming(); return <button disabled={streaming} onClick={() => field.setValue(props.next)}>{props.label}</button>; },
});
export const library = createLibrary({ components: [Text, Stack, Card, Slider, Button], root: 'Card' });
