import type { Fence } from './lifecycle';

export interface ChatNode { key: string; kind: string; visibility?: string; data: { blocks?: { kind: string; text?: string }[]; status?: string } }
export interface ChatSnapshot { nodes: { values(): Iterable<ChatNode> } }
export interface MarkdownFence { language: string; body: string }
const normalize = (text: string) => text.replace(/\r\n/g, '\n').replace(/\n$/, '');

/** Parse fenced blocks, including the open final fence while streaming. */
export function parseFences(markdown: string): MarkdownFence[] {
  const result: MarkdownFence[] = [];
  let current: { delimiter: string; length: number; language: string; lines: string[] } | undefined;
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (!current) {
      const fence = line.match(/^ {0,3}([`]{3,}|~{3,})(.*)$/);
      if (!fence) continue;
      const delimiter = fence[1][0];
      if (delimiter === '`' && fence[2].includes('`')) continue;
      current = { delimiter, length: fence[1].length, language: fence[2].trim().split(/\s+/, 1)[0], lines: [] };
    } else {
      const closing = line.match(/^ {0,3}([`~]+)\s*$/);
      if (closing && closing[1][0] === current.delimiter && [...closing[1]].every(char => char === current!.delimiter) && closing[1].length >= current.length) {
        result.push({ language: current.language, body: current.lines.join('\n') }); current = undefined;
      } else current.lines.push(line);
    }
  }
  if (current) result.push({ language: current.language, body: normalize(current.lines.join('\n')) });
  return result;
}

export function findContainer(doc: Document): HTMLElement | null { return doc.querySelector('[data-chat-flow]'); }

export function findFences(container: HTMLElement, sessionId: string, snapshot?: ChatSnapshot): Fence[] {
  const fences: Fence[] = [];
  if (!snapshot) return fences;
  const rows = [...container.querySelectorAll<HTMLElement>('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')];
  for (const node of snapshot.nodes.values()) {
    if (node.kind !== 'assistant-step' || node.visibility !== 'visible') continue;
    const row = rows.find(row => row.dataset.chatNodeKey === node.key);
    if (!row || row.hasAttribute('data-turn-process-hidden') || row.closest('[hidden]')) continue;
    const blocks = [...row.querySelectorAll<HTMLElement>('.md-code-block')];
    const used = new Set<number>();
    for (const block of node.data.blocks ?? []) {
      if (block.kind !== 'text') continue;
      for (const fence of parseFences(block.text ?? '')) {
        const index = blocks.findIndex((original, index) => !used.has(index) && normalize(original.querySelector('[data-code-block-content] pre code')?.textContent ?? '') === normalize(fence.body));
        if (index < 0) continue;
        used.add(index);
        if (fence.language !== 'openui-lang') continue;
        const original = blocks[index];
        const code = original.querySelector<HTMLElement>('[data-code-block-content] pre code')!;
        fences.push({ code, original, stateKey: JSON.stringify([sessionId, node.key, index]), response: fence.body, streaming: node.data.status === 'running' });
      }
    }
  }
  return fences;
}
