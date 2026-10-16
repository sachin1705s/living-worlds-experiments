import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { create, act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const temp = await mkdtemp(resolve('node_modules/.decision-test-'));
after(() => rm(temp, { recursive: true, force: true }));
const source = await readFile('components/kid/KidDecisionInput.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const file = resolve(temp, 'input.mjs');
await writeFile(file, compiled);
const { KidDecisionInput } = await import(pathToFileURL(file));

async function mount({ mic = true } = {}) {
  const timers = new Map();
  const submitted = [];
  let recognition;
  let silence = 0;
  let id = 0;
  class Recognition {
    starts = 0;
    constructor() { recognition = this; }
    start() { this.starts++; this.onstart?.(); }
    stop() { this.onend?.(); }
  }
  globalThis.window = {
    ...(mic ? { SpeechRecognition: Recognition } : {}),
    setTimeout: fn => { const key = ++id; timers.set(key, fn); return key; },
    clearTimeout: key => timers.delete(key),
  };
  let renderer;
  await act(() => { renderer = create(React.createElement(KidDecisionInput, {
    thinking: false, turnReady: true, onSubmit: text => submitted.push(text),
    onSilence: () => silence++,
  })); });
  const input = () => renderer.root.findByProps({ 'aria-label': 'Type what the rabbit should do' });
  const button = text => renderer.root.findAllByType('button').find(node => node.children.includes(text));
  return { renderer, recognition, timers, submitted, input, button, silence: () => silence };
}

test('typed decisions submit through Send without microphone support', async () => {
  const ui = await mount({ mic: false });
  await act(() => ui.input().props.onChange({ target: { value: 'Hide behind the tree' } }));
  assert.equal(ui.button('Send ').props.disabled, false);
  await act(() => ui.button('Send ').props.onClick());
  assert.deepEqual(ui.submitted, ['Hide behind the tree']);
  await act(() => ui.renderer.unmount());
});

test('Enter submits typed text, including a short choice, and IME Enter does not', async () => {
  const ui = await mount();
  await act(() => ui.input().props.onChange({ target: { value: 'Run' } }));
  await act(() => ui.input().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() {} }));
  assert.deepEqual(ui.submitted, []);
  await act(() => ui.input().props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() {} }));
  assert.deepEqual(ui.submitted, ['Run']);
  assert.equal(ui.recognition.starts, 0);
  await act(() => ui.renderer.unmount());
});

test('switching from speech to typing cancels auto-submit and ignores late mic results', async () => {
  const ui = await mount();
  await act(() => ui.button('Speak a decision').props.onClick());
  assert.equal(ui.recognition.starts, 1);
  const result = text => ({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
  await act(() => ui.recognition.onresult(result('Walk to the lion')));
  await act(() => ui.button('Type a decision').props.onClick());
  await act(() => ui.input().props.onChange({ target: { value: 'Help the rabbit escape' } }));
  await act(() => ui.recognition.onresult(result('Unwanted late speech')));
  await act(() => { for (const fn of [...ui.timers.values()]) fn(); });
  assert.equal(ui.input().props.value, 'Help the rabbit escape');
  assert.deepEqual(ui.submitted, []);
  assert.equal(ui.silence(), 0);
  await act(() => ui.button('Send ').props.onClick());
  assert.deepEqual(ui.submitted, ['Help the rabbit escape']);
  await act(() => ui.renderer.unmount());
});

test('spoken decisions still use the same submission handler', async () => {
  const ui = await mount();
  await act(() => ui.button('Speak a decision').props.onClick());
  await act(() => ui.recognition.onresult({ resultIndex: 0, results: [
    { isFinal: true, 0: { transcript: 'Hide behind the tree' } },
  ] }));
  await act(() => { for (const fn of [...ui.timers.values()]) fn(); });
  assert.deepEqual(ui.submitted, ['Hide behind the tree']);
  await act(() => ui.renderer.unmount());
});
