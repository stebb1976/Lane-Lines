import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const versionFile='app-version.js';
const relayVersionFile='Relay Optimizer/app-version.ts';
const baselineCommit='623f452';
const added=execFileSync('git',['diff','--cached','--name-only','--diff-filter=A','--',versionFile],{encoding:'utf8'}).trim();
if(!added){
  const current=readFileSync(versionFile,'utf8');
  const major=current.match(/version:'(\d+)\./)?.[1]||'1';
  let commits;
  try{commits=Number(execFileSync('git',['rev-list','--first-parent','--count',`${baselineCommit}..HEAD`],{encoding:'utf8'}).trim())+1}catch{commits=Number(current.match(/version:'\d+\.(\d+)'/)?.[1]||0)+1}
  const created=new Date().toISOString().slice(0,10);
  const version=`${major}.${commits}`;
  writeFileSync(versionFile,`window.LANE_LINES_VERSION={version:'${version}',created:'${created}'};\n`);
  writeFileSync(relayVersionFile,`export const laneLinesRelease = { version: "${version}", created: "${created}" } as const;\n`);
  execFileSync('git',['add','--',versionFile,relayVersionFile]);
}
