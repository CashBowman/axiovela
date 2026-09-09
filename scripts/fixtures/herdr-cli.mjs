#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes('--version')) console.log('herdr 0.8.2-fixture');
else if (args[0] === 'status') console.log('client:\n  version: fixture\nserver:\n  status: running\n  compatible: yes');
else if (args[0] === 'workspace' && args[1] === 'list') console.log(JSON.stringify({id: 'fixture:workspace:list', result: {type: 'workspace_list', workspaces: []}}));
else if (args[0] === 'agent' && args[1] === 'list') console.log(JSON.stringify({id: 'fixture:agent:list', result: {type: 'agent_list', agents: []}}));
else { console.error('unsupported fixture command'); process.exitCode = 2; }
