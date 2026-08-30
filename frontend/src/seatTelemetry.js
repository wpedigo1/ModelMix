import { describeUsage } from './modelmixState.js';

const pad = (value) => String(value).padStart(2, '0');

export function formatTimestamp(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  const date = new Date(ts * 1000);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatElapsed(startedAt, completedAt) {
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null;
  if (typeof completedAt !== 'number' || !Number.isFinite(completedAt)) return null;
  const diff = completedAt - startedAt;
  if (!(diff > 0)) return null;
  if (diff < 60) return `${Math.round(diff * 10) / 10}s`;
  const totalSeconds = Math.round(diff);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function rawUsageKeys(usage) {
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return null;
  const keys = Object.keys(usage);
  if (keys.length === 0) return null;
  return keys.length > 8 ? `${keys.length} fields` : keys.join(' · ');
}

function isSeatActive(seat) {
  if (!seat || typeof seat !== 'object') return false;
  const ran = typeof seat.status === 'string' && !['idle', 'waiting'].includes(seat.status);
  const hasFields = seat.usage != null || seat.startedAt != null || seat.completedAt != null
    || seat.finishReason != null;
  return ran || hasFields;
}

export function buildSeatTelemetry(seat, seatKey) {
  if (!isSeatActive(seat)) return [];
  const items = [];
  const usage = seat.usage;
  items.push({
    key: 'usage',
    label: 'Usage',
    value: describeUsage(usage) === 'authoritative' ? 'authoritative (provider-reported)' : 'unavailable',
    detail: describeUsage(usage) === 'authoritative' ? rawUsageKeys(usage) : null,
  });
  if (seatKey === 'moderator') {
    items.push({
      key: 'finish',
      label: 'Finish',
      value: seat.finishReason || 'not reported',
    });
  }
  const started = seat.startedAt;
  const completed = seat.completedAt;
  if (started != null && completed != null) {
    const elapsed = formatElapsed(started, completed);
    const startLabel = formatTimestamp(started);
    const completedLabel = formatTimestamp(completed);
    items.push({
      key: 'timing',
      label: 'Elapsed',
      value: elapsed ? `${elapsed} (calculated)` : 'unknown',
      detail: startLabel && completedLabel ? `${startLabel} → ${completedLabel}` : null,
    });
  } else if (started != null) {
    const startLabel = formatTimestamp(started);
    if (startLabel) items.push({ key: 'timing', label: 'Started', value: startLabel });
  } else if (completed != null) {
    const completedLabel = formatTimestamp(completed);
    if (completedLabel) items.push({ key: 'timing', label: 'Completed', value: completedLabel });
  }
  return items;
}