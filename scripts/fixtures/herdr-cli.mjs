#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
const args = process.argv.slice(2);
const fixture = process.env.AXIOVELA_PI_ACTIVITY_FIXTURE ? await readFile(process.env.AXIOVELA_PI_ACTIVITY_FIXTURE, 'utf8').then(JSON.parse).catch(() => ({})) : {};
if (args[1] === 'list' && fixture.delay) await new Promise(resolve => setTimeout(resolve, fixture.delay));
if (args.includes('--version')) console.log('herdr 0.8.2-fixture');
else if (args[0] === 'status') console.log('client:\n  version: fixture\nserver:\n  status: running\n  compatible: yes');
else if (args[0] === 'workspace' && args[1] === 'list') console.log(JSON.stringify({id: 'fixture:workspace:list', result: {type: 'workspace_list', workspaces: fixture.workspace ? [{workspace_id: 'fixture', label: fixture.workspace}] : []}}));
else if (args[0] === 'agent' && args[1] === 'list') console.log(JSON.stringify({id: 'fixture:agent:list', result: {type: 'agent_list', agents: fixture.prefix ? [{workspace_id: 'fixture', agent_name: `${fixture.prefix}analysis`, agent: 'pi', agent_status: fixture.workerStatus || 'working'}] : []}}));
else { console.error('unsupported fixture command'); process.exitCode = 2; }
