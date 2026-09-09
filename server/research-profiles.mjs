import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// IDs, paths, and content are app-owned. Project preferences never supply paths
// or executable packages. The legacy biology ID preserves saved science profiles. Metadata is also consumed by the connection UI.
export const researchProfiles = [
  {id: 'general', name: 'General research', description: 'Use the standard research workflow without a domain specialization.'},
  {id: 'biology', name: 'Science & engineering', description: 'Physical, life, and earth sciences; engineering models, experiments, simulations, and visualization.', tools: 'Python or R; NumPy/SciPy for numerical models, domain libraries when needed, Matplotlib or ggplot2 for figures.'},
  {id: 'data-science', name: 'Data science & machine learning', description: 'Reproducible pipelines, leakage checks, baselines, model comparison, and diagnostics.', tools: 'pandas, scikit-learn, and Matplotlib; add larger ML frameworks only when the task needs them.'},
  {id: 'math-statistics', name: 'Mathematics & statistics', description: 'Assumptions, derivations, symbolic checks, inference, uncertainty, and numerical validation.', tools: 'SymPy, SciPy, statsmodels; PyMC and ArviZ for Bayesian models when appropriate.'},
];

export function profileId(value) {
  const id = value == null || value === '' ? 'general' : value;
  if (!researchProfiles.some(profile => profile.id === id)) throw new Error('Choose a supported research profile.');
  return id;
}

export function profileSkillPath(value) {
  const id = profileId(value);
  return id === 'general' ? null : fileURLToPath(new URL(`./research-skills/${id}/SKILL.md`, import.meta.url));
}

export function profileInstructions(value) {
  const file = profileSkillPath(value);
  if (!file) return '';
  const body = readFileSync(file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  return `\n\nSelected Axiovela research profile (workflow guidance; the user's request and access restrictions take precedence):\n${body}\n`;
}

export function canResumeProfile(previous, next) {
  return (previous?.profileId || 'general') === profileId(next?.profileId);
}
