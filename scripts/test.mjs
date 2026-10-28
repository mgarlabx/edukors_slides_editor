import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
await mkdir('test-results',{recursive:true});
await build({entryPoints:['tests/core.test.ts'],bundle:true,platform:'node',target:'node22',format:'esm',outfile:'test-results/core.test.mjs',external:['@edukors/ai-cli','@edukors/ai-cli/*']});
const result=spawnSync(process.execPath,['--test','test-results/core.test.mjs'],{stdio:'inherit'});
process.exitCode=result.status||0;
