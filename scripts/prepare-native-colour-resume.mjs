// Read-only input preparation for Codex's built-in ImageGen tool. No API calls.
import fs from 'node:fs';
import path from 'node:path';
const base=path.resolve('.local/native-colours');
const plan=JSON.parse(fs.readFileSync(path.join(base,'plan.json'),'utf8'));
const jobs=plan.map(job=>{
 const generatedParts={};
 for(const part of [0,1,2,3]){
  const file=path.join(base,'generated',job.id,`part-${part}.json`);
  if(!fs.existsSync(file))continue;
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  if(record.id!==job.id||record.colorHex!==job.colorHex||record.part!==part||!record.prompt||!fs.existsSync(record.sourcePath))throw new Error(`Invalid checkpoint: ${job.id}/${part}`);
  generatedParts[part]=record.sourcePath;
 }
 return {...job,generatedParts};
});
fs.writeFileSync(path.join(base,'resume-jobs.json'),JSON.stringify(jobs,null,2)+'\n');
console.log(JSON.stringify({pendingColours:jobs.length,completedParts:jobs.reduce((n,j)=>n+Object.keys(j.generatedParts).length,0),remainingImageCalls:jobs.reduce((n,j)=>n+4-Object.keys(j.generatedParts).length,0),output:'.local/native-colours/resume-jobs.json'}));
