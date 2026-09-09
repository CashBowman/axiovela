import React, {useState} from 'react';
import {Copy, Check} from 'lucide-react';

const guides = {
  codex: {name: 'Codex', package: '@openai/codex', login: 'codex', url: 'https://developers.openai.com/codex/cli', hint: 'Follow the sign-in prompts in Codex.'},
  claude: {name: 'Claude Code', package: '@anthropic-ai/claude-code', login: 'claude', url: 'https://code.claude.com/docs/en/quickstart', hint: 'Follow the sign-in prompts in Claude Code.'},
  gemini: {name: 'Gemini CLI', package: '@google/gemini-cli', login: 'gemini', url: 'https://geminicli.com/docs/get-started/installation/', hint: 'Choose your authentication method in Gemini.'},
  opencode: {name: 'OpenCode', package: 'opencode-ai', login: 'opencode auth login', url: 'https://opencode.ai/docs/', hint: 'Select a provider and complete its sign-in.'},
  pi: {name: 'Pi', package: '--ignore-scripts @earendil-works/pi-coding-agent@0.85.1', login: 'pi', url: 'https://github.com/earendil-works/pi/tree/main/packages/coding-agent#quick-start', hint: 'Inside Pi, enter /login and choose your provider. Then use /model to choose a model.'},
};

export function SetupCommand({children}) {
  const [status, setStatus] = useState('');
  return <div className="setupCommand"><pre><code>{children}</code></pre><button type="button" className="textButton" aria-label={`Copy ${children}`} onClick={async () => {
    try { await navigator.clipboard.writeText(children); setStatus('Copied'); }
    catch { setStatus('Select and copy the command above.'); }
  }}>{status === 'Copied' ? <Check size={16}/> : <Copy size={16}/>}</button>{status && <small role="status">{status}</small>}</div>;
}

export function ToolLocation({id, name}) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!window.methodflowDesktop?.chooseTool) return null;
  return <div className="connectionActions"><button type="button" disabled={busy} onClick={async () => {
    setBusy(true); setStatus('');
    try { if (await window.methodflowDesktop.chooseTool(id.toUpperCase())) setStatus('Location saved. Finish or stop your tasks, then quit and reopen Axiovela to apply it.'); }
    catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }}>Locate installed {name}…</button>{status && <p role="status">{status}</p>}</div>;
}


function SetupActions({id, includeHerdr}) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  if (!window.methodflowDesktop?.setupProvider) return null;
  const run = async (tool, action) => { setBusy(true); try { setStatus((await window.methodflowDesktop.setupProvider(tool, action)).message); } catch (error) { setStatus(error.message); } finally { setBusy(false); } };
  return <div className="nativeSetupActions"><p>Open setup directly in your system terminal. Complete any installer or account prompts there.</p><div className="connectionActions"><button disabled={busy} onClick={() => run(id, 'install')}>Install {guides[id].name}</button><button disabled={busy} onClick={() => run(id, 'login')}>Sign in</button>{includeHerdr && <><button disabled={busy} onClick={() => run('herdr', 'install')}>Install Herdr</button><button disabled={busy} onClick={() => run('herdr', 'integration')}>Connect Herdr to Pi</button></>}<button disabled={busy} onClick={async () => { try { setStatus(await window.methodflowDesktop.detectTools()); } catch (error) { setStatus(error.message); } }}>Detect installed tools</button></div>{status && <pre className="setupDetection" role="status">{status}</pre>}</div>;
}

function InstalledToolHelp({id, name, platform}) {
  return <><p>Already installed? Find the command-line tool’s location:</p>
    <SetupCommand>{platform === 'windows' ? `(Get-Command ${id} -CommandType Application -ErrorAction Stop).Source` : `command -v ${id}`}</SetupCommand>
    <p>Copy the printed path, then choose <strong>Locate installed {name}…</strong> below. {platform === 'windows' ? 'Paste it into the file picker’s File name field.' : 'On Mac, press Command–Shift–G in the file picker and paste the path. On Linux, press Ctrl+L and paste it.'} If no path is found, use the install command above, reopen your terminal, and try again.</p>
    <ToolLocation id={id} name={name}/></>;
}

// Shared by the ordinary provider picker and Agentic setup. Commands are copied,
// or launched through fixed native actions. Authentication remains with each provider.
export default function ConnectionSetup({id, includeHerdr = false, onUseApi}) {
  const [platform, setPlatform] = useState(/Win/.test(navigator.platform) ? 'windows' : 'unix');
  const guide = guides[id];
  if (!guide) return null;
  const npm = platform === 'windows' ? 'npm.cmd' : 'npm';
  return <section className="connectionSetupInstructions" aria-label={`${guide.name} setup`}>
    {onUseApi && <div className="apiSetupAlternative"><p>Prefer to paste an API key here? Direct API connections use the same research profiles and do not require a CLI. CLI subscriptions use the sign-in steps below.</p><button type="button" onClick={onUseApi}>Connect an API key instead</button></div>}
    <div className="setupPlatforms" aria-label="Installation platform"><button type="button" aria-pressed={platform === 'unix'} className={platform === 'unix' ? 'selected' : ''} onClick={() => setPlatform('unix')}>macOS / Linux</button><button type="button" aria-pressed={platform === 'windows'} className={platform === 'windows' ? 'selected' : ''} onClick={() => setPlatform('windows')}>Windows</button></div>
    <SetupActions id={id} includeHerdr={includeHerdr}/>
    <h3>1. Install {guide.name}</h3>{id === 'codex' && <p>Axiovela connects to the Codex command-line tool. The npm command below makes it available for automatic discovery after restarting Axiovela.</p>}
    <p>Open {platform === 'windows' ? 'PowerShell' : 'Terminal'}. Install <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">Node.js 22.19+ within Node 22</a> for these npm commands. {platform === 'windows' && <>Install <a href="https://git-scm.com/downloads/win" target="_blank" rel="noreferrer">Git for Windows</a>, including Git Bash.</>} If already installed, skip to sign-in.</p>
    <SetupCommand>{`${npm} install -g ${guide.package}`}</SetupCommand>
    <h3>2. Sign in</h3><SetupCommand>{platform === 'windows' && ['pi', 'gemini', 'opencode'].includes(id) ? guide.login.replace(id, `${id}.cmd`) : guide.login}</SetupCommand>
    <p>{guide.hint} Your provider’s account access and charges apply. An API key saved in Axiovela does not sign you into a separate CLI.</p>
    <p><a href={guide.url} target="_blank" rel="noreferrer">Official {guide.name} setup guide</a></p>
    <InstalledToolHelp id={id} name={guide.name} platform={platform}/>
    {includeHerdr && <><h3>3. Add Herdr for Agentic mode</h3><p>Herdr coordinates Pi workers. Axiovela starts it when you enable Agentic mode.</p>
      <SetupCommand>{platform === 'windows' ? 'powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"' : 'curl -fsSL https://herdr.dev/install.sh | sh'}</SetupCommand>
      <SetupCommand>herdr integration install pi</SetupCommand>
      <p><a href="https://herdr.dev/docs/install/" target="_blank" rel="noreferrer">Official Herdr setup guide</a></p><InstalledToolHelp id="herdr" name="Herdr" platform={platform}/>
    </>}
    <p>Return here and refresh connections after setup. If a new tool is still missing, quit and reopen Axiovela so it can discover the installation.</p>
  </section>;
}
