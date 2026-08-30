// @vitest-environment jsdom
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, test, vi } from 'vitest';
import pkg from '../../package.json';
import { DEFAULT_SAVED_MODELS_KEY, loadSavedSeatModels } from '../defaultSeatModels';

const { mockSettings, mockDiscovered } = vi.hoisted(() => ({ mockSettings: {}, mockDiscovered: [] }));

vi.mock('../api', () => ({
  api: { getSettings: async () => mockSettings.value },
  buildAvailableSearchProviders: () => [],
  DEFAULT_EXECUTION_MODE: 'full',
}));

vi.mock('../configuredModels', async (importOriginal) => ({
  ...(await importOriginal()),
  discoverConfiguredModels: async () => mockDiscovered.value,
}));

vi.mock('../modelmixApi', () => {
  class ModelMixHttpError extends Error {
    constructor(message, status = 0) {
      super(message);
      this.status = status;
    }
  }
  return {
    ModelMixHttpError,
    cancelModelMixRun: async () => {},
    consumeModelMixSSE: async () => { throw new Error('not used in render test'); },
    hydrateModelMixSession: async () => { throw new ModelMixHttpError('no session found', 404); },
    replayModelMixRun: async () => { throw new Error('not used in render test'); },
    startModelMixRun: async () => { throw new Error('not used in render test'); },
  };
});

import ModelMixObserver from './ModelMixObserver.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DISCOVERED = [
  { id: 'openai-oauth:gpt-5', name: 'gpt-5 (ChatGPT)', provider: 'OpenAI' },
  { id: 'ollama:llama3', name: 'llama3', provider: 'Ollama' },
  { id: 'openai-oauth:alt', name: 'Alt model', provider: 'OpenAI' },
];

const ALL_CONFIGURED = {
  enabled_providers: {
    openrouter: true,
    ollama: true,
    direct: true,
    custom: true,
    'xai-oauth': true,
    'openai-oauth': true,
    'github-copilot': true,
  },
  openrouter_api_key_set: true,
  ollama_base_url: 'http://localhost:11434',
  openai_api_key_set: true,
  custom_endpoint_url: 'http://localhost:8765',
  xai_oauth_connected: true,
  openai_oauth_connected: true,
  github_copilot_connected: true,
};

const mounted = [];

beforeEach(() => {
  mockSettings.value = {};
  mockDiscovered.value = DISCOVERED;
});

afterEach(() => {
  mockSettings.value = {};
  mockDiscovered.value = [];
  for (const { root, container } of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  window.localStorage.clear();
});

// Do NOT clear localStorage here: saved-defaults tests seed before rendering.
async function renderObserver() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ModelMixObserver />);
  });
  await act(async () => {});
  mounted.push({ root, container });
  return { container, root };
}

function click(element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function openSettings() {
  click(document.querySelector('.modelmix-settings-toggle'));
}

function navButton(label) {
  return [...document.querySelectorAll('.modelmix-settings-nav-item')].find((button) => button.textContent === label);
}

function selectedLabel(inputId) {
  const control = document.getElementById(inputId).closest('.model-select__control');
  const single = control.querySelector('.model-select__single-value');
  return single ? single.textContent : null;
}

test('gear button opens a settings dialog and the close control dismisses it', async () => {
  await renderObserver();
  assert.equal(document.querySelector('.modelmix-settings'), null);
  assert.ok(!document.body.textContent.includes('Settings'));

  openSettings();
  const dialog = document.querySelector('.modelmix-settings');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.ok(dialog.textContent.includes('Settings'));
  assert.equal(document.querySelector('.modelmix-settings-toggle').getAttribute('aria-expanded'), 'true');

  click(document.querySelector('.modelmix-settings-close'));
  assert.equal(document.querySelector('.modelmix-settings'), null);
  assert.ok(!document.body.textContent.includes('Settings'));
});

test('About section renders the version from package.json with license and attribution', async () => {
  await renderObserver();
  openSettings();
  const section = document.querySelector('.modelmix-settings-section');
  assert.ok(section.textContent.includes(`Version ${pkg.version}`));
  assert.ok(section.textContent.includes('Jacob Ben David'));
  assert.ok(section.textContent.includes('The AI Counsel'));

  click(navButton('Defaults'));
  click(navButton('About'));
  assert.ok(document.querySelector('.modelmix-settings-section').textContent.includes(`Version ${pkg.version}`));
});

test('Providers section lists every source as connected for all-configured settings with no credential values', async () => {
  mockSettings.value = ALL_CONFIGURED;
  await renderObserver();
  openSettings();
  click(navButton('Providers'));

  const statuses = [...document.querySelectorAll('.modelmix-provider-status')];
  assert.deepEqual(statuses.map((node) => node.textContent), [
    'Connected', 'Connected', 'Connected', 'Connected', 'Connected',
  ]);
  assert.ok(statuses.every((node) => node.getAttribute('data-connected') === 'true'));
  assert.deepEqual(
    [...document.querySelectorAll('.modelmix-provider-name')].map((node) => node.textContent),
    ['OpenRouter', 'Ollama (local)', 'Direct API keys', 'Custom endpoint', 'OAuth accounts'],
  );

  const listText = document.querySelector('.modelmix-provider-list').textContent;
  assert.ok(!listText.includes('sk-'));
  assert.ok(!listText.includes('11434'));
  assert.ok(!listText.includes('8765'));
});

test('Providers section lists every source as not connected when nothing is configured', async () => {
  mockSettings.value = {};
  await renderObserver();
  openSettings();
  click(navButton('Providers'));

  const statuses = [...document.querySelectorAll('.modelmix-provider-status')];
  assert.deepEqual(statuses.map((node) => node.textContent), [
    'Not connected', 'Not connected', 'Not connected', 'Not connected', 'Not connected',
  ]);
  assert.ok(statuses.every((node) => node.getAttribute('data-connected') === 'false'));
});

test('without saved defaults the hardcoded built-in seat selections win on mount', async () => {
  await renderObserver();
  assert.equal(selectedLabel('modelmix-worker-a-model'), 'gpt-5 (ChatGPT)');
  assert.equal(selectedLabel('modelmix-worker-b-model'), 'llama3');
  assert.equal(selectedLabel('modelmix-moderator-model'), null);
});

test('saved defaults win over the hardcoded selections on mount', async () => {
  window.localStorage.setItem(DEFAULT_SAVED_MODELS_KEY, JSON.stringify({
    worker_a: 'openai-oauth:alt',
    moderator: 'openai-oauth:gpt-5',
    worker_b: 'ollama:llama3',
  }));
  await renderObserver();
  assert.equal(selectedLabel('modelmix-worker-a-model'), 'Alt model');
  assert.equal(selectedLabel('modelmix-moderator-model'), 'gpt-5 (ChatGPT)');
  assert.equal(selectedLabel('modelmix-worker-b-model'), 'llama3');

  openSettings();
  click(navButton('Defaults'));
  assert.ok(document.querySelector('.modelmix-settings-section').textContent.includes('Saved defaults will be applied on the next load.'));
});

test('a corrupted saved value falls back to the built-in defaults without throwing', async () => {
  window.localStorage.setItem(DEFAULT_SAVED_MODELS_KEY, 'definitely-not-json{{{');
  await renderObserver();
  assert.equal(selectedLabel('modelmix-worker-a-model'), 'gpt-5 (ChatGPT)');
  assert.equal(selectedLabel('modelmix-worker-b-model'), 'llama3');
  assert.equal(selectedLabel('modelmix-moderator-model'), null);
});

test('Defaults section saves the current selections and Clear removes them', async () => {
  await renderObserver();
  openSettings();
  click(navButton('Defaults'));

  const section = document.querySelector('.modelmix-settings-section');
  assert.ok(section.textContent.includes('No saved defaults — built-in defaults apply.'));
  assert.ok(section.textContent.includes('openai-oauth:gpt-5'));
  assert.ok(section.textContent.includes('None'));
  assert.ok(section.textContent.includes('ollama:llama3'));
  assert.equal(document.querySelector('.modelmix-settings-clear').disabled, true);

  click(document.querySelector('.modelmix-settings-save'));
  assert.deepEqual(loadSavedSeatModels(window.localStorage), {
    worker_a: 'openai-oauth:gpt-5',
    moderator: '',
    worker_b: 'ollama:llama3',
  });
  assert.ok(document.querySelector('.modelmix-settings-section').textContent.includes('Saved defaults will be applied on the next load.'));
  assert.equal(document.querySelector('.modelmix-settings-clear').disabled, false);

  click(document.querySelector('.modelmix-settings-clear'));
  assert.equal(loadSavedSeatModels(window.localStorage), null);
  assert.ok(document.querySelector('.modelmix-settings-section').textContent.includes('No saved defaults — built-in defaults apply.'));
  assert.equal(document.querySelector('.modelmix-settings-clear').disabled, true);
});