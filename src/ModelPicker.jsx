import React, {useEffect, useRef, useState} from 'react';
import ConnectionSetup from './ConnectionSetup.jsx';

export default function ModelPicker({role, selection, capabilities, busy, loading, error, onRefresh, onSave, onSaveProfile, onSaveConnection, onNewSession, connectionRequest, onConnectionOpened}) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(selection);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const profiles = capabilities?.researchProfiles || [{id: 'general', name: 'General research'}];
  const profile = profiles.find(p => p.id === (selection.profileId || 'general'));
  const changeProfile = async value => {
    setProfileSaving(true); setProfileError('');
    try { await onSaveProfile(value); } catch (error) { setProfileError(error.message); } finally { setProfileSaving(false); }
  };
  const connections = capabilities?.connections || [];
  const active = connections.find(c => c.id === selection.adapterId);
  const selectedModel = active?.models.find(m => m.id === (selection.modelId || active.defaultModelId));
  const connection = connections.find(c => c.id === draft.adapterId);
  const model = connection?.models.find(m => m.id === (draft.modelId || connection.defaultModelId));
  useEffect(() => { if (dialog.current?.open) dialog.current.close(); }, [role]);
  const show = () => { setDraft(selection); setApiKey(''); setEndpoint(active?.endpoint || ''); setSaveError(''); dialog.current.showModal(); };
  const useApi = () => { setDraft({...selection, adapterId: 'openai-api', modelId: '', effort: ''}); setApiKey(''); setSaveError(''); setEndpoint(''); if (!dialog.current.open) dialog.current.showModal(); };
  useEffect(() => { if (connectionRequest) { useApi(); onConnectionOpened(); } }, [connectionRequest]);
  const configure = async (clearKey = false) => {
    setSaving(true); setSaveError('');
    try { await onSaveConnection(draft.adapterId, {apiKey, clearKey, ...(draft.adapterId === 'compatible-api' ? {endpoint} : {})}); }
    catch (e) { setSaveError(e.message); }
    finally { setApiKey(''); setSaving(false); }
  };
  const save = async () => {
    setSaving(true); setSaveError('');
    try { await onSave(draft); dialog.current.close(); } catch (e) { setSaveError(e.message); } finally { setSaving(false); }
  };
  const models = connection?.models || [];
  const needsSetup = !active?.available || !active?.models?.length;
  const providers = [...new Set(models.map(m => m.provider))];
  return <><div className="connectionPickerControls"><label className="researchProfilePicker">Focus<select title={profile?.name || 'Research focus'} aria-label="Research focus" value={selection.profileId || 'general'} disabled={busy || profileSaving || !capabilities} onChange={event => changeProfile(event.target.value)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{profileError && <p role="alert" className="renderError">{profileError}</p>}<button className="modelPickerButton" onClick={show} disabled={busy || profileSaving} aria-label={`Choose ${role} model and provider`} title="Choose connection, model, and reasoning">{needsSetup ? 'Set up · ' : ''}{active?.name || selection.adapterId} · {selectedModel?.name || (selection.modelId || 'Runtime default')} · {selection.effort || (selection.modelId ? selectedModel?.defaultEffort : active?.defaultEffort) || 'Default effort'} ▾</button></div>
    <dialog ref={dialog} onClose={() => setApiKey('')} className="modelDialog" aria-labelledby="model-picker-title"><div className="modelDialogHeader"><h2 id="model-picker-title">{role === 'writing' ? 'Writing' : 'Experiment'} connection</h2><button onClick={() => dialog.current.close()} aria-label="Close model picker">×</button></div>
      <p>Choose the engine and model for the next message. Settings are saved separately for each chat.</p><details className="profileSummary"><summary><strong>{profile?.name || 'General research'}</strong> · About this focus</summary><p>{profile?.description}</p>{profile?.tools && <p>{profile.tools}</p>}<p>Research profiles are included and work with any connection. They guide the workflow; scientific libraries are installed in your project only when needed. Change your research focus below the chat. Your model and access choices stay the same.</p></details>
      <label>Connection<select value={draft.adapterId} onChange={e => { setDraft({...draft, adapterId: e.target.value, modelId: '', effort: ''}); setSaveError(''); setApiKey(''); setEndpoint(connections.find(c => c.id === e.target.value)?.endpoint || ''); }}>{['cli', 'api'].map(type => <optgroup key={type} label={type === 'cli' ? 'CLI engines (installation and sign-in)' : 'Direct API connections'}>{connections.filter(c => (c.type || 'cli') === type).map(c => <option key={c.id} value={c.id}>{c.name}{!c.available ? ' · setup needed' : ''}</option>)}</optgroup>)}</select></label>
      <div className="catalogStatus"><span>{loading ? 'Loading models…' : connection?.available ? `${connection.models.length} models · ${connection.catalogStatus || 'runtime catalog'}` : connection?.error || error || 'Catalog not loaded'}</span><button onClick={onRefresh} disabled={loading || saving}>Refresh</button></div>
      {connection?.type === 'api' && <details className="connectionSetup" open={!connection.available}><summary>API connection settings</summary><p>{connection.setup} Keys are stored only in your private local app configuration, outside the project.</p>{draft.adapterId === 'compatible-api' && <label>API endpoint<input type="url" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="http://127.0.0.1:1234/v1"/></label>}<label>API key<input type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Leave blank to keep the current key"/></label><div className="connectionActions"><button disabled={saving} onClick={() => configure(false)}>Save connection</button><button disabled={saving} onClick={() => configure(true)}>Remove saved key</button></div><p>Removing a saved key still allows an environment-provided key. Local endpoints may not require one.</p></details>}
      {connection?.type === 'cli' && <details key={draft.adapterId} className="connectionSetup" open={!connection.available || !models.length}><summary>Install or connect {connection.name}</summary><ConnectionSetup id={draft.adapterId} includeHerdr={draft.adapterId === 'pi'} onUseApi={useApi}/></details>}
      <label>Model<select value={draft.modelId} onChange={e => setDraft({...draft, modelId: e.target.value, effort: ''})} disabled={!connection?.available}><option value="">{connection?.type === 'api' ? 'Choose a model' : 'Runtime default'}</option>{draft.modelId && !models.some(m => m.id === draft.modelId) && <option value={draft.modelId}>{model?.name || draft.modelId} (current selection)</option>}{providers.map(provider => <optgroup key={provider} label={provider}>{models.filter(m => m.provider === provider).map(m => <option key={m.id} value={m.id}>{m.name}{m.isDefault ? ' · recommended by runtime' : ''}</option>)}</optgroup>)}</select></label>
      <label>Reasoning<select value={draft.effort} onChange={e => setDraft({...draft, effort: e.target.value})} disabled={!model?.efforts.length}><option value="">{model?.efforts.length ? `Runtime default${model.defaultEffort ? ` (${model.defaultEffort})` : ''}` : 'Managed by runtime'}</option>{model?.efforts.map(effort => <option key={effort} value={effort}>{effort}</option>)}</select></label>
      {connection?.customModel && <details><summary>Custom model ID</summary><label>Exact model ID<input value={draft.modelId} onChange={e => setDraft({...draft, modelId: e.target.value, effort: ''})} placeholder="Use an ID supported by your provider"/></label><p className="modelHint">Custom IDs are validated by the provider when used. Reasoning stays provider-managed unless the catalog reports support.</p></details>}
      <p className="modelHint">{connection?.type === 'cli' ? connection.setup || 'Codex uses its existing local login.' : 'API requests use this connection’s key, not a CLI subscription.'} A listed model may still require account access. {connection?.permissionHint || `Supported access modes: ${(connection?.modes || []).map(mode => ({ask: 'Read-only', auto: 'Auto-approve', full: 'Full access'})[mode] || mode).join(', ')}.`}</p>
      {draft.adapterId !== selection.adapterId && <p className="modelHint">Changing engines starts a new native session with a visible handoff of recent conversation context.</p>}
      {(saveError || error) && <p role="alert" className="renderError">{saveError || error}</p>}
      <div className="modelDialogActions"><button onClick={() => { onNewSession(); dialog.current.close(); }} disabled={saving}>New conversation</button><button className="newBtn" onClick={save} disabled={saving || loading || !connection?.available}>{saving ? 'Saving…' : 'Use model'}</button></div>
    </dialog></>;
}
