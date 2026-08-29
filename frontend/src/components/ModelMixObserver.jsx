import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { discoverConfiguredModels } from '../configuredModels';
import MarkdownContent from './MarkdownContent';
import SearchableModelSelect from './SearchableModelSelect';
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
  controlState,
  createModelMixState,
  isTerminalOverall,
  hydrateModelMixState,
  modelSelectorsDisabled,
} from '../modelmixState';
import './ModelMixObserver.css';

const reconnectDelay = () => new Promise((resolve) => setTimeout(resolve, 500));

export default function ModelMixObserver() {
  const [prompt, setPrompt] = useState('Explain why independent answers can improve reliability.');
  const [workerAModel, setWorkerAModel] = useState('openai-oauth:gpt-5');
  const [moderatorModel, setModeratorModel] = useState('');
  const [workerBModel, setWorkerBModel] = useState('ollama:llama3');
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const [observer, setObserver] = useState(createModelMixState);
  const observerRef = useRef(observer);
  const connectionRef = useRef(null);
  const historicalModelsRef = useRef(new Set());

  const updateObserver = useCallback((updater) => {
    setObserver((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      observerRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      try {
        const settings = await api.getSettings();
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
    if (!prompt.trim() || !workerAModel.trim() || !moderatorModel.trim() || !workerBModel.trim()) return;
    connectionRef.current?.abort();
    const controller = new AbortController();
    connectionRef.current = controller;
    const starting = {
      ...createModelMixState(),
      sessionId: observerRef.current.sessionId,
      overall: 'connecting',
      message: 'Connecting…',
    };
    updateObserver(starting);
    try {
      const response = await startModelMixRun({
        prompt: prompt.trim(),
        worker_a_model: workerAModel.trim(),
        moderator_model: moderatorModel.trim(),
        worker_b_model: workerBModel.trim(),
        session_id: observerRef.current.sessionId || undefined,
      }, controller.signal);
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

  const controls = controlState(observer.overall);
  const selectorsDisabled = modelsLoading || modelSelectorsDisabled(observer.overall);
  const sendDisabled = controls.sendDisabled
    || modelsLoading
    || !prompt.trim()
    || !workerAModel
    || !moderatorModel
    || !workerBModel;
  return (
    <main className="modelmix-observer">
      <header className="modelmix-header">
        <div>
          <p className="modelmix-kicker">Experimental cockpit</p>
          <h1>ModelMix</h1>
        </div>
        <a href="/">Back to Council</a>
      </header>

      <form className="modelmix-composer" onSubmit={send}>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Prompt" rows="3" required />
        <div className="modelmix-models">
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
        </div>
        {modelsError && <p className="modelmix-model-error" role="alert">{modelsError}</p>}
        <div className="modelmix-actions">
          <button type="submit" disabled={sendDisabled}>Send</button>
          <button type="button" className="stop" disabled={controls.stopDisabled} onClick={stop}>Stop</button>
          <span role="status">{observer.message}</span>
        </div>
      </form>

      <div className="modelmix-run-meta">
        <span>Run: {observer.runId || '—'}</span><span>Last sequence: {observer.lastSeq}</span>
      </div>
      <section className="modelmix-workers" aria-label="ModelMix cockpit">
        <TranscriptPane title="Worker A" participant={observer.worker_a} emptyText="Waiting for visible output…" />
        <TranscriptPane
          title="Moderator"
          participant={observer.moderator}
          emptyText="Waiting for workers…"
          className="modelmix-moderator"
          statusOverride={observer.overall === 'reconnecting' ? 'reconnecting' : null}
        />
        <TranscriptPane title="Worker B" participant={observer.worker_b} emptyText="Waiting for visible output…" />
      </section>
    </main>
  );
}

function TranscriptPane({ title, participant, emptyText, className = '', statusOverride = null }) {
  const status = statusOverride || participant.status;
  return (
    <article className={`modelmix-worker ${className}`.trim()}>
      <header><h2>{title}</h2><span data-status={status}>{status}</span></header>
      <div className="modelmix-transcript">
        {participant.text ? <MarkdownContent>{participant.text}</MarkdownContent> : <p className="modelmix-empty">{emptyText}</p>}
        {participant.error && <p className="modelmix-worker-error">{participant.error}</p>}
      </div>
    </article>
  );
}
