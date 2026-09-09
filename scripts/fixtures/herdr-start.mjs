import {readFile, writeFile, appendFile} from 'node:fs/promises';
const file = (process.env.AXIOVELA_HERDR_FIXTURE || process.env.HYPOTERA_HERDR_FIXTURE);
if (!file) process.exit(2);
const config = JSON.parse(await readFile(file, 'utf8'));
const args = process.argv.slice(2);
if (args[0] === '--version') console.log('herdr fixture');
else if (args[0] === 'status') {
  const running = await readFile(file + '.ready', 'utf8').then(() => true, () => false);
  console.log(`server:\n  status: ${running ? 'running' : 'not running'}\n  compatible: ${config.incompatible ? 'no' : 'yes'}`);
} else if (args[0] === 'server') {
  await appendFile(file + '.starts', 'start\n');
  if (config.fail) process.exit(2);
  if (config.stall) setInterval(() => {}, 1000);
  else { await new Promise(resolve => setTimeout(resolve, 100)); await writeFile(file + '.ready', 'ready'); }
} else process.exit(2);
