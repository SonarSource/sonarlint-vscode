const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn, execFileSync } = require('node:child_process');
const vscode = require('vscode');
const repo = process.env.SONARLINT_SEARCH_REPO;
const sinon = require(repo + '/node_modules/sinon');
const { BindingService } = require(repo + '/out/src/connected/binding');
const { SonarLintExtendedLanguageClient } = require(repo + '/out/src/lsp/client');
const { ServerType } = require(repo + '/out/src/connected/connections');
const { start } = require('./backend-proof');
const sleep = ms => new Promise(r => setTimeout(r,ms));
async function until(check,label) {const end=Date.now()+15000;while(!check()){if(Date.now()>end)throw Error('Timed out: '+label);await sleep(25);}}
exports.run=async()=>{
  const output=process.env.SONARLINT_PROOF_OUTPUT;fs.mkdirSync(output,{recursive:true});
  const backend=await start(output);const sandbox=sinon.createSandbox();let recorder;let picker;
  // The isolated fixture has no Findings view; the normal post-save focus command is a no-op.
  const findingsFocus=vscode.commands.registerCommand('SonarQube.Findings.focus',()=>{});
  const proofs=[];const proof=(message)=>{proofs.push(message);console.log('PASS '+message);};
  try {
    const workspace=vscode.workspace.workspaceFolders[0];
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspace.uri,'VALIDATION.md')));
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    const rpcCalls=[];
    const sendRequest=(method,params)=> {rpcCalls.push({method:typeof method==='string'?method:method.method,params});return backend.request(typeof method==='string'?method:method.method,params);};
    const sendNotification=(method,params)=>{rpcCalls.push({method:typeof method==='string'?method:method.method,params,notification:true});return backend.notify(typeof method==='string'?method:method.method,params);};
    // Exercise the actual client methods with their transport connected to published SLLS.
    const client={};
    for(const method of ['fuzzySearchProjects','getRemoteProjectsForConnection','getSuggestedBinding','addedManualBindings']) client[method]=(...args)=>SonarLintExtendedLanguageClient.prototype[method].call({sendRequest,sendNotification},...args);
    const service=new BindingService(client,{}, {loadSonarQubeConnection:async()=>({serverUrl:backend.url})},{});
    const save=sandbox.spy(service,'saveManualBinding');
    const originalCreate=vscode.window.createQuickPick;
    sandbox.stub(vscode.window,'createQuickPick').callsFake(()=>{picker=originalCreate();return picker;});
    let errors=0;const originalError=vscode.window.showErrorMessage;
    sandbox.stub(vscode.window,'showErrorMessage').callsFake((...args)=>{errors++;return originalError(...args);});
    await vscode.commands.executeCommand('notifications.clearAll');
    const tree=execFileSync('xwininfo',['-root','-tree'],{encoding:'utf8'});
    const line=tree.split('\n').find(l=>l.includes('PR 1294 - Fixture validation'));
    assert.ok(line,'Dedicated VS Code test window found');const id=line.trim().split(' ')[0];
    recorder=spawn('ffmpeg',['-y','-hide_banner','-loglevel','warning','-f','x11grab','-window_id',id,'-draw_mouse','0','-framerate','10','-i',process.env.DISPLAY,'-an','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',output+'/native-picker.mp4'],{stdio:['pipe','ignore','pipe']});
    recorder.stderr.pipe(fs.createWriteStream(output+'/recording.log'));
    await sleep(800);
    await service.pickRemoteProjectToBind('validation',workspace,ServerType.SonarQube,workspace.name);
    const initial=picker.items;
    assert.deepEqual(initial.filter(i=>i.kind!==vscode.QuickPickItemKind.Separator).map(i=>i.description),['catalogue']);
    proof('Initial catalogue loaded through published SLLS; needle is absent');await sleep(1500);
    const before=rpcCalls.length;picker.value='  needle  ';
    await until(()=>picker.busy,'input event');
    assert.equal(picker.items.length,0);assert.equal(picker.busy,true);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');assert.equal(save.callCount,0);
    proof('Enter during loading does not bind');
    await until(()=>!picker.busy && picker.items.length===2,'remote search');
    assert.deepEqual(picker.items.map(i=>i.description),['needle','another-project']);
    assert.ok(picker.items.every(i=>i.alwaysShow));
    const searches=rpcCalls.slice(before).filter(r=>r.method==='sonarlint/fuzzySearchProjects');
    assert.deepEqual(searches.map(s=>s.params),[{connectionId:'validation',searchText:'needle'}]);
    await sleep(250);assert.equal(picker.activeItems[0].description,'needle');
    proof('Trimmed remote query reaches Core; key-only result is active and visible');await sleep(1800);
    // Native VS Code may display the name match above Core's active key match.
    await vscode.commands.executeCommand('workbench.action.quickOpenSelectPrevious');await sleep(250);
    assert.equal(picker.activeItems[0].description,'another-project');
    proof('Native navigation reaches the other visible result');
    await sleep(700);picker.value='';await sleep(100);
    assert.equal(picker.items.length,initial.length);assert.equal(picker.busy,false);
    assert.deepEqual(picker.items.map(i=>i.description),initial.map(i=>i.description));
    proof('Clearing input immediately restores the saved grouped catalogue');await sleep(1200);
    picker.value='empty';await until(()=>picker.busy,'empty input event');await until(()=>!picker.busy,'empty search');assert.equal(picker.items.length,0);assert.equal(save.callCount,0);
    proof('Empty server success leaves native empty state and saves nothing');await sleep(1000);
    picker.value='failure';await until(()=>picker.busy,'failure input event');await until(()=>!picker.busy,'failed search');assert.equal(picker.items.length,0);assert.equal(errors,1);assert.equal(save.callCount,0);
    proof('HTTP 500 clears busy/results and shows one nonmodal error');await sleep(1400);
    await vscode.commands.executeCommand('notifications.clearAll');
    picker.value='needle';await until(()=>picker.busy,'retry input event');await until(()=>!picker.busy && picker.items.length===2,'retry');await sleep(250);
    assert.equal(picker.activeItems[0].description,'needle');proof('Picker recovers; Core first result is active again');await sleep(1600);
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
    await until(()=>save.callCount===1,'one binding save');await save.firstCall.returnValue;
    const persisted=vscode.workspace.getConfiguration('sonarlint',workspace).get('connectedMode.project');
    assert.deepEqual(persisted,{connectionId:'validation',projectKey:'needle'});
    const telemetry=rpcCalls.filter(r=>r.method==='sonarlint/addedManualBindings');assert.equal(telemetry.length,1);
    proof('Actual saveManualBinding persisted needle and sent manual-binding telemetry exactly once');
    await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');await sleep(200);assert.equal(save.callCount,1);
    await vscode.commands.executeCommand('notifications.clearAll');
    const settings=vscode.Uri.joinPath(workspace.uri,'.vscode','settings.json');
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(settings));await sleep(1800);
    fs.writeFileSync(output+'/assertions.json',JSON.stringify({head:'a202195c40097e79116c1bf881ca790134a106cd',vscode:vscode.version,slls:'6.4.0.79986',server:'Local HTTP fixture, not a live SonarQube deployment',proofs,persisted,saveCount:save.callCount,telemetryCount:telemetry.length,rpcCalls},null,2)+'\n');
    console.log('NATIVE_PUBLISHED_LS_PASS '+vscode.version+' '+proofs.length+' assertions; persisted binding once');
  }finally{
    picker?.dispose();findingsFocus.dispose();sandbox.restore();await backend.close();
    if(recorder){recorder.stdin.write('q');await new Promise(resolve=>recorder.once('close',resolve));}
  }
};
