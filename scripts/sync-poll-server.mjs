// Copies server/poll (the source of truth) to the folder that gets deployed, by default the edukors.org site:
//   node scripts/sync-poll-server.mjs [target]          copy, and remove files that no longer exist here
//   node scripts/sync-poll-server.mjs --check [target]  only report differences (exit 1 if any)
// Target: the argument, ESF_POLL_DEPLOY_DIR, or ../_code/public_html/poll. Never touches poll.config.php there.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pollSource,pollDiff} from './poll-files.mjs';
const args=process.argv.slice(2),check=args.includes('--check'),target=path.resolve(args.find(a=>!a.startsWith('--'))||process.env.ESF_POLL_DEPLOY_DIR||'../_code/public_html/poll');
const changes=await pollDiff(pollSource,target);
if(check){for(const c of changes)console.log(`${c.state.padEnd(9)} ${c.file}`);console.log(changes.length?`${changes.length} difference(s) between server/poll and ${target}`:`In sync: ${target}`);process.exitCode=changes.length?1:0;}
else{
  for(const c of changes){const to=path.join(target,c.file);
    if(c.state==='extra'){await fs.rm(to);continue;}
    await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(path.join(pollSource,c.file),to);}
  for(const c of changes)console.log(`${c.state==='extra'?'removed':'copied'.padEnd(7)} ${c.file}`);
  console.log(changes.length?`Synced ${changes.length} file(s) to ${target}. Commit and push the site to deploy.`:`Already in sync: ${target}`);
}
