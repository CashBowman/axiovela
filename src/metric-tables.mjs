// Interpret data, never execute strings from a run record.
export function metricData(value) {
  if (typeof value !== 'string' || value.length > 100000) return value;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch { /* Older trackers sometimes store Python numeric dictionaries. */ }
  if (!/^\s*\{.*\}\s*$/s.test(value)) return value;
  const body = value.trim().slice(1, -1).trim();
  const entries = body.split(',').filter((part, index, all) => part.trim() || index !== all.length - 1);
  const pairs = entries.map(part => part.match(/^\s*['"]([^'"\\]+)['"]\s*:\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|True|False|None)\s*$/));
  if (!body || pairs.some(pair => !pair)) return value;
  return Object.fromEntries(pairs.map(([, key, raw]) => [key, raw === 'None' ? null : raw === 'True' ? true : raw === 'False' ? false : Number(raw)]));
}

export function metricLabel(value) {
  // Humanize machine keys, but never rewrite authored Markdown or TeX syntax.
  if (/[$`*]|\\[([]|(?:^|\s)_[^_]+_(?:\s|$)/.test(String(value))) return String(value);
  const text = String(value).replace(/[_-]+/g, ' ').replace(/\b(auc|roc|rmse|mse|mae|f1|ci|ols)\b/gi, word => word.toUpperCase());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const record = value => value && typeof value === 'object' && !Array.isArray(value);
const scalar = value => value === null || typeof value !== 'object';
const flat = value => record(value) && Object.keys(value).length > 0 && Object.values(value).every(scalar);

// Tables are grouped by shared fields, never by guessed metric semantics.
export function metricTables(input, title = 'Recorded values') {
  const tables = [];
  function visit(raw, name, depth = 0) {
    const value = metricData(raw);
    if (depth > 20) return;
    if (Array.isArray(value)) {
      if (value.length && value.every(flat)) {
        const keys = [...new Set(value.flatMap(item => Object.keys(item)))];
        tables.push({title: name, columns: ['Row', ...keys], rows: value.map((item, i) => [String(i + 1), ...keys.map(key => item[key])]), comparison: true});
      } else if (value.length && value.every(item => Array.isArray(item) && item.every(scalar))) {
        const width = Math.max(...value.map(item => item.length));
        tables.push({title: name, columns: ['Row / column', ...Array.from({length: width}, (_, i) => String(i + 1))], rows: value.map((item, i) => [String(i + 1), ...Array.from({length: width}, (_, j) => item[j])])});
      } else value.forEach((item, i) => visit(item, `${name} · ${i + 1}`, depth + 1));
      return;
    }
    if (!record(value)) {
      tables.push({title: name, columns: ['Metric', 'Value'], rows: [[name, value]]});
      return;
    }
    const entries = Object.entries(value).map(([key, item]) => [key, metricData(item)]);
    const scalars = entries.filter(([, item]) => scalar(item));
    const nested = entries.filter(([, item]) => flat(item));
    const consumed = new Set();
    for (const [key, item] of nested) {
      if (consumed.has(key)) continue;
      const group = nested.filter(([other, data]) => !consumed.has(other) && Object.keys(item).some(field => Object.hasOwn(data, field)));
      if (group.length < 2) continue;
      group.forEach(([other]) => consumed.add(other));
      const keys = [...new Set(group.flatMap(([, data]) => Object.keys(data)))];
      tables.push({title: name, columns: ['Series', ...keys], rows: group.map(([other, data]) => [other, ...keys.map(field => data[field])]), comparison: true});
    }
    if (scalars.length) tables.push({title: name, columns: ['Metric', 'Value'], rows: scalars});
    entries.filter(([key, item]) => !scalar(item) && !consumed.has(key)).forEach(([key, item]) => visit(item, name === 'Recorded values' ? metricLabel(key) : `${name} · ${metricLabel(key)}`, depth + 1));
  }
  if (input && Object.keys(input).length) visit(input, title);
  return tables;
}
