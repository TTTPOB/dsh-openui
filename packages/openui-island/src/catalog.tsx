import React, { createContext, useContext, useEffect } from 'react';
import { createLibrary, defineComponent, reactive, useStateField, useRenderNode, useIsStreaming } from '@openuidev/react-lang';
import { z } from 'zod/v4';
import { functions } from './functions';

export const ReadyContext = createContext<(() => void) | undefined>(undefined);
const valueSchema = z.union([z.string(), z.number()]);
const formatSchema = z.enum(['text', 'percent', 'decimal']);
const childrenSchema = z.array(z.any());

function formatValue(value: string | number, format?: string) {
  if (typeof value !== 'number') return String(value ?? '');
  if (format === 'percent') return (value * 100).toFixed(2) + '%';
  return format === 'decimal' ? value.toFixed(2) : String(value);
}
function Children({ nodes }: { nodes: unknown[] }) {
  const render = useRenderNode();
  return <>{nodes?.map((node, index) => <React.Fragment key={index}>{render(node)}</React.Fragment>)}</>;
}
const Text = defineComponent({
  name: 'Text', description: 'Display text or a computed number. Formats: text, percent (ratio × 100), decimal (2 places).',
  props: z.object({ value: valueSchema, format: formatSchema.optional() }),
  component: ({ props }) => <output>{formatValue(props.value, props.format)}</output>,
});
const Stack = defineComponent({
  name: 'Stack', description: 'Vertical group of components.', props: z.object({ children: childrenSchema }),
  component: ({ props }) => <div className="stack"><Children nodes={props.children} /></div>,
});
const Row = defineComponent({
  name: 'Row', description: 'Horizontal group that wraps on narrow screens.', props: z.object({ children: childrenSchema }),
  component: ({ props }) => <div className="row"><Children nodes={props.children} /></div>,
});
const Grid = defineComponent({
  name: 'Grid', description: 'Responsive equal-width columns; collapses on narrow screens. Best for Metric cards.',
  props: z.object({ children: childrenSchema, columns: z.number().int().min(1).max(4).optional() }),
  component: ({ props }) => <div className="grid" style={{ '--columns': props.columns ?? 3 } as React.CSSProperties}><Children nodes={props.children} /></div>,
});
const Card = defineComponent({
  name: 'Card', description: 'A titled panel. Use as the root component.', props: z.object({ title: z.string(), children: childrenSchema }),
  component: ({ props }) => {
    const ready = useContext(ReadyContext);
    useEffect(() => { ready?.(); }, [ready]);
    return <section className="card"><h2>{props.title}</h2><div className="stack"><Children nodes={props.children} /></div></section>;
  },
});
const Metric = defineComponent({
  name: 'Metric', description: 'Label and prominent computed value. Tone: neutral, positive, warning, negative. Choose tone from meaning or compute it with an expression. Optional detail explains the metric.',
  props: z.object({ label: z.string(), value: valueSchema, format: formatSchema.optional(), tone: z.enum(['neutral', 'positive', 'warning', 'negative']).optional(), detail: z.string().optional() }),
  component: ({ props }) => <div className="metric" data-tone={props.tone ?? 'neutral'}><span className="muted metric-label">{props.label}</span><output className="metric-value">{formatValue(props.value, props.format)}</output>{props.detail && <span className="muted metric-detail">{props.detail}</span>}</div>,
});
const Slider = defineComponent({
  name: 'Slider', description: 'Local numeric slider. Pass a $variable as value for two-way reactive binding.',
  props: z.object({ label: z.string(), min: z.number(), max: z.number(), step: z.number(), value: reactive(z.number()) }),
  component: ({ props }) => {
    const field = useStateField<number>(props.label, props.value);
    const streaming = useIsStreaming();
    const value = Number(field.value ?? props.min);
    const progress = props.max > props.min ? Math.max(0, Math.min(100, (value - props.min) / (props.max - props.min) * 100)) : 0;
    return <label className="slider"><span className="slider-label"><span>{props.label}</span><output>{value}</output></span><input type="range" aria-label={props.label} min={props.min} max={props.max} step={props.step} value={value} disabled={streaming} style={{ '--progress': progress + '%' } as React.CSSProperties} onChange={event => field.setValue(Number(event.currentTarget.value))} /></label>;
  },
});
const Button = defineComponent({
  name: 'Button', description: 'Set a bound local numeric variable. Never sends a model request.',
  props: z.object({ label: z.string(), value: reactive(z.number()), next: z.number() }),
  component: ({ props }) => {
    const field = useStateField<number>(props.label, props.value);
    const streaming = useIsStreaming();
    return <button disabled={streaming} onClick={() => field.setValue(props.next)}>{props.label}</button>;
  },
});
const Table = defineComponent({
  name: 'Table', description: 'Data table with a caption, column headings and rows of text/numbers. Scrolls within its own panel on small screens.',
  props: z.object({ title: z.string(), columns: z.array(z.string()), rows: z.array(z.array(valueSchema)) }),
  component: ({ props }) => <div className="table-scroll" tabIndex={0} role="region" aria-label={props.title}><table><caption>{props.title}</caption><thead><tr>{props.columns?.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead><tbody>{props.rows?.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{String(cell ?? '')}</td>)}</tr>)}</tbody></table></div>,
});
const Chart = defineComponent({
  name: 'Chart', description: 'Lightweight single-series SVG bar or line chart. Pass category labels and computed numeric values; supports negative values and updates locally.',
  props: z.object({ title: z.string(), kind: z.enum(['bar', 'line']), labels: z.array(z.string()), values: z.array(z.number()) }),
  component: ({ props }) => {
    // Streaming partial expressions or division by zero must not create invalid SVG coordinates.
    const values = (props.values ?? []).map(value => Number.isFinite(value) ? value : 0);
    const min = Math.min(0, ...values), max = Math.max(0, ...values);
    const span = max - min || 1;
    const y = (value: number) => 150 - (value - min) / span * 120;
    const width = 480 / Math.max(1, values.length);
    const x = (index: number) => 50 + (index + 0.5) * width;
    const label = (index: number) => props.labels?.[index] ?? String(index + 1);
    return <figure className="chart"><figcaption>{props.title}</figcaption><svg viewBox="0 0 580 196" role="img" aria-label={props.title}>
      <title>{props.title}</title><desc>{values.map((value, index) => label(index) + ': ' + value).join('; ')}</desc>
      {[min, max].map((value, index) => <g key={index}><line className="chart-grid" x1="48" x2="534" y1={y(value)} y2={y(value)} /><text className="chart-axis" x="40" y={y(value) + 4} textAnchor="end">{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</text></g>)}
      <line className="chart-baseline" x1="48" x2="534" y1={y(0)} y2={y(0)} />
      {props.kind === 'line' && <polyline className="chart-line" points={values.map((value, index) => x(index) + ',' + y(value)).join(' ')} />}
      {values.map((value, index) => <g key={index}>{props.kind === 'bar' ? <rect className="chart-bar" x={x(index) - width * 0.27} y={Math.min(y(value), y(0))} width={width * 0.54} height={Math.abs(y(value) - y(0))} rx="3"><title>{label(index) + ': ' + value}</title></rect> : <circle className="chart-point" cx={x(index)} cy={y(value)} r="4"><title>{label(index) + ': ' + value}</title></circle>}<text className="chart-axis" x={x(index)} y="178" textAnchor="middle">{label(index).slice(0, 14)}</text></g>)}
    </svg></figure>;
  },
});
export const library = createLibrary({ components: [Text, Stack, Row, Grid, Card, Metric, Slider, Button, Table, Chart], functions, root: 'Card' });
