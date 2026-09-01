import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { configuredSources, discoverConfiguredModels } from '../configuredModels';
import MarkdownContent from './MarkdownContent';
import SearchableModelSelect from './SearchableModelSelect';
import { DEFAULT_PANEL_VIEW, getPanelViewClasses, panelLayoutNeedsReset } from '../panelView';
import { buildSeatTelemetry } from '../seatTelemetry';
import {
  clearSavedSeatModels,
  FALLBACK_SEAT_MODELS,
  loadSavedSeatModels,
  saveSeatModels,
} from '../defaultSeatModels';
import {
  clearGuardrailOverride,
  loadGuardrailOverride,
  MAX_OUTPUT_CHARS_BOUND,
  MIN_OUTPUT_CHARS_BOUND,
  saveGuardrailOverride,
  validateGuardrailOverride,
} from '../guardrailSettings';
import { loadSavedMode, MODES, saveMode } from '../modelmixMode';
import pkg from '../../package.json';
import {
  cancelModelMixRun,
  consumeModelMixSSE,
  hydrateModelMixSession,
  ModelMixHttpError,
  replayModelMixRun,
  startModelMixRun,
} from '../modelmixApi';
import {
  applyModelMixEvent,
  applyReplayError,
  archiveCurrentRun,
  controlState,
  createModelMixState,
  isTerminalOverall,
  hydrateModelMixState,
  modelSelectorsDisabled,
  startNewSession,
} from '../modelmixState';
import './ModelMixObserver.css';

const reconnectDelay = () => new Promise((resolve) => setTimeout(resolve, 500));

export default function ModelMixObserver() {
  const [prompt, setPrompt] = useState('Explain why independent answers can improve reliability.');
  const savedSeatModels = useMemo(() => loadSavedSeatModels(window.localStorage), []);
  const [workerAModel, setWorkerAModel] = useState(savedSeatModels?.worker_a ?? FALLBACK_SEAT_MODELS.worker_a);
  const [moderatorModel, setModeratorModel] = useState(savedSeatModels?.moderator ?? FALLBACK_SEAT_MODELS.moderator);
  const [workerBModel, setWorkerBModel] = useState(savedSeatModels?.worker_b ?? FALLBACK_SEAT_MODELS.worker_b);
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const [observer, setObserver] = useState(createModelMixState);
  const observerRef = useRef(observer);
  const connectionRef = useRef(null);
  const historicalModelsRef = useRef(new Set());
  const [panelView, setPanelView] = useState(DEFAULT_PANEL_VIEW);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('about');
  const [settingsSnapshot, setSettingsSnapshot] = useState(null);
  const [defaultsRevision, setDefaultsRevision] = useState(0);
  const [guardrailsRevision, setGuardrailsRevision] = useState(0);
  const [mode, setMode] = useState(() => loadSavedMode(window.localStorage));

  const updateObserver = useCallback((updater) => {
    setObserver((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      observerRef.current = next;
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((seatKey) => {
    setPanelView((current) => ({
      ...current,
      collapsed: current.collapsed.includes(seatKey)
        ? current.collapsed.filter((key) => key !== seatKey)
        : [...current.collapsed, seatKey],
    }));
  }, []);

  const toggleMaximize = useCallback((seatKey) => {
    setPanelView((current) => ({ ...current, maximized: current.maximized === seatKey ? '' : seatKey }));
  }, []);

  const resetPanelLayout = useCallback(() => setPanelView(DEFAULT_PANEL_VIEW), []);

  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      try {
        const settings = await api.getSettings();
        if (!cancelled) setSettingsSnapshot(settings);
        const discovered = await discoverConfiguredModels(api, settings);
        if (cancelled) return;
        const historical = Array.from(historicalModelsRef.current)
          .filter((id) => !discovered.some((model) => model.id === id))
          .map((id) => ({ id, name: `${id} (historical)`, provider: 'Historical' }));
        setModels([...discovered, ...historical]);
        const discoveredIds = new Set(discovered.map((model) => model.id));
        setWorkerAModel((current) => discoveredIds.has(current) || historicalModelsRef.current.has(current) ? current : '');
        setModeratorModel((current) => discoveredIds.has(current) || historicalModelsRef.current.has(current) ? current : '');
        setWorkerBModel((current) => discoveredIds.has(current) || historicalModelsRef.current.has(current) ? current : '');
        if (discovered.length === 0) {
          setModelsError('No models were discovered from configured providers.');
        }
      } catch (error) {
        if (!cancelled) {
          setModelsError(error instanceof Error ? error.message : 'Failed to discover configured models.');
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    };
    loadModels();
    return () => {
      cancelled = true;
      connectionRef.current?.abort();
    };
  }, []);

  const handleEvent = useCallback((event) => {
    updateObserver((current) => applyModelMixEvent(current, event));
  }, [updateObserver]);

  const showConnectionError = useCallback((error) => {
    const status = error instanceof ModelMixHttpError ? error.status : 0;
    updateObserver((current) => applyReplayError(current, status, error.message));
  }, [updateObserver]);

  const observe = useCallback(async (initialResponse, controller) => {
    let response = initialResponse;
    while (!controller.signal.aborted) {
      try {
        await consumeModelMixSSE(response, handleEvent);
        if (isTerminalOverall(observerRef.current.overall)) return;
        updateObserver((current) => ({ ...current, overall: 'reconnecting', message: 'Reconnecting…' }));
        await reconnectDelay();
        if (controller.signal.aborted) return;
        response = await replayModelMixRun(
          observerRef.current.runId,
          observerRef.current.lastSeq,
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ModelMixHttpError && (error.status === 409 || error.status === 404)) {
          showConnectionError(error);
          return;
        }
        updateObserver((current) => ({ ...current, overall: 'reconnecting', message: 'Connection lost. Reconnecting…' }));
        await reconnectDelay();
        if (controller.signal.aborted) return;
        try {
          response = await replayModelMixRun(
            observerRef.current.runId,
            observerRef.current.lastSeq,
            controller.signal,
          );
        } catch (replayError) {
          if (replayError instanceof ModelMixHttpError && [404, 409].includes(replayError.status)) {
            showConnectionError(replayError);
            return;
          }
        }
      }
    }
  }, [handleEvent, showConnectionError, updateObserver]);

  useEffect(() => {
    const controller = new AbortController();
    connectionRef.current = controller;
    const sessionId = window.localStorage?.getItem('modelmix.sessionId');
    hydrateModelMixSession(sessionId, controller.signal)
      .then(async (document) => {
        const hydrated = hydrateModelMixState(document);
        updateObserver(hydrated);
        window.localStorage?.setItem('modelmix.sessionId', hydrated.sessionId);
        if (hydrated.prompt) setPrompt(hydrated.prompt);
        if (hydrated.models) {
          const historicalIds = Object.values(hydrated.models).filter(Boolean);
          historicalModelsRef.current = new Set(historicalIds);
          setModels((current) => {
            const missing = historicalIds
              .filter((id) => !current.some((model) => model.id === id))
              .map((id) => ({ id, name: `${id} (historical)`, provider: 'Historical' }));
            return [...current, ...missing];
          });
          setWorkerAModel(hydrated.models.worker_a || '');
          setModeratorModel(hydrated.models.moderator || '');
          setWorkerBModel(hydrated.models.worker_b || '');
        }
        if (!isTerminalOverall(hydrated.overall)) {
          const response = await replayModelMixRun(hydrated.runId, hydrated.lastSeq, controller.signal);
          await observe(response, controller);
        }
      })
      .catch((error) => {
        if (!(error instanceof ModelMixHttpError && error.status === 404) && !controller.signal.aborted) {
          showConnectionError(error);
        }
      });
    return () => controller.abort();
  }, [observe, showConnectionError, updateObserver]);

  const send = async (event) => {
    event.preventDefault();
    if (!prompt.trim() || !workerAModel.trim()) return;
    if (!isSolo && !workerBModel.trim()) return;
    if (mode === 'mix' && !moderatorModel.trim()) return;
    connectionRef.current?.abort();
    const controller = new AbortController();
    connectionRef.current = controller;
    const starting = {
      ...archiveCurrentRun(observerRef.current),
      overall: 'connecting',
      message: 'Connecting…',
      prompt: prompt.trim(),
      models: {
        worker_a: workerAModel.trim(),
        moderator: mode === 'mix' ? moderatorModel.trim() : '',
        worker_b: isSolo ? '' : workerBModel.trim(),
      },
    };
    updateObserver(starting);
    try {
      const requestBody = {
        prompt: prompt.trim(),
        worker_a_model: workerAModel.trim(),
        session_id: observerRef.current.sessionId || undefined,
      };
      if (!isSolo) requestBody.worker_b_model = workerBModel.trim();
      if (mode === 'mix') requestBody.moderator_model = moderatorModel.trim();
      const guardrailOverride = loadGuardrailOverride();
      if (guardrailOverride) {
        requestBody.warning_threshold_chars = guardrailOverride.warning_threshold_chars;
        requestBody.hard_cap_chars = guardrailOverride.hard_cap_chars;
      }
      const response = await startModelMixRun(requestBody, controller.signal);
      const runId = response.headers.get('X-ModelMix-Run-ID');
      const sessionId = response.headers.get('X-ModelMix-Session-ID');
      if (sessionId) window.localStorage?.setItem('modelmix.sessionId', sessionId);
      updateObserver((current) => ({ ...current, runId, sessionId, overall: 'running', message: 'Streaming…' }));
      await observe(response, controller);
    } catch (error) {
      if (!controller.signal.aborted) showConnectionError(error);
    }
  };

  const stop = async () => {
    if (!observerRef.current.runId) return;
    updateObserver((current) => ({ ...current, overall: 'cancelling', message: 'Cancellation requested…' }));
    try {
      await cancelModelMixRun(observerRef.current.runId);
    } catch (error) {
      showConnectionError(error);
    }
  };

  const newSession = () => {
    if (modelSelectorsDisabled(observerRef.current.overall)) return;
    window.localStorage?.removeItem('modelmix.sessionId');
    updateObserver((current) => startNewSession(current));
  };

  const saveDefaults = () => {
    saveSeatModels(window.localStorage, {
      worker_a: workerAModel,
      moderator: moderatorModel,
      worker_b: workerBModel,
    });
    setDefaultsRevision((revision) => revision + 1);
  };

  const clearDefaults = () => {
    clearSavedSeatModels(window.localStorage);
    setDefaultsRevision((revision) => revision + 1);
  };

  const saveGuardrails = (values) => {
    if (!saveGuardrailOverride(values)) return;
    setGuardrailsRevision((revision) => revision + 1);
  };

  const clearGuardrails = () => {
    clearGuardrailOverride();
    setGuardrailsRevision((revision) => revision + 1);
  };

  const controls = controlState(observer.overall);
  const selectorsDisabled = modelsLoading || modelSelectorsDisabled(observer.overall);
  const isSolo = mode === 'solo';
  const sendDisabled = controls.sendDisabled
    || modelsLoading
    || !prompt.trim()
    || !workerAModel
    || (!isSolo && !workerBModel)
    || (mode === 'mix' && !moderatorModel);
  const modeDisabled = modelsLoading || modelSelectorsDisabled(observer.overall);
  return (
    <main className="modelmix-observer">
      <header className="modelmix-topbar">
        <h1>ModelMix</h1>
        <label className="modelmix-mode">
          <span className="modelmix-mode-label">Mode</span>
          <select
            className="modelmix-mode-select"
            aria-label="Mode"
            value={mode}
            disabled={modeDisabled}
            onChange={(event) => {
              const next = event.target.value;
              saveMode(next, window.localStorage);
              setMode(next);
            }}
          >
            {MODES.map((value) => (
              <option key={value} value={value}>{value === 'mix' ? 'Mix' : value === 'compare' ? 'Compare' : 'Solo'}</option>
            ))}
          </select>
        </label>
        <div className="modelmix-session">
          <span className="modelmix-session-status" data-status={observer.overall}>{observer.overall}</span>
          <button type="button" className="new-session" disabled={modelSelectorsDisabled(observer.overall)} onClick={newSession}>New Session</button>
        </div>
        <button type="button" className="modelmix-details-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}>Details</button>
        <a href="/">Back to Council</a>
        <button type="button" className="modelmix-settings-toggle" aria-label="Settings" title="Settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>⚙</button>
      </header>

      <div className="modelmix-run-meta" data-open={detailsOpen} aria-hidden={!detailsOpen}>
        <span>Run: {observer.runId || '—'}</span><span>Last sequence: {observer.lastSeq}</span>
      </div>

      {settingsOpen && (
        <ModelMixSettings
          section={settingsSection}
          onSectionChange={setSettingsSection}
          onClose={() => setSettingsOpen(false)}
          settings={settingsSnapshot}
          currentModels={{
            worker_a: workerAModel,
            moderator: moderatorModel,
            worker_b: workerBModel,
          }}
          defaultsRevision={defaultsRevision}
          onSaveDefaults={saveDefaults}
          onClearDefaults={clearDefaults}
          guardrailsRevision={guardrailsRevision}
          onSaveGuardrails={saveGuardrails}
          onClearGuardrails={clearGuardrails}
        />
      )}

      <form className="modelmix-composer" onSubmit={send}>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Prompt" rows="3" required />
        <div className={`modelmix-models${mode === 'compare' ? ' modelmix-models--compare' : ''}`}>
          <label htmlFor="modelmix-worker-a-model">
            Worker A model
            <SearchableModelSelect
              inputId="modelmix-worker-a-model"
              ariaLabel="Worker A model"
              models={models}
              allModels={models}
              value={workerAModel}
              onChange={setWorkerAModel}
              isDisabled={selectorsDisabled}
              isLoading={modelsLoading}
            />
          </label>
          {mode === 'mix' && (
            <label htmlFor="modelmix-moderator-model">
              Moderator model
              <SearchableModelSelect
                inputId="modelmix-moderator-model"
                ariaLabel="Moderator model"
                models={models}
                allModels={models}
                value={moderatorModel}
                onChange={setModeratorModel}
                isDisabled={selectorsDisabled}
                isLoading={modelsLoading}
              />
            </label>
          )}
          {!isSolo && (
            <label htmlFor="modelmix-worker-b-model">
              Worker B model
              <SearchableModelSelect
                inputId="modelmix-worker-b-model"
                ariaLabel="Worker B model"
                models={models}
                allModels={models}
                value={workerBModel}
                onChange={setWorkerBModel}
                isDisabled={selectorsDisabled}
                isLoading={modelsLoading}
              />
            </label>
          )}
        </div>
        {modelsError && <p className="modelmix-model-error" role="alert">{modelsError}</p>}
        <div className="modelmix-actions">
          <button type="submit" disabled={sendDisabled}>Send</button>
          <button type="button" className="stop" disabled={controls.stopDisabled} onClick={stop}>Stop</button>
          <span role="status">{observer.message}</span>
        </div>
      </form>

      {panelLayoutNeedsReset(panelView.maximized, panelView.collapsed) && (
        <div className="modelmix-panel-toolbar">
          <button type="button" className="modelmix-reset-layout" onClick={resetPanelLayout}>Reset panel layout</button>
        </div>
      )}

      <section
        className={`modelmix-workers${panelView.maximized || isSolo ? ' modelmix-workers--maximized' : ''}`}
        aria-label="ModelMix cockpit"
      >
        {[
          { seatKey: 'worker_a', title: 'Worker A', className: '', emptyText: 'Waiting for visible output…' },
          { seatKey: 'moderator', title: 'Moderator', className: 'modelmix-moderator', emptyText: 'Waiting for workers…' },
          { seatKey: 'worker_b', title: 'Worker B', className: '', emptyText: 'Waiting for visible output…' },
        ].map(({ seatKey, title, className, emptyText }) => {
          const hiddenByMode = (mode === 'compare' && seatKey === 'moderator')
            || (mode === 'solo' && (seatKey === 'moderator' || seatKey === 'worker_b'));
          // In Solo mode the mode owns the layout: worker_a always renders and
          // fills the width, so any panelView.maximized targeting another seat
          // is neutralized (otherwise a maximize on a mode-hidden panel would
          // blank the cockpit).
          const effectiveMaximized = isSolo ? '' : panelView.maximized;
          const viewClasses = `${className} ${getPanelViewClasses(seatKey, effectiveMaximized, panelView.collapsed).join(' ')}${hiddenByMode ? ' modelmix-panel-hidden' : ''}`.trim();
          return (
            <TranscriptPane
              key={seatKey}
              title={title}
              seatKey={seatKey}
              participant={observer[seatKey]}
              history={observer.history}
              emptyText={emptyText}
              className={viewClasses}
              statusOverride={seatKey === 'moderator' && observer.overall === 'reconnecting' ? 'reconnecting' : null}
              collapsed={panelView.collapsed.includes(seatKey)}
              maximized={panelView.maximized === seatKey}
              onToggleCollapse={() => toggleCollapsed(seatKey)}
              onToggleMaximize={() => toggleMaximize(seatKey)}
            />
          );
        })}
      </section>
    </main>
  );
}

function TranscriptPane({
  title,
  participant,
  history = [],
  seatKey,
  emptyText,
  className = '',
  statusOverride = null,
  collapsed = false,
  maximized = false,
  onToggleCollapse,
  onToggleMaximize,
}) {
  const status = statusOverride || participant.status;
  const priorTurns = history.filter((entry) => entry[seatKey]?.text);
  const collapseLabel = `${collapsed ? 'Expand' : 'Collapse'} ${title}`;
  const maximizeLabel = `${maximized ? 'Restore' : 'Maximize'} ${title}`;
  const telemetry = buildSeatTelemetry(participant);
  return (
    <article className={`modelmix-worker ${className}`.trim()}>
      <header>
        <h2>{title}</h2>
        <div className="modelmix-panel-head">
          <span data-status={status}>{status}</span>
          <div className="modelmix-panel-controls">
            <button type="button" className="modelmix-panel-control" aria-label={collapseLabel} aria-expanded={!collapsed} title={collapseLabel} onClick={onToggleCollapse}>{collapsed ? 'Expand' : 'Collapse'}</button>
            <button type="button" className="modelmix-panel-control" aria-label={maximizeLabel} aria-pressed={maximized} title={maximizeLabel} onClick={onToggleMaximize}>{maximized ? 'Restore' : 'Maximize'}</button>
          </div>
        </div>
      </header>
      <div className="modelmix-transcript">
        {priorTurns.map((entry) => (
          <div key={entry.runId} className="modelmix-prior-turn">
            {entry.prompt ? <p className="modelmix-prior-prompt">{entry.prompt}</p> : null}
            <MarkdownContent>{entry[seatKey].text}</MarkdownContent>
            {entry[seatKey].error && <p className="modelmix-worker-error">{entry[seatKey].error}</p>}
          </div>
        ))}
        {participant.text ? <MarkdownContent>{participant.text}</MarkdownContent>
          : priorTurns.length === 0 ? <p className="modelmix-empty">{emptyText}</p> : null}
        {participant.error && <p className="modelmix-worker-error">{participant.error}</p>}
        {telemetry.length > 0 && (
          <footer className="modelmix-telemetry" aria-label="Seat telemetry">
            {telemetry.map((item) => (
              <span className="modelmix-telemetry-item" key={item.key}>
                <span className="modelmix-telemetry-label">{item.label}</span>: {item.value}
                {item.detail && <span className="modelmix-telemetry-detail"> · {item.detail}</span>}
              </span>
            ))}
          </footer>
        )}
      </div>
    </article>
  );
}

const SETTINGS_SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'providers', label: 'Providers' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'guardrails', label: 'Guardrails' },
];

function ModelMixSettings({
  section,
  onSectionChange,
  onClose,
  settings,
  currentModels,
  defaultsRevision,
  onSaveDefaults,
  onClearDefaults,
  guardrailsRevision,
  onSaveGuardrails,
  onClearGuardrails,
}) {
  return (
    <div className="modelmix-settings-backdrop" onClick={onClose}>
      <section
        className="modelmix-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modelmix-settings-head">
          <h2>Settings</h2>
          <button type="button" className="modelmix-settings-close" aria-label="Close Settings" onClick={onClose}>✕</button>
        </header>
        <nav className="modelmix-settings-nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={section === id ? 'modelmix-settings-nav-item is-active' : 'modelmix-settings-nav-item'}
              aria-pressed={section === id}
              onClick={() => onSectionChange(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="modelmix-settings-body">
          {section === 'about' && <AboutSection version={pkg.version} />}
          {section === 'providers' && <ProvidersSection settings={settings} />}
          {section === 'defaults' && (
            <DefaultsSection
              currentModels={currentModels}
              revision={defaultsRevision}
              onSave={onSaveDefaults}
              onClear={onClearDefaults}
            />
          )}
          {section === 'guardrails' && (
            <GuardrailsSection
              key={guardrailsRevision}
              onSave={onSaveGuardrails}
              onClear={onClearGuardrails}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function AboutSection({ version }) {
  return (
    <div className="modelmix-settings-section">
      <p className="modelmix-settings-line">
        <strong>ModelMix</strong> — a local-first multi-model app to reduce single-model bias and unsupported conclusions.
      </p>
      <p className="modelmix-settings-line"><strong>Version</strong> {version}</p>
      <p className="modelmix-settings-line"><strong>License</strong> MIT — Copyright (c) 2025 Jacob Ben David.</p>
      <p className="modelmix-settings-line">
        Origin: ModelMix began as a fork/evolution of The AI Counsel, an open-source multi-model AI project.
      </p>
      <p className="modelmix-settings-line"><a href="https://github.com/wpedigo1/ModelMix">github.com/wpedigo1/ModelMix</a></p>
      <p className="modelmix-settings-line"><a href="https://github.com/wpedigo1/ModelMix/blob/main/OPEN_SOURCE_CREDITS.md">OPEN_SOURCE_CREDITS.md — open-source credits and dependency licenses</a></p>
    </div>
  );
}

const PROVIDER_ROWS = [
  ['OpenRouter', (sources) => sources.openrouter],
  ['Ollama (local)', (sources) => sources.ollama],
  ['Direct API keys', (sources) => sources.direct],
  ['Custom endpoint', (sources) => sources.custom],
  ['OAuth accounts', (sources) => sources.oauth],
];

function ProvidersSection({ settings }) {
  if (!settings) {
    return (
      <div className="modelmix-settings-section">
        <p className="modelmix-settings-line">Provider status is unavailable right now.</p>
      </div>
    );
  }
  const sources = configuredSources(settings);
  return (
    <div className="modelmix-settings-section">
      <ul className="modelmix-provider-list">
        {PROVIDER_ROWS.map(([name, status]) => {
          const connected = status(sources);
          return (
            <li key={name}>
              <span className="modelmix-provider-name">{name}</span>
              <span className="modelmix-provider-status" data-connected={connected}>
                {connected ? 'Connected' : 'Not connected'}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="modelmix-settings-line">Credentials stay in secure storage and never appear here.</p>
      <p className="modelmix-settings-line"><a href="/">Manage providers in council settings</a></p>
    </div>
  );
}

function DefaultsSection({ currentModels, onSave, onClear }) {
  const saved = loadSavedSeatModels(window.localStorage);
  const rows = [
    ['Worker A', currentModels.worker_a],
    ['Moderator', currentModels.moderator],
    ['Worker B', currentModels.worker_b],
  ];
  return (
    <div className="modelmix-settings-section">
      <p className="modelmix-settings-line">
        When no defaults are saved, ModelMix starts each session with its built-in default seats.
      </p>
      <ul className="modelmix-provider-list">
        {rows.map(([seat, model]) => (
          <li key={seat}>
            <span className="modelmix-provider-name">{seat}</span>
            <span>{model || 'None'}</span>
          </li>
        ))}
      </ul>
      {saved ? (
        <p className="modelmix-settings-line">Saved defaults will be applied on the next load.</p>
      ) : (
        <p className="modelmix-settings-line">No saved defaults — built-in defaults apply.</p>
      )}
      <div className="modelmix-settings-actions">
        <button type="button" className="modelmix-settings-save" onClick={onSave}>Save current selections as defaults</button>
        <button type="button" className="modelmix-settings-clear" disabled={!saved} onClick={onClear}>Clear saved defaults</button>
      </div>
    </div>
  );
}

function GuardrailsSection({ onSave, onClear }) {
  const [fields, setFields] = useState(() => {
    const saved = loadGuardrailOverride();
    return {
      warning: saved ? String(saved.warning_threshold_chars) : '',
      cap: saved ? String(saved.hard_cap_chars) : '',
    };
  });

  const parsed = {
    warning_threshold_chars: fields.warning === '' ? NaN : Number(fields.warning),
    hard_cap_chars: fields.cap === '' ? NaN : Number(fields.cap),
  };
  const validation = validateGuardrailOverride(parsed);
  const edited = fields.warning !== '' || fields.cap !== '';
  const saved = loadGuardrailOverride();
  return (
    <div className="modelmix-settings-section">
      <p className="modelmix-settings-line">
        Save both thresholds as character counts — these are not token counts. When saved, both are sent with every request and the server validates them again.
      </p>
      <label className="modelmix-settings-line" htmlFor="modelmix-guardrail-warning">
        Warning threshold (characters)
      </label>
      <input
        id="modelmix-guardrail-warning"
        className="modelmix-settings-input"
        type="number"
        min={MIN_OUTPUT_CHARS_BOUND}
        max={MAX_OUTPUT_CHARS_BOUND}
        step="1"
        value={fields.warning}
        onChange={(event) => setFields((current) => ({ ...current, warning: event.target.value }))}
        aria-label="Warning threshold in characters"
      />
      <label className="modelmix-settings-line" htmlFor="modelmix-guardrail-cap">
        Hard cap (characters)
      </label>
      <input
        id="modelmix-guardrail-cap"
        className="modelmix-settings-input"
        type="number"
        min={MIN_OUTPUT_CHARS_BOUND}
        max={MAX_OUTPUT_CHARS_BOUND}
        step="1"
        value={fields.cap}
        onChange={(event) => setFields((current) => ({ ...current, cap: event.target.value }))}
        aria-label="Hard cap in characters"
      />
      {!validation.valid && edited && (
        <p className="modelmix-settings-error" role="alert">{validation.error}</p>
      )}
      <p className="modelmix-settings-line">
        ModelMix's built-in default: warning 20,000 chars and hard cap 40,000 chars. This is a static default value, not a live-fetched server value — requests that omit both thresholds use it.
      </p>
      {saved ? (
        <p className="modelmix-settings-line">Saved override will be sent with each request.</p>
      ) : (
        <p className="modelmix-settings-line">No saved override — server defaults apply.</p>
      )}
      <div className="modelmix-settings-actions">
        <button
          type="button"
          className="modelmix-settings-save"
          disabled={!validation.valid}
          onClick={() => onSave(parsed)}
        >
          Save as the default override
        </button>
        <button type="button" className="modelmix-settings-clear" disabled={!saved} onClick={onClear}>
          Clear saved override
        </button>
      </div>
    </div>
  );
}
