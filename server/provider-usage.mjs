// Keep missing provider measurements unknown; cumulative billing is not context.
const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export function codexContext(value) {
  const used = value?.last?.totalTokens, limit = value?.modelContextWindow;
  return valid(used) && valid(limit) && limit > 0 ? {tokens: used, contextWindow: limit, percent: Math.min(100, used / limit * 100)} : null;
}
export function codexLimits(value) {
  const buckets = value?.rateLimitsByLimitId && Object.keys(value.rateLimitsByLimitId).length ? Object.entries(value.rateLimitsByLimitId) : value?.rateLimits ? [[value.rateLimits.limitId || 'codex', value.rateLimits]] : [];
  return buckets.slice(0, 20).flatMap(([id, bucket]) => ['primary', 'secondary'].flatMap(key => {
    const w = bucket?.[key];
    return valid(w?.usedPercent) ? [{bucket: String(bucket.limitName || id).slice(0, 100), window: key, remaining: Math.max(0, Math.min(100, 100 - w.usedPercent)), minutes: valid(w.windowDurationMins) ? w.windowDurationMins : null, resetsAt: valid(w.resetsAt) ? w.resetsAt : null}] : [];
  }));
}
