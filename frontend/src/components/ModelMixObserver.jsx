import { useCallback, useEffect, useRef, useState } from 'react';
import MarkdownContent from './MarkdownContent';
import {
  cancelModelMixRun,
  consumeModelMixSSE,
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
} from '../modelmixState';
import './ModelMixObserver.css';

const reconnectDelay = () => new Promise((resolve) => setTimeout(resolve, 500));

export default function ModelMixObserver() {
  const [prompt, setPrompt] = useState('Explain why independent answers can improve reliability.');
  const [workerAModel, setWorkerAModel] = useState('openai-oauth:gpt-5');
  const [moderatorModel, setModeratorModel] = useState('');
  const [workerBModel, setWorkerBModel] = useState('ollama:llama3');
  const [observer, setObserver] = useState(createModelMixState);
  const observerRef = useRef(observer);
  const connectionRef = useRef(null);

  const updateObserver = useCallback((updater) => {
    setObserver((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      observerRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => () => connectionRef.current?.abort(), []);

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

  const send = async (event) => {
    event.preventDefault();
    if (!prompt.trim() || !workerAModel.trim() || !moderatorModel.trim() || !workerBModel.trim()) return;
    connectionRef.current?.abort();
    const controller = new AbortController();
    connectionRef.current = controller;
    const starting = {
      ...createModelMixState(),
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
      }, controller.signal);
      const runId = response.headers.get('X-ModelMix-Run-ID');
      updateObserver((current) => ({ ...current, runId, overall: 'running', message: 'Streaming…' }));
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
          <label>Worker A model<input value={workerAModel} onChange={(event) => setWorkerAModel(event.target.value)} required /></label>
          <label>Moderator model<input value={moderatorModel} placeholder="provider:model" onChange={(event) => setModeratorModel(event.target.value)} required /></label>
          <label>Worker B model<input value={workerBModel} onChange={(event) => setWorkerBModel(event.target.value)} required /></label>
        </div>
        <div className="modelmix-actions">
          <button type="submit" disabled={controls.sendDisabled}>Send</button>
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
