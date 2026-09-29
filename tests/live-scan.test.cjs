const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const moduleSource=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const source=moduleSource.slice(0,moduleSource.lastIndexOf('\nrender();\ninitialize();'));
const flush=async()=>{for(let i=0;i<12;i++) await Promise.resolve();};
function deferred(){let resolve; const promise=new Promise(r=>{resolve=r;}); return {promise,resolve};}
function stream(){
  const listeners={};
  const track={stopped:false,stop(){this.stopped=true;},addEventListener(name,fn){listeners[name]=fn;}};
  return {track,listeners,getTracks:()=>[track],getVideoTracks:()=>[track]};
}
function app({getUserMedia,decode,memoOverflow,fetch:fetchMock,initialStorage={},href='https://example.test/'}={}){
  const timers=new Map(), elements=new Map(), events={}, storage=new Map(Object.entries(initialStorage)), requests=[], scrolls=[];
  let timerId=0, context;
  let now=Date.now();
  class TestDate extends Date{static now(){return now;}}
  class Element{
    constructor(){
      this.style={}; this.children=[]; this.childNodes=this.children; this.handlers={}; this.hidden=false; this.open=false;
      this.textContent=''; this.value=''; this.readyState=4; this.videoWidth=1280; this.videoHeight=720;
      this.attributes={}; this.classList={add(){},remove(){},toggle(){}};
    }
    get textContent(){return this._text||'';}
    set textContent(value){this._text=value; for(const child of this.children||[]) child.parentNode=null; this.children=[]; this.childNodes=this.children;}
    addEventListener(name,fn){this.handlers[name]=fn;}
    get scrollHeight(){return this.className==='memo-preview' && memoOverflow?.(this.textContent)?100:54;}
    get clientHeight(){return 54;}
    appendChild(child){return this.insertBefore(child,null);}
    insertBefore(child,before){child.remove(); const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,child);child.parentNode=this;return child;}
    remove(){if(this.parentNode){const a=this.parentNode.children;a.splice(a.indexOf(this),1);this.parentNode=null;}}
    replaceWith(child){const parent=this.parentNode; parent.insertBefore(child,this);this.remove();}
    getBoundingClientRect(){const top=this.parentNode?this.parentNode.children.indexOf(this)*300-sandbox.window.scrollY:0;return {top,bottom:top+300};}
    setAttribute(name,value){this.attributes[name]=value;} focus(){this.focused=true;sandbox.document.activeElement=this;} scrollIntoView(){this.scrolled=true;}
    select(){} setSelectionRange(){} click(){this.handlers.click?.();}
    showModal(){this.open=true;} close(){this.open=false;}
    pause(){} play(){return Promise.resolve();}
    getContext(){return {drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(16),width:2,height:2})};}
  }
  const get=id=>{if(!elements.has(id)) elements.set(id,new Element()); return elements.get(id);};
  get('scanNotice').hidden=true;
  const camera=stream();
  const sandbox={
    console,URL,Date:TestDate,Uint8Array,Uint8ClampedArray,TextDecoder,Blob,AbortController,
    testAdvance:ms=>{now+=ms;},
    document:{getElementById:get,createElement:()=>new Element(),body:new Element(),hidden:false,addEventListener:(n,f)=>events[n]=f},
    window:{addEventListener:(n,f)=>events[n]=f,open(){return {opener:{}};},scrollY:0,scrollBy:(x,y)=>{scrolls.push(y);sandbox.window.scrollY+=y;},history:{replaceState(){}},location:{href,assign:url=>{sandbox.redirect=url;}}},
    navigator:{mediaDevices:{getUserMedia:getUserMedia||(()=>Promise.resolve(camera))}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    location:{href:'https://example.test/',origin:'https://example.test/',pathname:'/'},
    setTimeout:(fn,ms)=>{const id=++timerId; timers.set(id,{fn,ms}); return id;},clearTimeout:id=>timers.delete(id),
    fetch:async (url,options)=>{requests.push({url,options}); return fetchMock?fetchMock(url,options):{ok:true,status:200,json:async()=>({model_type:'テスト型番',price:1000})};},
    testDecode:decode||(()=>Promise.resolve([]))
  };
  context=vm.createContext(sandbox);
  vm.runInContext(source+`\nreadBarcodes=testDecode; render();
    this.api={startScanner,stopScanner,scanCameraFrame,handleFile,addScan,render,initialize,refreshHistory,loadStock,fetchStock,submitManual,copyText,stockPhotoURL,
      session:()=>cameraSession,history:()=>history,
      setHistory:items=>{history=items; render();},
      setAuth:auth=>{authSession=auth;render();},
      auth:()=>authSession,
      advance:ms=>{testAdvance(ms);},
      setInit:fn=>{initLib=fn;},
      showStock:(stock,authenticated,detailsOpen=true)=>{
        authSession=authenticated?{token:'test-token',expires_at:new Date(Date.now()+60000).toISOString()}:null;
        history=[{code:'P009000',fmt:'Code128',stock,detailsOpen}]; render();
      },
      setDecoder:fn=>{readBarcodes=fn;},setMedia:fn=>{navigator.mediaDevices.getUserMedia=fn;}};`,context);
  return {api:context.api,get,camera,events,storage,requests,sandbox,scrolls,
    tick:async()=>{const next=[...timers].find(([,v])=>v.ms===220); assert.ok(next,'next scan scheduled'); timers.delete(next[0]); await next[1].fn(); await flush();},
    timers};
}
const code=value=>[{text:value,format:'Code128'}];
const visibleText=element=>[element.textContent,...element.children.flatMap(visibleText)].join(' ');
const descendants=element=>[element,...element.children.flatMap(descendants)];

test('only overflowing memos show a gray continuation and reveal full text in details',()=>{
  const a=app({memoOverflow:text=>text.length>60});
  const memo='9/22 引き合い解除\n8/7 引き合いあり\nスピンドルの写真あり\n'.repeat(4);
  a.api.showStock({price_memo:'短い価格メモ',memo},true,false);
  let row=a.get('histList').children.at(-1);
  let markers=descendants(row).filter(node=>node.className==='memo-more');
  assert.equal(markers.length,2);
  assert.equal(markers[0].hidden,true);
  assert.equal(markers[1].hidden,false);
  assert.equal(markers[1].textContent,'続きあり');
  const details=descendants(row).find(node=>node.className==='stock-details');
  assert.equal(details.hidden,true);
  const fullRows=details.children.filter(node=>visibleText(node).includes('（全文）'));
  assert.equal(fullRows.length,2);
  assert.equal(fullRows[0].hidden,true);
  assert.equal(fullRows[1].hidden,false);
  descendants(row).find(node=>node.className==='detail-toggle').onclick();
  row=a.get('histList').children.at(-1);
  markers=descendants(row).filter(node=>node.className==='memo-more');
  assert.equal(markers[1].hidden,true);
  const expanded=descendants(row).find(node=>node.className==='stock-details');
  assert.equal(expanded.hidden,false);
  assert.ok(visibleText(expanded).includes(memo));
});

test('staff price fields show authenticated values and cached values disappear after logout',()=>{
  const a=app();
  const stock={model_type:'テスト型番',price:1800000,current_price:1500000,
    current_price_label:'入札会2026春',internal_price:1800000,external_price:0,
    price_memo:'値引き相談',memo:'動作確認済み',event_price:1500000};
  a.api.showStock(stock,true);
  const loggedIn=visibleText(a.get('histList').children.at(-1));
  for(const value of ['現在価格','¥1,500,000','入札会2026春','非公開価格','¥1,800,000','一時価格','¥0','価格メモ','値引き相談','メモ','動作確認済み']){
    assert.ok(loggedIn.includes(value),value);
  }
  a.api.showStock(stock,false);
  const loggedOut=visibleText(a.get('histList').children.at(-1));
  assert.match(loggedOut,/社員情報を見るにはログイン/);
  for(const value of ['¥1,500,000','¥1,800,000','値引き相談','動作確認済み']){
    assert.ok(!loggedOut.includes(value),value);
  }
});

test('live decode closes camera and registers only after confirmation in another frame',async()=>{
  const a=app({decode:async()=>code('P009000')});
  await a.api.startScanner(); await flush();
  assert.equal(a.get('scanner').open,true);
  assert.equal(a.api.history().length,0);
  await a.tick();
  assert.equal(a.get('scanner').open,false);
  assert.equal(a.camera.track.stopped,true);
  assert.equal(a.get('cameraVideo').srcObject,null);
  assert.equal(a.api.history().length,1);
  assert.equal(a.api.history()[0].code,'P009000');
  assert.equal(a.api.history()[0].stock.model_type,'テスト型番');
  assert.match(a.get('scanNotice').textContent,/登録しました/);
  assert.equal(a.get('scanNotice').scrolled,true);
  assert.equal(a.get('scanButtonLabel').textContent,'スキャン');
  assert.equal(a.requests.length,1);
  assert.equal(a.timers.size,0);
  assert.equal(JSON.parse(a.storage.get('kkmt_barcode_history'))[0].code,'P009000');
});
test('invalid or empty frames keep scanning; a changed candidate requires confirmation',async()=>{
  const results=[code('1234567'),[],code('P009000'),code('P009001'),code('P009001')];
  const a=app({decode:async()=>results.shift()});
  await a.api.startScanner(); await flush();
  for(let i=0;i<3;i++){await a.tick(); assert.equal(a.api.history().length,0);}
  await a.tick(); assert.equal(a.api.history()[0].code,'P009001');
});
test('cancel while permission is pending stops a late stream without registering',async()=>{
  const permission=deferred(), late=stream();
  const a=app({getUserMedia:()=>permission.promise});
  const opening=a.api.startScanner();
  a.api.stopScanner(); permission.resolve(late); await opening;
  assert.equal(late.track.stopped,true);
  assert.equal(a.api.history().length,0);
  assert.equal(a.get('scanner').open,false);
});
test('closing during decoding ignores its result and does not stop the next session',async()=>{
  const pending=deferred(), a=app({decode:()=>pending.promise});
  await a.api.startScanner(); await flush();
  a.api.stopScanner();
  const next=stream(); a.api.setMedia(async()=>next); a.api.setDecoder(async()=>[]);
  await a.api.startScanner(); pending.resolve(code('P009000')); await flush();
  assert.equal(a.api.history().length,0);
  assert.equal(a.get('scanner').open,true);
  assert.equal(next.track.stopped,false);
  a.api.stopScanner(); assert.equal(next.track.stopped,true);
});
test('double tapping start only requests one camera',async()=>{
  let calls=0; const pending=deferred(); const a=app({getUserMedia:()=>{calls++;return pending.promise;}});
  const opening=a.api.startScanner(); await a.api.startScanner(); assert.equal(calls,1);
  pending.resolve(a.camera); await opening; a.api.stopScanner();
});
test('scanning the same code again moves it to the top without duplicate rows',async()=>{
  const a=app({decode:async()=>code('P009000')});
  a.api.addScan('P009000','Code128'); a.api.addScan('P009001','Code128'); await flush();
  await a.api.startScanner(); await flush(); await a.tick();
  assert.equal(a.api.history().length,2);
  assert.equal(a.api.history()[0].code,'P009000');
  assert.match(a.get('scanNotice').textContent,/登録済み/);
});
test('permission errors expose a usable fallback and allow retry',async()=>{
  const a=app({getUserMedia:async()=>{throw {name:'NotAllowedError'};}});
  await a.api.startScanner();
  assert.equal(a.api.session(),null); assert.equal(a.get('scanner').open,false);
  assert.match(a.get('scanNotice').textContent,/カメラ使用を許可/);
  a.api.setMedia(async()=>a.camera); await a.api.startScanner();
  assert.equal(a.get('scanner').open,true); a.api.stopScanner();
});
test('backgrounding, page exit, Escape, manual entry and interrupted track release camera',async()=>{
  for(const trigger of ['visibilitychange','pagehide','cancel','manual','ended','mute']){
    const a=app(); await a.api.startScanner(); await flush();
    if(trigger==='visibilitychange'){a.sandbox.document.hidden=true; a.events.visibilitychange();}
    else if(trigger==='pagehide') a.events.pagehide();
    else if(trigger==='cancel') a.get('scanner').handlers.cancel({preventDefault(){}});
    else if(trigger==='manual') a.get('scannerManual').handlers.click();
    else a.camera.listeners[trigger]();
    assert.equal(a.camera.track.stopped,true,trigger);
    assert.equal(a.get('scanner').open,false,trigger);
    assert.equal(a.api.history().length,0,trigger);
  }
});
test('album image decoding still registers and makes stock request',async()=>{
  const a=app({decode:async()=>code('P009002')});
  a.get('albumInput').handlers.change({target:{files:[{size:10}],value:'selected'}}); await flush();
  assert.equal(a.api.history()[0].code,'P009002');
  assert.equal(a.requests.length,1); assert.equal(a.get('capBtn').disabled,false);
});
test('repeated decoder errors stop camera and show retry guidance',async()=>{
  const a=app({decode:async()=>{throw new Error('decode failed');}});
  await a.api.startScanner(); await flush(); await a.tick(); await a.tick();
  assert.equal(a.camera.track.stopped,true);
  assert.equal(a.api.history().length,0);
  assert.match(a.get('scanNotice').textContent,/もう一度スキャン/);
});

const auth=(token='test-token',ms=60000)=>({token,expires_at:new Date(Date.now()+ms).toISOString()});
const response=(stock,status=200)=>({ok:status>=200&&status<300,status,json:async()=>stock});
const item=(code,stock={memo:'test'})=>({code,fmt:'手入力',stock,detailsOpen:false});

test('opening a lower card keeps all rows, focus and scroll position',()=>{
  const a=app(); a.api.setAuth(auth());
  a.api.setHistory(['P009000','P009001','P009002'].map(code=>item(code)));
  const rows=[...a.get('histList').children];
  const toggle=descendants(rows[2]).find(node=>node.className==='detail-toggle');
  a.sandbox.window.scrollY=600; toggle.focus(); toggle.onclick();
  assert.deepEqual(a.get('histList').children,rows);
  assert.equal(a.sandbox.window.scrollY,600);
  assert.equal(a.sandbox.document.activeElement,toggle);
  assert.equal(a.api.history()[2].detailsOpen,true);
  assert.equal(a.api.history()[0].detailsOpen,false);
  assert.equal(toggle.attributes['aria-expanded'],'true');
  toggle.onclick(); assert.equal(toggle.attributes['aria-expanded'],'false');
});

test('resize recalculates wrapped memo without rebuilding the cards',()=>{
  let overflow=false; const a=app({memoOverflow:()=>overflow});
  a.api.showStock({memo:'long wrapped memo'},true,false);
  const row=a.get('histList').children[0];
  const marker=descendants(row).find(node=>node.className==='memo-more'&&!node.hidden);
  assert.equal(marker,undefined);
  overflow=true; a.events.resize();
  assert.equal(a.get('histList').children[0],row);
  assert.ok(descendants(row).some(node=>node.className==='memo-more'&&!node.hidden));
});

test('an asynchronous stock update does not replace other cards',async()=>{
  const pending=deferred(),a=app({fetch:()=>pending.promise});
  const items=['P009000','P009001','P009002'].map(code=>item(code));
  a.api.setHistory(items); const rows=[...a.get('histList').children];
  const loading=a.api.loadStock(items[0]);
  pending.resolve(response({model_type:'updated'})); await loading;
  assert.notEqual(a.get('histList').children[0],rows[0]);
  assert.equal(a.get('histList').children[1],rows[1]);
  assert.equal(a.get('histList').children[2],rows[2]);
});

test('token expiry removes visible staff fields without another user action',()=>{
  const a=app(); a.api.setHistory([item('P009000',{memo:'SECRET',current_price:999})]);
  a.api.setAuth(auth('expires',1000));
  assert.match(visibleText(a.get('histList')),/SECRET/);
  const expiry=[...a.timers].find(([,t])=>t.ms<=1500);
  assert.ok(expiry); a.api.advance(2000); expiry[1].fn();
  assert.doesNotMatch(visibleText(a.get('histList')),/SECRET|¥999/);
  assert.equal(a.api.auth(),null);
});

test('page restore and another tab logout hide cached staff information',()=>{
  for(const trigger of ['pageshow','visibilitychange','storage']){
    const a=app(); a.api.showStock({memo:'SECRET'},true);
    if(trigger==='storage'){
      a.storage.delete('kkmt_barcode_auth'); a.events.storage({key:'kkmt_barcode_auth'});
    }else{a.api.advance(70000);a.events[trigger]();}
    assert.doesNotMatch(visibleText(a.get('histList')),/SECRET/,trigger);
  }
});

test('successful authentication refreshes every cached public card before displaying staff fields',async()=>{
  const a=app({href:'https://example.test/?auth_code=test-code',
    initialStorage:{kkmt_barcode_history:JSON.stringify([item('P009000',{})])},
    fetch:(url,options)=>Promise.resolve(url.includes('/exchange')?response(auth()):response({memo:'STAFF MEMO',current_price:123}))});
  let initialized=false; a.api.setInit(async()=>{initialized=true;});
  await a.api.initialize();
  assert.equal(initialized,true);
  assert.match(visibleText(a.get('histList')),/STAFF MEMO|¥123/);
  assert.equal(a.requests[1].options.headers.Authorization,'Bearer test-token');
  assert.equal(a.sandbox.redirect,undefined);
});

test('restored loading state is cleared and initialization reloads history independently of decoder setup',async()=>{
  const pending=deferred();
  const a=app({initialStorage:{kkmt_barcode_history:JSON.stringify([{...item('P009000',{}),stockLoading:true}]),kkmt_barcode_auth:JSON.stringify(auth())},fetch:()=>pending.promise});
  assert.equal(a.api.history()[0].stockLoading,false);
  let initialized=false;a.api.setInit(async()=>{initialized=true;});
  const startup=a.api.initialize(); await flush();
  assert.equal(initialized,true); assert.equal(a.requests.length,1);
  pending.resolve(response({model_type:'fresh'}));await startup;
  assert.equal(a.api.history()[0].stockLoading,false);
  assert.equal(a.api.history()[0].stock.model_type,'fresh');
  assert.equal(JSON.parse(a.storage.get('kkmt_barcode_history'))[0].stockLoading,undefined);
});

test('corrupt, duplicate and invalid saved entries do not stop startup',()=>{
  const a=app({initialStorage:{kkmt_barcode_history:JSON.stringify([null,17,{},item('bad'),item('p009000'),item('P009000'),item('P009001')])}});
  assert.equal(a.api.history().length,2);
  assert.equal(a.api.history()[0].code,'P009000');
  assert.equal(a.get('histList').children.length,2);
});

test('manual input normalizes Japanese width, case and spaces and rejects invalid machine numbers',async()=>{
  const a=app();a.get('manualInput').value=' ｐ００９ ０００ ';a.api.submitManual();await flush();
  assert.equal(a.api.history()[0].code,'P009000');
  const requests=a.requests.length;
  for(const code of ['bad','1234567','P009000/secret','']){a.get('manualInput').value=code;a.api.submitManual();}
  assert.equal(a.api.history().length,1);assert.equal(a.requests.length,requests);
});

test('API timeout leaves an error instead of a permanent loading state',async()=>{
  const a=app({fetch:(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
  a.api.addScan('P009000','手入力');await flush();
  const timer=[...a.timers].find(([,t])=>t.ms===15000);assert.ok(timer);timer[1].fn();await flush();
  assert.equal(a.api.history()[0].stockLoading,false);
  assert.match(a.api.history()[0].stockError,/タイムアウト/);
});

test('401 masks cached staff fields immediately while public retry is still pending',async()=>{
  const pending=deferred();let calls=0;
  const a=app({fetch:()=>++calls===1?Promise.resolve(response({},401)):pending.promise});
  a.api.showStock({memo:'SECRET'},true);
  const loading=a.api.loadStock(a.api.history()[0]);await flush();
  assert.equal(calls,2);assert.doesNotMatch(visibleText(a.get('histList')),/SECRET/);
  pending.resolve(response({model_type:'public'}));await loading;
  assert.equal(a.api.auth(),null);
  assert.ok([...a.timers.values()].some(t=>t.ms===0));
});

test('a late 401 from an old token cannot erase a newer login',async()=>{
  const pending=deferred();let calls=0;
  const a=app({fetch:()=>++calls===1?pending.promise:Promise.resolve(response({memo:'NEW'}))});
  a.api.setAuth(auth('old')); const loading=a.api.fetchStock('P009000');
  a.api.setAuth(auth('new'));pending.resolve(response({},401));
  assert.equal((await loading).memo,'NEW');assert.equal(a.api.auth().token,'new');
  assert.equal(a.requests[1].options.headers.Authorization,'Bearer new');
});

test('deleted and reset cards ignore late API replies',async()=>{
  for(const reset of [false,true]){
    const pending=deferred(),a=app({fetch:()=>pending.promise});a.api.addScan('P009000','手入力');
    if(reset)a.get('resetAllBtn').handlers.click();else descendants(a.get('histList')).find(n=>n.className==='del').onclick();
    pending.resolve(response({memo:'late'}));await flush();
    assert.equal(a.api.history().length,0);assert.equal(a.get('histList').children.length,0);
    assert.equal(JSON.parse(a.storage.get('kkmt_barcode_history')).length,0);
  }
});

test('a newer request for the same card cannot be overwritten by an older reply',async()=>{
  const first=deferred(),second=deferred();let calls=0;
  const a=app({fetch:()=>++calls===1?first.promise:second.promise});
  const entry=item('P009000');a.api.setHistory([entry]);
  const old=a.api.loadStock(entry),latest=a.api.loadStock(entry);
  second.resolve(response({model_type:'new'}));await latest;
  first.resolve(response({model_type:'old'}));await old;
  assert.equal(entry.stock.model_type,'new');
});

test('invalid API payloads produce a recoverable stock error',async()=>{
  for(const payload of [null,[],42]){
    const a=app({fetch:async()=>response(payload)});a.api.addScan('P009000','手入力');await flush();
    assert.match(a.api.history()[0].stockError,/形式が不正/);
    assert.equal(a.api.history()[0].stockLoading,false);
  }
});

test('external links retain blocked-popup fallback and disallow the opener',()=>{
  const a=app();a.api.setHistory([item('P009000')]);
  const button=descendants(a.get('histList')).find(n=>n.className==='go primary');
  const opened={opener:{}};a.sandbox.window.open=()=>opened;button.onclick();assert.equal(opened.opener,null);
  a.sandbox.window.open=()=>null;button.onclick();assert.match(a.sandbox.location.href,/barcode=P009000/);
});

test('clipboard fallback always removes its temporary field and restores focus',async()=>{
  const a=app();a.get('manualInput').focus();a.sandbox.document.execCommand=()=>{throw new Error('blocked');};
  await assert.rejects(a.api.copyText('P009000'),/blocked/);
  assert.equal(a.sandbox.document.body.children.length,0);
  assert.equal(a.sandbox.document.activeElement,a.get('manualInput'));
});

test('photo URLs accept HTTPS and reject executable or insecure schemes',()=>{
  const a=app();assert.equal(a.api.stockPhotoURL('/photos/1.jpg'),'https://www.kkmt.co.jp/photos/1.jpg');
  for(const url of ['javascript:alert(1)','data:text/html,bad','http://example.test/photo.jpg'])assert.equal(a.api.stockPhotoURL(url),'');
});

test('timeout covers a stalled JSON body for both stock and authentication requests',async()=>{
  for(const authentication of [false,true]){
    const body=deferred();
    const a=app({href:authentication?'https://example.test/?auth_code=test':'https://example.test/',fetch:async()=>({ok:true,status:200,json:()=>body.promise})});
    let pending;
    if(authentication){a.api.setInit(async()=>{});pending=a.api.initialize();}
    else{a.api.addScan('P009000','手入力');}
    await flush();
    const timer=[...a.timers.values()].find(t=>t.ms===15000);assert.ok(timer,'body read remains protected');
    timer.fn();await flush();if(pending)await pending;
    if(authentication)assert.match(a.get('status').textContent,/認証に失敗.*タイムアウト/);
    else{assert.equal(a.api.history()[0].stockLoading,false);assert.match(a.api.history()[0].stockError,/タイムアウト/);}
  }
});

test('malformed cached field types cannot crash initialization',()=>{
  const malformed={toString:1,valueOf:2};
  const a=app({initialStorage:{
    kkmt_barcode_auth:JSON.stringify({token:'bad',expires_at:malformed}),
    kkmt_barcode_history:JSON.stringify([{code:'P009000',scannedAt:malformed,stock:{memo:malformed,current_price:malformed,model_type:malformed}}])
  }});
  assert.equal(a.api.history().length,1);assert.equal(a.api.auth(),null);
  assert.equal(a.api.history()[0].scannedAt,undefined);
  assert.equal(a.api.history()[0].stock.memo,undefined);
  assert.match(visibleText(a.get('histList')),/社員情報を見るにはログイン/);
});

test('401 headers invalidate login without waiting for a stalled error body',async()=>{
  const errorBody=deferred(),publicReply=deferred();let calls=0;
  const a=app({fetch:()=>++calls===1?Promise.resolve({ok:false,status:401,json:()=>errorBody.promise}):publicReply.promise});
  a.api.showStock({memo:'SECRET'},true);
  const loading=a.api.loadStock(a.api.history()[0]);await flush();
  assert.equal(a.api.auth(),null);assert.equal(calls,2);
  assert.doesNotMatch(visibleText(a.get('histList')),/SECRET/);
  publicReply.resolve(response({name:'public'}));await loading;
});
