const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const repo = process.env.SONARLINT_SEARCH_REPO || process.cwd();
const rpc = require(repo + '/node_modules/vscode-jsonrpc/lib/node/main.js');
// Encode the actual SonarQube protobuf schema: Paging=1, components=2,
// Component.key=2 and Component.name=6. No search logic is mocked in the client.
const varint = n => { const b=[]; do { b.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while(n); return Buffer.from(b); };
const field = (n,b) => Buffer.concat([varint(n*8+2),varint(b.length),b]);
const projectList = items => Buffer.concat([field(1,Buffer.from([8,1,16,10,24,items.length])),...items.map(p=>field(2,Buffer.concat([field(2,Buffer.from(p.key)),field(6,Buffer.from(p.name))])))]);
exports.start = async function(output) {
  const requests=[];
  const initial=[{key:'catalogue',name:'Catalogue project'}];
  const results=[{key:'needle',name:'Zulu key-only match'},{key:'another-project',name:'Needle name match'}];
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://fixture'); requests.push(req.url);
    let data; let status=200; let type='application/json';
    if(url.pathname==='/api/system/status') data=JSON.stringify({status:'UP',version:'2025.1',id:'validation-fixture'});
    else if(url.pathname==='/api/server/version') data='2025.1';
    else if(url.pathname==='/api/authentication/validate') data='{"valid":true}';
    else if(url.pathname==='/api/components/search.protobuf') {
      const q=url.searchParams.get('q'); type='application/x-protobuf';
      if(q==='failure') { status=500; data='controlled fixture failure'; }
      else data=projectList(q ? (q==='empty' ? [] : results) : initial);
    } else if(url.pathname==='/api/components/show') {
      const key=url.searchParams.get('component');
      if(key==='needle') data=JSON.stringify({component:{key:'needle',name:'Zulu key-only match',qualifier:'TRK'}});
      else {status=404;data='{"errors":[]}';}
    } else if(url.pathname==='/api/features/list') data='[]';
    else if(url.pathname.endsWith('.protobuf')) {data=Buffer.alloc(0);type='application/x-protobuf';}
    else if(url.pathname==='/api/plugins/installed') data='{"plugins":[]}';
    else {status=404;data='{"errors":[]}';}
    res.writeHead(status,{'Content-Type':type});res.end(data);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const profile=output+'/ls-home'; fs.mkdirSync(profile,{recursive:true});
  const proc=spawn('java',['-Duser.home='+profile,'-Dsonarlint.telemetry.disabled=true','-jar',repo+'/server/sonarlint-ls.jar','-stdio'],{stdio:['pipe','pipe','pipe']});
  const stderr=fs.createWriteStream(output+'/language-server-stderr.log');proc.stderr.pipe(stderr);
  const connection=rpc.createMessageConnection(new rpc.StreamMessageReader(proc.stdout),new rpc.StreamMessageWriter(proc.stdin));
  const settings={connectedMode:{connections:{sonarqube:[{connectionId:'validation',serverUrl:url,token:'fixture-token'}],sonarcloud:[]}},automaticAnalysis:false};
  connection.onRequest('workspace/configuration',p=>p.items.map(i=>i.section==='sonarlint'?settings:null));
  connection.onRequest('sonarlint/getTokenForServer',()=> 'fixture-token');
  connection.onRequest(()=>null);connection.onNotification(()=>{});connection.listen();
  const init=await connection.sendRequest('initialize',{processId:process.pid,rootUri:null,workspaceFolders:[],capabilities:{workspace:{configuration:true},window:{}},clientInfo:{name:'PR 1294 validation',version:'1'},initializationOptions:{productKey:'vscode',productName:'SonarLint VSCode validation',productVersion:'0.0.0',telemetryStorage:profile+'/telemetry',rules:{},automaticAnalysis:false,connections:settings.connectedMode.connections}});
  console.log('PUBLISHED_LS',init.serverInfo);assert.equal(init.serverInfo.version,'6.4.0.79986');
  await connection.sendNotification('initialized',{});
  const request=(method,params)=>connection.sendRequest(method,params);
  return {request,notify:(method,params)=>connection.sendNotification(method,params),requests,url,initial,results, async close(){
    fs.writeFileSync(output+'/http-requests.json',JSON.stringify(requests,null,2)+'\n');
    try{await Promise.race([request('shutdown'),new Promise(r=>setTimeout(r,2000))]);}finally{connection.dispose();proc.kill();server.close();stderr.end();}
  }};
};
if(require.main===module) (async()=>{
  const output='/tmp/sonar-project-search-validation/backend-proof';fs.mkdirSync(output,{recursive:true});const backend=await exports.start(output);
  try{
    const catalogue=await backend.request('sonarlint/getRemoteProjectsForConnection',{connectionId:'validation'});
    assert.deepEqual(catalogue,{catalogue:'Catalogue project'});console.log('CATALOGUE',catalogue);
    const found=await backend.request('sonarlint/fuzzySearchProjects',{connectionId:'validation',searchText:'needle'});
    assert.deepEqual(found.topResults,backend.results);console.log('SEARCH_BEYOND_CATALOGUE',found);
    assert.deepEqual(await backend.request('sonarlint/fuzzySearchProjects',{connectionId:'validation',searchText:'empty'}),{topResults:[]});
    await assert.rejects(backend.request('sonarlint/fuzzySearchProjects',{connectionId:'validation',searchText:'failure'}));
    await assert.rejects(backend.request('sonarlint/fuzzySearchProjects',{connectionId:'unknown',searchText:'needle'}));
    console.log('PUBLISHED_BACKEND_PASS catalogue exclusion, ordered remote results, empty success, HTTP failure and unknown connection');
  }finally{await backend.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
