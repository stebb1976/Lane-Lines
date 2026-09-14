import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const versionFile='app-version.js';
const baselineCommit='278938b';
const added=execFileSync('git',['diff','--cached','--name-only','--diff-filter=A','--',versionFile],{encoding:'utf8'}).trim();
if(!added){
  const current=readFileSync(versionFile,'utf8');
  const major=current.match(/version:'(\d+)\./)?.[1]||'1';
  let commits;
  try{commits=Number(execFileSync('git',['rev-list','--count',`${baselineCommit}..HEAD`],{encoding:'utf8'}).trim())}catch{commits=Number(current.match(/version:'\d+\.(\d+)'/)?.[1]||0)+1}
  const created=new Date().toISOString().slice(0,10);
  writeFileSync(versionFile,`window.LANE_LINES_VERSION={version:'${major}.${commits}',created:'${created}'};\n`);
  execFileSync('git',['add','--',versionFile]);
}
