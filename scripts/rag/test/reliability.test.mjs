import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fetchJsonPages } from '../source-utils.mjs';

test('complete pagination, same-origin guard, invalid shapes, and credentials scoped to GitHub', async () => {
  const original = globalThis.fetch;
  const prior = process.env.GH_TOKEN;
  process.env.GH_TOKEN = 'fake-credential';
  try {
    let calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({url, options});
      return Response.json([url.endsWith('2') ? 'second' : 'first'], {headers: url.endsWith('2') ? {} : {link:'<https://api.github.com/data?page=2>; rel="next"'}});
    };
    assert.deepEqual(await fetchJsonPages('https://api.github.com/data'), ['first','second']);
    assert.equal(calls[0].options.headers.authorization, 'Bearer fake-credential');
    globalThis.fetch = async (url, options) => { assert.equal(options.headers.authorization, undefined); return Response.json([]); };
    assert.deepEqual(await fetchJsonPages('https://huggingface.co/api/models'), []);
    globalThis.fetch = async () => Response.json([], {headers:{link:'<https://evil.invalid/>; rel="next"'}});
    await assert.rejects(fetchJsonPages('https://api.github.com/data'), /pagination/);
    globalThis.fetch = async () => Response.json({error:'unexpected'});
    await assert.rejects(fetchJsonPages('https://api.github.com/data'), /shape/);
  } finally {
    globalThis.fetch = original;
    if (prior === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = prior;
  }
});

async function scenario(mode, {command='deploy', candidate='new candidate', corrupt=false} = {}) {
  const root = await mkdtemp(resolve(tmpdir(), 'ssai-rag-test-'));
  for (const dir of ['scripts/rag','knowledge/generated','knowledge/qa','backup']) await mkdir(resolve(root,dir), {recursive:true});
  await copyFile(new URL('../deploy-rag.mjs', import.meta.url), resolve(root,'scripts/rag/deploy-rag.mjs'));
  await writeFile(resolve(root,'knowledge/generated/SapinSapin-knowledge-base-rag-current.md'),candidate);
  await writeFile(resolve(root,'knowledge/qa/questions.json'), JSON.stringify({questions:[{id:'identity',question:'Who?',must_mention_any:['expected']}]}));
  await writeFile(resolve(root,'backup/production-item.backup'),'old candidate');
  await writeFile(resolve(root,'backup/metadata.json'),JSON.stringify({id:'item',key:'SapinSapin-knowledge-base-rag-current.md',sha256:corrupt?'corrupt':createHash('sha256').update('old candidate').digest('hex')}));
  const shim = `import {writeFile} from 'node:fs/promises';
    let current = ${JSON.stringify(mode==='health'?'new candidate':mode==='drift'?'changed elsewhere':'old candidate')};
    const calls=[];
    globalThis.fetch = async (url,o={}) => {
      const path = new URL(url).pathname; const method=o.method||'GET'; calls.push(method+' '+path);
      const item={id:'item',key:'SapinSapin-knowledge-base-rag-current.md',source_id:null,status:'completed',chunks_count:3};
      const result=value=>Response.json({success:true,result:value});
      if(path.endsWith('/download')) return new Response(current);
      if(method==='POST' && path.endsWith('/items')) {current=await o.body.get('file').text();return result(item);}
      if(path.endsWith('/search')) {
        const opts=JSON.parse(o.body); if(opts.ai_search_options.cache.enabled!==false) throw Error('QA must bypass cache'); if(opts.ai_search_options.retrieval.max_num_results!==5) throw Error('QA settings mismatch');
        return result({chunks:${JSON.stringify(mode==='qa-fail'?[]:[{text:'expected'}])}});
      }
      if(path.endsWith('/items')) return result([item]);
      return result(item);
    };
    process.on('exit',()=>{import('node:fs').then(()=>{});});
    import {writeFileSync} from 'node:fs';
    process.on('exit',()=>writeFileSync(${JSON.stringify(resolve(root,'calls.json'))},JSON.stringify({calls,current})));
  `;
  await writeFile(resolve(root,'mock.mjs'), shim);
  const run = spawnSync(process.execPath,['--import',resolve(root,'mock.mjs'),resolve(root,'scripts/rag/deploy-rag.mjs'),command],{encoding:'utf8',env:{...process.env,CLOUDFLARE_API_TOKEN:'fake',CLOUDFLARE_ACCOUNT_ID:'fake',RAG_BACKUP_DIR:resolve(root,'backup')}});
  return {...run, ...JSON.parse(await readFile(resolve(root,'calls.json'),'utf8'))};
}
test('deploy verifies exact bytes and retrieval, preserving backup', async()=>{
  const r=await scenario('normal'); assert.equal(r.status,0,r.stderr);assert.equal(r.current,'new candidate');assert.equal(r.calls.filter(c=>c.startsWith('POST')&&c.endsWith('/items')).length,1);
});
test('retrieval failure restores exact backup bytes',async()=>{
  const r=await scenario('qa-fail');assert.notEqual(r.status,0);assert.equal(r.current,'old candidate');assert.equal(r.calls.filter(c=>c.startsWith('POST')&&c.endsWith('/items')).length,2);assert.match(r.stderr,/Rollback completed/);
});
test('corrupt backup and intervening production change fail before any write',async()=>{
  for(const opts of [{mode:'normal',corrupt:true},{mode:'drift'}]){
    const r=await scenario(opts.mode,opts);assert.notEqual(r.status,0);assert.equal(r.calls.some(c=>c.startsWith('POST')&&c.endsWith('/items')),false);
  }
});
test('identical production candidate runs QA without upload',async()=>{
  const r=await scenario('normal',{candidate:'old candidate'});assert.equal(r.status,0,r.stderr);assert.equal(r.calls.some(c=>c.startsWith('POST')&&c.endsWith('/items')),false);
});
test('health is read-only and detects stale production bytes',async()=>{
  const healthy=await scenario('health',{command:'health'});assert.equal(healthy.status,0,healthy.stderr);
  const stale=await scenario('normal',{command:'health'});assert.notEqual(stale.status,0);
  assert.equal([...healthy.calls,...stale.calls].some(c=>c.startsWith('POST')&&c.endsWith('/items')),false);
});

test('date-only refresh is a no-op; real source change is detected',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'ssai-refresh-test-'));
  await mkdir(resolve(root,'knowledge/snapshots'),{recursive:true});
  await copyFile(new URL('../check-refresh-change.mjs',import.meta.url),resolve(root,'check.mjs'));
  const file=resolve(root,'knowledge/snapshots/current-public-state.json');
  const snapshot={generated_at:'2026-10-07',totals:{models:1},models:[{id:'one'}]};
  await writeFile(file,JSON.stringify(snapshot));
  const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  git(['init','-q']);git(['add','.']);git(['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture']);
  await writeFile(file,JSON.stringify({...snapshot,generated_at:'2026-10-11'}));
  const check=()=>spawnSync(process.execPath,['check.mjs'],{cwd:root,encoding:'utf8'}).stdout.trim();
  assert.equal(check(),'false');
  await writeFile(file,JSON.stringify({...snapshot,totals:{models:2}}));assert.equal(check(),'true');
});

test('asset license mismatch is rejected by deterministic validation',async()=>{
  const root=await mkdtemp(resolve(tmpdir(),'ssai-license-test-'));
  for(const dir of ['scripts/rag','knowledge/generated','knowledge/snapshots','knowledge/qa']) await mkdir(resolve(root,dir),{recursive:true});
  for(const file of ['scripts/rag/validate-rag.mjs','knowledge/generated/SapinSapin-knowledge-base-rag-current.md','knowledge/snapshots/current-public-state.json','knowledge/qa/questions.json']) {
    await copyFile(new URL('../../../'+file,import.meta.url),resolve(root,file));
  }
  const run=()=>spawnSync(process.execPath,[resolve(root,'scripts/rag/validate-rag.mjs')],{encoding:'utf8'});
  assert.equal(run().status,0);
  const file=resolve(root,'knowledge/generated/SapinSapin-knowledge-base-rag-current.md');
  const content=await readFile(file,'utf8');
  await writeFile(file,content.replace(/(\| \[gpt-oss-20b-balitanlp-cpt\][^\n]*)apache-2\.0/,'$1invented-license'));
  const rejected=run();assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/license does not match/);
});


test('live health checks the actual Worker response schema and rejects missing retrieval', async () => {
  const workflow=await readFile(new URL('../../../.github/workflows/ssai-rag-health.yml',import.meta.url),'utf8');
  const healthBlock=workflow.split('- name: Verify live Sappy retrieves and answers')[1].split('- name: Record health result')[0];
  const code=healthBlock.split("<<'JS'\n")[1].split('          JS')[0];
  const run=(body,status=200,origin='https://sapinsapin.ai')=>spawnSync(process.execPath,['--input-type=module','-e',`globalThis.fetch=async()=>Response.json(${JSON.stringify(body)},{status:${status},headers:{'access-control-allow-origin':${JSON.stringify(origin)}}});\n${code}`],{encoding:'utf8'});
  assert.equal(run({answer:'Tim Santos is the founder.',mode:'project_rag',retrieval:{chunks_found:5}}).status,0);
  assert.notEqual(run({answer:'Tim Santos',meta:{chunks_found:5}}).status,0);
  assert.notEqual(run({answer:'Tim Santos',retrieval:{chunks_found:0}}).status,0);
  assert.notEqual(run({answer:'Tim Santos',retrieval:{chunks_found:5}},403).status,0);
  assert.notEqual(run({answer:'Tim Santos',retrieval:{chunks_found:5}},200,'https://unapproved.invalid').status,0);
});


test('live health retries a transient Worker outage but gives up on a persistent one', async () => {
  const workflow=await readFile(new URL('../../../.github/workflows/ssai-rag-health.yml',import.meta.url),'utf8');
  const healthBlock=workflow.split('- name: Verify live Sappy retrieves and answers')[1].split('- name: Record health result')[0];
  const code=healthBlock.split("<<'JS'\n")[1].split('          JS')[0];
  const good={answer:'Tim Santos is the founder.',mode:'project_rag',retrieval:{chunks_found:5}};
  const busy={error:'Sappy is temporarily unavailable. Please try again later.'};
  const noRetrieval={answer:'Tim Santos',meta:{chunks_found:5}};
  const step=(status,body)=>({status,body});
  // A stateful fetch: each attempt consumes the next scripted step, repeating
  // the last one. The retry delay is dropped to zero so the regression test
  // never really sleeps.
  const run=(steps)=>spawnSync(process.execPath,['--input-type=module','-e',`
    let __n=0;const __steps=${JSON.stringify(steps)};
    globalThis.fetch=async()=>{const s=__steps[Math.min(__n++,__steps.length-1)];
      return new Response(JSON.stringify(s.body),{status:s.status,headers:{'access-control-allow-origin':'https://sapinsapin.ai'}});};
    ${code}`],{encoding:'utf8',env:{...process.env,SAPPY_HEALTH_RETRY_DELAY_MS:'0'}});

  const recovered=run([step(503,busy),step(503,busy),step(200,good)]);
  assert.equal(recovered.status,0,recovered.stderr);
  assert.match(recovered.stdout,/attempt 3\/3/);
  assert.match(recovered.stderr,/Sappy attempt 1\/3/);
  assert.notEqual(run([step(503,busy),step(503,busy),step(503,busy)]).status,0);
  // Bounded: a fourth, successful attempt is never reached.
  assert.notEqual(run([step(503,busy),step(503,busy),step(503,busy),step(200,good)]).status,0);

  // A schema mismatch cannot be fixed by retrying, so it fails on attempt one.
  const schema=run([step(200,noRetrieval),step(200,good)]);
  assert.notEqual(schema.status,0);
  assert.match(schema.stderr,/Sappy attempt 1\/3/);
  assert.doesNotMatch(schema.stderr,/Sappy attempt 2\/3/);
});
