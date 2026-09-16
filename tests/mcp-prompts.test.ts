import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MCP_PROMPTS, RULES, renderPrompt } from '../lib/mcp-prompts';
import { MCP_TOOLS } from '../lib/mcp';

// Un prompt che nomina uno strumento che non esiste manda il modello a
// cercare dati che non troverà, e lui riempirà il buco da solo.

test('ogni strumento nominato nei prompt esiste', () => {
  const tools = new Set(MCP_TOOLS.map((t) => t.name));
  for (const p of MCP_PROMPTS) {
    for (const name of `${p.body} ${RULES}`.match(/radar_[a-z_]+/g) ?? []) {
      if (MCP_PROMPTS.some((x) => x.name === name)) continue;
      assert.ok(tools.has(name), `il prompt ${p.name} nomina ${name}, che non è uno strumento`);
    }
  }
});

test('ogni segnaposto è un argomento dichiarato', () => {
  for (const p of MCP_PROMPTS) {
    const declared = new Set(['project', ...p.args.map((a) => a.name)]);
    for (const m of p.body.matchAll(/\{\{(\w+)\}\}/g)) {
      assert.ok(declared.has(m[1]), `${p.name}: {{${m[1]}}} non è un argomento`);
    }
  }
});

test('i prompt compilati non lasciano segnaposti', () => {
  for (const p of MCP_PROMPTS) {
    const text = renderPrompt(p, { project: 'Ferrari', topic: 'richiamo', recipient: 'CMO' });
    assert.ok(!/\{\{\w+\}\}/.test(text), p.name);
  }
  const crisis = MCP_PROMPTS.find((p) => p.name === 'radar_crisis_response')!;
  assert.ok(renderPrompt(crisis, { topic: 'richiamo' }).includes('Evento: richiamo.'));
});

test('nomi di prompt e strumenti non si sovrappongono', () => {
  const tools = new Set(MCP_TOOLS.map((t) => t.name));
  for (const p of MCP_PROMPTS) assert.ok(!tools.has(p.name), p.name);
  assert.equal(new Set(MCP_PROMPTS.map((p) => p.name)).size, MCP_PROMPTS.length);
});
