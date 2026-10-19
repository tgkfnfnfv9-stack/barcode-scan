const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const moduleSource=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const source=moduleSource.slice(0,moduleSource.lastIndexOf('\nrender();\ninitialize();'));
const flush=async()=>{for(let i=0;i<40;i++) await Promise.resolve();};
function deferred(){let resolve,reject; const promise=new Promise((r,j)=>{resolve=r;reject=j;}); return {promise,resolve,reject};}
function stream({capabilities={},settings={deviceId:'rear-main',facingMode:'environment'}}={}){
  const listeners={},constraints=[];
  const track={
    stopped:false,readyState:'live',stop(){this.stopped=true;this.readyState='ended';},
    addEventListener(name,fn){listeners[name]=fn;},
    getCapabilities:()=>capabilities,getSettings:()=>settings,
    async applyConstraints(value){constraints.push(value);Object.assign(settings,...(value.advanced||[]));}
  };
  return {track,listeners,constraints,getTracks:()=>[track],getVideoTracks:()=>[track]};
}
function app({getUserMedia,decode,memoOverflow,fetch:fetchMock,initialStorage={},href='https://example.test/'}={}){
  const timers=new Map(), elements=new Map(), events={}, storage=new Map(Object.entries(initialStorage)), requests=[], scrolls=[];
  let timerId=0, context;
  const canvasDraws=[],frameReads=[];
  let now=Date.now();
  class TestDate extends Date{static now(){return now;}}
  class Element{
    constructor(){
      this.style={}; this.children=[]; this.childNodes=this.children; this.handlers={}; this.hidden=false; this.open=false;
      this.textContent=''; this.value=''; this.readyState=4; this.videoWidth=1280; this.videoHeight=720; this.currentTime=0;
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
    getContext(){return {
      drawImage:(...args)=>canvasDraws.push({canvas:this,args}),
      getImageData:(x,y,width,height)=>{
        frameReads.push({width,height});
        return {data:new Uint8ClampedArray([90,120,150,255,190,210,230,255]),width,height};
      }
    };}
  }
  const get=id=>{if(!elements.has(id)) elements.set(id,new Element()); return elements.get(id);};
  get('scanNotice').hidden=true;
  const camera=stream();
  const sandbox={
    console,URL,Date:TestDate,Uint8Array,Uint8ClampedArray,TextDecoder,Blob,AbortController,
    testAdvance:ms=>{now+=ms;},
    document:{getElementById:get,createElement:()=>new Element(),body:new Element(),hidden:false,addEventListener:(n,f)=>events[n]=f},
    window:{innerWidth:390,innerHeight:844,addEventListener:(n,f)=>events[n]=f,open(){return {opener:{}};},scrollY:0,scrollBy:(x,y)=>{scrolls.push(y);sandbox.window.scrollY+=y;},history:{replaceState(){}},location:{href,assign:url=>{sandbox.redirect=url;}}},
    navigator:{mediaDevices:{enumerateDevices:async()=>[],getUserMedia:getUserMedia||(()=>Promise.resolve(camera))}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    location:{href:'https://example.test/',origin:'https://example.test/',pathname:'/'},
    setTimeout:(fn,ms)=>{const id=++timerId; timers.set(id,{fn,ms}); return id;},clearTimeout:id=>timers.delete(id),
    fetch:async (url,options)=>{requests.push({url,options}); return fetchMock?fetchMock(url,options):{ok:true,status:200,json:async()=>({model_type:'テスト型番',price:1000})};},
    testDecode:decode||(()=>Promise.resolve([]))
  };
  context=vm.createContext(sandbox);
  vm.runInContext(source+`\nreadBarcodes=testDecode; render();
    this.api={startScanner,stopScanner,scanCameraFrame,enhanceContrast,handleFile,addScan,render,initialize,refreshHistory,loadStock,fetchStock,submitManual,copyText,stockPhotoURL,
      session:()=>cameraSession,history:()=>history,
      setHistory:items=>{history=items; render();},
      setAuth:auth=>{authSession=auth;saveAuth();render();},
      auth:()=>authSession,
      advance:ms=>{testAdvance(ms);},
      setInit:fn=>{initLib=fn;},
      showStock:(stock,authenticated,detailsOpen=true)=>{
        authSession=authenticated?{token:'test-token',expires_at:new Date(Date.now()+60000).toISOString()}:null;
        saveAuth();
        history=[{code:'P009000',fmt:'Code128',stock,detailsOpen}]; render();
      },
      setDecoder:fn=>{readBarcodes=fn;},setMedia:fn=>{navigator.mediaDevices.getUserMedia=fn;}};`,context);
  return {api:context.api,get,camera,events,storage,requests,sandbox,scrolls,
    canvasDraws,frameReads,
    tick:async({advance=true}={})=>{if(advance)get('cameraVideo').currentTime+=.22;const next=[...timers].find(([,v])=>v.ms===220); assert.ok(next,'next scan scheduled'); timers.delete(next[0]); await next[1].fn(); await flush();},
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
  assert.equal(markers[1].hidden,false);
  assert.equal(markers[1].style.visibility,'hidden');
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
    else {
      a.camera.listeners[trigger]();
      if(trigger==='mute'){
        assert.equal(a.camera.track.stopped,false,'temporary mute keeps the stream');
        const timer=[...a.timers.values()].find(value=>value.ms===3000);
        assert.ok(timer,'persistent mute timeout');timer.fn();
      }
    }
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

test('reset and page exit cancel pending album results without reviving history',async()=>{
  for(const trigger of ['reset','pagehide','visibilitychange']){
    const pending=deferred(),a=app({decode:()=>pending.promise});
    const parsing=a.api.handleFile({size:10});await flush();
    assert.equal(a.get('albumBtn').disabled,true);
    if(trigger==='reset')a.get('resetAllBtn').handlers.click();
    else if(trigger==='visibilitychange'){a.sandbox.document.hidden=true;a.events.visibilitychange();}
    else a.events.pagehide();
    pending.resolve(code('P009002'));await parsing;await flush();
    assert.equal(a.api.history().length,0,trigger);
    assert.equal(a.requests.length,0,trigger);
    assert.equal(a.get('albumBtn').disabled,false,trigger);
  }
});

test('cancelled album work cannot clear a newer album session busy state',async()=>{
  const first=deferred(),second=deferred();let calls=0;
  const a=app({decode:()=>++calls===1?first.promise:second.promise});
  const old=a.api.handleFile({size:10});await flush();a.get('resetAllBtn').handlers.click();
  const next=a.api.handleFile({size:10});first.resolve(code('P009000'));await old;await flush();
  assert.equal(a.get('albumBtn').disabled,true);
  assert.equal(a.api.history().length,0);
  second.resolve(code('P009001'));await next;await flush();
  assert.equal(a.api.history()[0].code,'P009001');
  assert.equal(a.get('albumBtn').disabled,false);
});

test('copy feedback reports the snapshot count even when history resets while copying',async()=>{
  const pending=deferred(),a=app();let copied;
  a.sandbox.navigator.clipboard={writeText:text=>{copied=text;return pending.promise;}};
  a.api.setHistory([{code:'P009000'},{code:'P009001'}]);
  a.get('copyAllBtn').handlers.click();a.get('resetAllBtn').handlers.click();
  pending.resolve();await flush();
  assert.equal(copied,'P009000\nP009001');
  assert.match(a.get('status').textContent,/コピーしました（2件）/);
});

test('deleting a just-registered card clears its obsolete success notice',async()=>{
  const a=app();a.api.addScan('P009000','手入力');await flush();
  assert.equal(a.get('scanNotice').hidden,false);
  descendants(a.get('histList')).find(n=>n.className==='del').onclick();
  assert.equal(a.get('scanNotice').hidden,true);
  assert.equal(a.api.history().length,0);
});

test('broken photo requests are replaced by an explicit fallback',()=>{
  const a=app();a.api.setHistory([{code:'P009000',stock:{name:'test',head_picture_url:'/photos/missing.jpg'}}]);
  const image=descendants(a.get('histList')).find(n=>n.className==='stock-photo');assert.ok(image);
  image.onerror();
  assert.equal(descendants(a.get('histList')).some(n=>n.className==='stock-photo'),false);
  assert.ok(descendants(a.get('histList')).some(n=>/写真なし|写真を表示できません/.test(n.textContent)));
});

test('resuming an expired tab preserves a newer shared login instead of deleting it',()=>{
  for(const event of ['pageshow','visibilitychange']){
    const a=app();a.api.setAuth(auth('old',1000));a.api.setHistory([item('P009000',{memo:'SECRET'})]);
    const newer=auth('new',120000);a.storage.set('kkmt_barcode_auth',JSON.stringify(newer));a.api.advance(2000);
    a.events[event]();
    assert.equal(a.api.auth().token,'new',event);
    assert.equal(JSON.parse(a.storage.get('kkmt_barcode_auth')).token,'new',event);
    assert.match(visibleText(a.get('histList')),/SECRET/);
  }
});

test('resuming a logged-out tab masks its cached fields even if the storage event was missed',()=>{
  const a=app();a.api.showStock({memo:'SECRET'},true);
  a.storage.delete('kkmt_barcode_auth');a.events.pageshow();
  assert.equal(a.api.auth(),null);assert.doesNotMatch(visibleText(a.get('histList')),/SECRET/);
});

test('malformed auth token objects and invalid JSON cannot keep a stale login or recurse',()=>{
  const a=app();a.api.showStock({memo:'SECRET'},true);
  a.storage.set('kkmt_barcode_auth',JSON.stringify({token:{toString:1},expires_at:auth().expires_at}));
  a.events.pageshow();assert.equal(a.api.auth(),null);assert.doesNotMatch(visibleText(a.get('histList')),/SECRET/);
  a.api.setAuth(auth());a.storage.set('kkmt_barcode_auth','malformed');a.events.pageshow();assert.equal(a.api.auth(),null);
});

test('quota errors retain newly exchanged in-memory login and still honor later shared changes',async()=>{
  const old=auth('old-saved');
  const a=app({href:'https://example.test/?auth_code=fresh',initialStorage:{kkmt_barcode_auth:JSON.stringify(old)},fetch:async()=>response(auth('fresh-login'))});
  a.api.setInit(async()=>{});a.sandbox.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
  await a.api.initialize();assert.equal(a.api.auth().token,'fresh-login');assert.equal(a.sandbox.redirect,undefined);
  a.events.pageshow();assert.equal(a.api.auth().token,'fresh-login');
  a.storage.set('kkmt_barcode_auth',JSON.stringify(auth('other-tab')));a.events.pageshow();assert.equal(a.api.auth().token,'other-tab');
  a.storage.delete('kkmt_barcode_auth');a.events.pageshow();assert.equal(a.api.auth(),null);
});


test('cancelled photo work leaves a ready status when returning to the page',async()=>{
  const pending=deferred(),a=app({decode:()=>pending.promise});
  const work=a.api.handleFile({size:10});await flush();
  a.sandbox.document.hidden=true;a.events.visibilitychange();
  a.sandbox.document.hidden=false;a.events.visibilitychange();
  pending.resolve(code('P009000'));await work;
  assert.equal(a.get('status').textContent,'写真解析を中止しました');
  assert.equal(a.get('led').className,'led ready');
  assert.equal(a.api.history().length,0);
});

test('recovered storage adopts a newer valid shared login before expiring temporary memory auth',()=>{
  const a=app();const get=a.sandbox.localStorage.getItem,set=a.sandbox.localStorage.setItem;
  a.sandbox.localStorage.getItem=()=>{throw new Error('SecurityError');};
  a.sandbox.localStorage.setItem=()=>{throw new Error('SecurityError');};
  a.api.setAuth(auth('temporary',1000));
  a.sandbox.localStorage.getItem=get;a.sandbox.localStorage.setItem=set;
  a.storage.set('kkmt_barcode_auth',JSON.stringify(auth('new-shared',120000)));a.api.advance(2000);a.events.pageshow();
  assert.equal(a.api.auth().token,'new-shared');assert.equal(JSON.parse(a.storage.get('kkmt_barcode_auth')).token,'new-shared');
});

test('recovered empty storage persists the valid temporary login instead of losing it',()=>{
  const a=app();const get=a.sandbox.localStorage.getItem,set=a.sandbox.localStorage.setItem;
  a.sandbox.localStorage.getItem=()=>{throw new Error('SecurityError');};
  a.sandbox.localStorage.setItem=()=>{throw new Error('SecurityError');};a.api.setAuth(auth('temporary'));
  a.sandbox.localStorage.getItem=get;a.sandbox.localStorage.setItem=set;a.events.pageshow();
  assert.equal(a.api.auth().token,'temporary');assert.equal(JSON.parse(a.storage.get('kkmt_barcode_auth')).token,'temporary');
});

// A still image supplements live scanning only after a bounded series of unsuccessful frames.
async function flushPhoto(){for(let i=0;i<4;i++)await flush();}
function cameraPhotoBlob(width=1920,height=1080){
  // Only the JPEG size header is consumed here; browser tests use real encoded images.
  const header=Uint8Array.of(255,216,255,192,0,17,8,height>>8,height&255,width>>8,width&255,3,1,17,0,2,17,0,3,17,0,255,217);
  return new Blob([header],{type:'image/jpeg'});
}
function installPhotoCapture(a,{capabilities,getCapabilities,takePhoto}={}){
  const calls=[],tracks=[];
  a.sandbox.createImageBitmap=async()=>({width:1920,height:1080,close(){}});
  a.sandbox.ImageCapture=class{
    constructor(track){tracks.push(track);}
    getPhotoCapabilities(){return getCapabilities?getCapabilities():Promise.resolve(capabilities||{
      fillLightMode:['auto','off','flash'],imageWidth:{min:320,max:4000,step:1},imageHeight:{min:240,max:3000,step:1}
    });}
    takePhoto(settings){calls.push(settings);return takePhoto?takePhoto(settings,calls.length):Promise.resolve(cameraPhotoBlob());}
  };
  return {calls,tracks};
}
async function reachPhotoFallback(a){
  await a.api.startScanner();await flushPhoto();a.api.advance(2000);
  for(let i=0;i<3;i++)await a.tick();
  await flushPhoto();
}

test('automatic still capture requires four failed fresh frames and two seconds, then keeps flash off within image bounds',async()=>{
  const a=app(),capture=installPhotoCapture(a);
  await a.api.startScanner();await flushPhoto();
  await a.tick();await a.tick();
  a.api.advance(2000);await a.tick({advance:false});
  assert.equal(capture.calls.length,0,'time alone or reprocessing a frame cannot trigger capture');
  await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,1);
  assert.equal(capture.tracks[0],a.camera.track);
  const settings=capture.calls[0];
  assert.equal(settings.fillLightMode,'off');
  assert.ok(settings.imageWidth>0&&settings.imageHeight>0);
  assert.ok(Math.max(settings.imageWidth,settings.imageHeight)<=2560);
  assert.ok(settings.imageWidth*settings.imageHeight<=5000000);
  assert.equal(a.get('scanner').open,true);
  assert.equal(a.camera.track.stopped,false);
  a.api.stopScanner();

  const early=app(),earlyCapture=installPhotoCapture(early);
  await early.api.startScanner();await flushPhoto();
  for(let i=0;i<4;i++)await early.tick();
  early.api.advance(1999);await early.tick();
  assert.equal(earlyCapture.calls.length,0,'enough frames do not bypass startup grace');
  early.api.advance(1);await early.tick();await flushPhoto();
  assert.equal(earlyCapture.calls.length,1);
  early.api.stopScanner();
});

test('pending autofocus setup prevents still capture while ordinary frames continue decoding',async()=>{
  const focus=deferred(),camera=stream({capabilities:{focusMode:['continuous']}});let frames=0;
  camera.track.applyConstraints=()=>focus.promise;
  const a=app({getUserMedia:async()=>camera,decode:async input=>{if(!(input instanceof Blob))frames++;return [];}}),capture=installPhotoCapture(a);
  await a.api.startScanner();await flushPhoto();a.api.advance(3000);
  for(let i=0;i<5;i++)await a.tick();
  assert.ok(frames>=6);
  assert.equal(capture.calls.length,0);
  focus.resolve();await flushPhoto();await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,1);
  a.api.stopScanner();
});

test('unsupported still capabilities and capability errors leave the regular scanner usable',async()=>{
  const variants=[
    {capabilities:{fillLightMode:['auto','flash'],imageWidth:{min:320,max:4000},imageHeight:{min:240,max:3000}}},
    {capabilities:{fillLightMode:['off'],imageWidth:{min:4000,max:4000},imageHeight:{min:3000,max:3000}}},
    {capabilities:{fillLightMode:['off'],imageWidth:{min:0,max:Infinity},imageHeight:{min:240,max:3000}}},
    {getCapabilities:async()=>{throw new Error('unsupported');}}
  ];
  for(const variant of variants){
    const a=app(),capture=installPhotoCapture(a,variant);await reachPhotoFallback(a);
    assert.equal(capture.calls.length,0);
    assert.equal(a.get('scanner').open,true);
    a.api.setDecoder(async()=>code('P009002'));await a.tick();await a.tick();
    assert.equal(a.api.history()[0].code,'P009002');
  }
});

test('still confirmation requires two separate captures and is not combined with a live candidate',async()=>{
  let liveReads=0;const photos=[];
  const a=app({decode:async input=>{
    if(input instanceof Blob){photos.push(input);return code('P009002');}
    return ++liveReads===1?code('P009002'):[];
  }}),capture=installPhotoCapture(a);
  await a.api.startScanner();await flushPhoto();a.api.advance(2000);
  for(let i=0;i<4;i++)await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,1);
  assert.equal(photos.length,1);
  assert.equal(a.api.history().length,0,'one live image and one still image are not independent still confirmation');
  a.api.advance(1499);await a.tick();assert.equal(capture.calls.length,1);
  a.api.advance(1);await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,2);
  assert.equal(photos.length,2);
  assert.notEqual(photos[0],photos[1]);
  assert.equal(a.api.history().length,1);
  assert.equal(a.api.history()[0].code,'P009002');
  assert.equal(a.requests.length,1);
  assert.equal(a.camera.track.stopped,true);
  assert.equal(a.get('scanner').open,false);
  assert.equal(a.timers.size,0);
});

test('expired still candidates require two new captures before registering',async()=>{
  const a=app({decode:async input=>input instanceof Blob?code('P009002'):[]}),capture=installPhotoCapture(a);
  await reachPhotoFallback(a);assert.equal(capture.calls.length,1);
  a.api.advance(10000);await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,2);
  assert.equal(a.api.history().length,0);
  a.api.advance(1500);await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,3);
  assert.equal(a.api.history()[0].code,'P009002');
});

test('pending still capture and decode never stack another capture and cooldown begins after completion',async()=>{
  const capturePending=deferred(),decodePending=deferred();let photoReads=0,frameReads=0;
  const a=app({decode:input=>{
    if(input instanceof Blob){photoReads++;return decodePending.promise;}
    frameReads++;return Promise.resolve([]);
  }}),capture=installPhotoCapture(a,{takePhoto:(_,call)=>call===1?capturePending.promise:Promise.resolve(cameraPhotoBlob())});
  await reachPhotoFallback(a);assert.equal(capture.calls.length,1);
  a.api.advance(2000);for(let i=0;i<3;i++)await a.tick();
  assert.equal(capture.calls.length,1);
  assert.ok(frameReads>=7,'video frames continue while hardware capture is pending');
  capturePending.resolve(cameraPhotoBlob());await flushPhoto();assert.equal(photoReads,1);
  // A queued video decode can wait behind the still decoder; invoke without awaiting it.
  const decoding=a.tick();await flushPhoto();a.api.advance(2000);
  assert.equal(capture.calls.length,1);
  decodePending.resolve([]);await decoding;await flushPhoto();
  assert.equal(capture.calls.length,1);
  a.api.advance(1499);await a.tick();assert.equal(capture.calls.length,1);
  a.api.advance(1);await a.tick();await flushPhoto();assert.equal(capture.calls.length,2);
  a.api.stopScanner();
});

test('unreadable still images have a strict session attempt limit while video scanning continues',async()=>{
  const a=app(),capture=installPhotoCapture(a);await reachPhotoFallback(a);
  for(let i=0;i<6;i++){a.api.advance(1500);await a.tick();await flushPhoto();}
  assert.equal(capture.calls.length,3);
  assert.equal(a.get('scanner').open,true);
  assert.equal(a.camera.track.stopped,false);
  a.api.setDecoder(async()=>code('P009002'));await a.tick();await a.tick();
  assert.equal(a.api.history()[0].code,'P009002');
});

test('optional still capture errors disable that path without counting as live decoder errors',async()=>{
  const a=app(),capture=installPhotoCapture(a,{takePhoto:async()=>{throw new Error('camera busy');}});
  await reachPhotoFallback(a);
  for(let i=0;i<4;i++){a.api.advance(2000);await a.tick();}
  assert.equal(capture.calls.length,1);
  assert.equal(a.get('scanner').open,true);
  assert.equal(a.api.session().errors,0);
  a.api.setDecoder(async()=>code('P009002'));await a.tick();await a.tick();
  assert.equal(a.api.history()[0].code,'P009002');
});

test('a hung still capture times out without stacking another request or accepting its late result',async()=>{
  const pending=deferred();let photoReads=0;
  const a=app({decode:async input=>{if(input instanceof Blob)photoReads++;return [];} }),capture=installPhotoCapture(a,{takePhoto:()=>pending.promise});
  await reachPhotoFallback(a);
  const timeout=[...a.timers].find(([,timer])=>timer.ms===5000);
  assert.ok(timeout,'still capture has a bounded timeout');
  a.timers.delete(timeout[0]);a.api.advance(5000);timeout[1].fn();await flushPhoto();
  for(let i=0;i<3;i++){a.api.advance(2000);await a.tick();}
  assert.equal(capture.calls.length,1);
  assert.equal(a.get('scanner').open,true);
  pending.resolve(cameraPhotoBlob());await flushPhoto();
  assert.equal(photoReads,0);
  assert.equal(a.api.history().length,0);
  a.api.setDecoder(async()=>code('P009002'));await a.tick();await a.tick();
  assert.equal(a.api.history()[0].code,'P009002');
});

test('stopping during still capture releases resources and late capture cannot interfere with a new session',async()=>{
  const pending=deferred();let photoReads=0;
  const a=app({decode:async input=>{if(input instanceof Blob)photoReads++;return [];}});
  const capture=installPhotoCapture(a,{takePhoto:()=>pending.promise});await reachPhotoFallback(a);
  assert.equal(capture.calls.length,1);a.api.stopScanner();
  assert.equal(a.timers.size,0);
  assert.equal(a.camera.track.stopped,true);
  const next=stream();a.api.setMedia(async()=>next);
  await a.api.startScanner();await flushPhoto();
  pending.resolve(cameraPhotoBlob());await flushPhoto();
  assert.equal(photoReads,0);
  assert.equal(a.api.history().length,0);
  assert.equal(a.get('scanner').open,true);
  assert.equal(next.track.stopped,false);
  a.api.stopScanner();assert.equal(a.timers.size,0);
});

test('stopping during still decoding ignores a matching confirmation result',async()=>{
  const pending=deferred();let photoReads=0;
  const a=app({decode:input=>input instanceof Blob?(++photoReads===1?Promise.resolve(code('P009002')):pending.promise):Promise.resolve([])});
  const capture=installPhotoCapture(a);await reachPhotoFallback(a);
  a.api.advance(1500);await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,2);assert.equal(photoReads,2);
  a.api.stopScanner();pending.resolve(code('P009002'));await flushPhoto();
  assert.equal(a.api.history().length,0);
  assert.equal(a.requests.length,0);
  assert.equal(a.timers.size,0);
});

test('malformed or excessive still images are rejected before decoder allocation and do not break video scanning',async()=>{
  const blobs=[new Blob(['not an image'],{type:'image/jpeg'}),cameraPhotoBlob(5000,4000),new Blob([new Uint8Array(12*1024*1024+1)],{type:'image/jpeg'})];
  for(const blob of blobs){
    let photoReads=0;
    const a=app({decode:async input=>{if(input instanceof Blob)photoReads++;return [];}}),capture=installPhotoCapture(a,{takePhoto:async()=>blob});
    await reachPhotoFallback(a);a.api.advance(2000);await a.tick();await flushPhoto();
    assert.equal(capture.calls.length,1);
    assert.equal(photoReads,0);
    assert.equal(a.api.history().length,0);
    assert.equal(a.get('scanner').open,true);
    a.api.stopScanner();
  }
});

test('cropped passes from one still image count as one confirmation and release their bitmap',async()=>{
  const bitmaps=[];
  const a=app({decode:async input=>!(input instanceof Blob)&&input.width===1920?code('P009002'):[]}),capture=installPhotoCapture(a);
  a.sandbox.createImageBitmap=async()=>{const bitmap={width:1920,height:1080,closed:false,close(){this.closed=true;}};bitmaps.push(bitmap);return bitmap;};
  await reachPhotoFallback(a);
  assert.equal(capture.calls.length,1);
  assert.equal(bitmaps.length,1);
  assert.equal(bitmaps[0].closed,true);
  assert.equal(a.api.history().length,0);
  a.api.advance(1500);await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,2);
  assert.equal(bitmaps.length,2);
  assert.equal(bitmaps.every(bitmap=>bitmap.closed),true);
  assert.equal(a.api.history()[0].code,'P009002');
});

test('transient capture mute is tolerated and unmuting prevents an obsolete camera-stop timer',async()=>{
  const pending=deferred(),a=app();installPhotoCapture(a,{takePhoto:()=>pending.promise});
  await reachPhotoFallback(a);
  a.camera.track.muted=true;a.camera.listeners.mute();
  assert.equal([...a.timers.values()].some(timer=>timer.ms===3000),false);
  a.api.advance(3000);
  assert.equal(a.get('scanner').open,true);
  a.camera.track.muted=false;a.camera.listeners.unmute();
  pending.resolve(cameraPhotoBlob());await flushPhoto();
  assert.equal([...a.timers.values()].some(timer=>timer.ms===3000),false);
  assert.equal(a.get('scanner').open,true);
  a.api.setDecoder(async()=>code('P009002'));await a.tick();await a.tick();
  assert.equal(a.api.history()[0].code,'P009002');
});

test('permanent capture mute still stops the scanner after the bounded capture grace and normal watchdog',async()=>{
  const pending=deferred(),a=app();installPhotoCapture(a,{takePhoto:()=>pending.promise});
  await reachPhotoFallback(a);
  a.camera.track.muted=true;a.camera.listeners.mute();
  const timeout=[...a.timers].find(([,timer])=>timer.ms===5000);assert.ok(timeout);
  a.timers.delete(timeout[0]);a.api.advance(5000);timeout[1].fn();await flushPhoto();
  const muteTimeout=[...a.timers].find(([,timer])=>timer.ms===3000);assert.ok(muteTimeout);
  a.timers.delete(muteTimeout[0]);a.api.advance(3000);muteTimeout[1].fn();await flushPhoto();
  assert.equal(a.get('scanner').open,false);
  assert.equal(a.camera.track.stopped,true);
  assert.equal(a.api.history().length,0);
  assert.equal(a.timers.size,0);
  pending.resolve(cameraPhotoBlob());await flushPhoto();
  assert.equal(a.get('scanner').open,false);
  assert.equal(a.api.history().length,0);
});

test('still decoder failure disables only still capture and regular frames can subsequently succeed',async()=>{
  const a=app({decode:async input=>{if(input instanceof Blob)throw new Error('bad still image');return [];}}),capture=installPhotoCapture(a);
  await reachPhotoFallback(a);a.api.advance(2000);await a.tick();await flushPhoto();
  assert.equal(capture.calls.length,1);
  assert.equal(a.api.session().errors,0);
  assert.equal(a.get('scanner').open,true);
  a.api.setDecoder(async()=>code('P009002'));await a.tick();await a.tick();
  assert.equal(a.api.history()[0].code,'P009002');
});

// Camera acquisition and frame-processing regressions shared by customer and staff scanners.
test('camera requests sensor-oriented rear video independent of viewport orientation',async()=>{
  for(const portrait of [true,false]){
    const requests=[];
    const a=app({getUserMedia:async constraints=>{requests.push(constraints);return a.camera;}});
    a.sandbox.window.innerWidth=portrait?390:844;
    a.sandbox.window.innerHeight=portrait?844:390;
    await a.api.startScanner();await flush();
    const request=requests[0];
    assert.equal(request.audio,false);
    assert.equal(request.video.facingMode.ideal,'environment');
    assert.equal(request.video.width.ideal,1920);
    assert.equal(request.video.height.ideal,1080);
    assert.equal(request.video.frameRate.ideal,30);
    a.api.stopScanner();
  }
});

test('unsupported acquisition constraints retry once with basic rear-camera settings',async()=>{
  const requests=[];
  const a=app({getUserMedia:async constraints=>{
    requests.push(constraints);
    if(requests.length===1)throw Object.assign(new Error('unsupported resolution'),{name:'OverconstrainedError'});
    return a.camera;
  }});
  await a.api.startScanner();await flush();
  assert.equal(requests.length,2);
  assert.equal(requests[1].audio,false);
  assert.equal(requests[1].video.facingMode.ideal,'environment');
  for(const key of ['width','height','frameRate'])assert.equal(requests[1].video[key],undefined,key);
  assert.equal(a.get('scanner').open,true);
  assert.ok(a.frameReads.length>0,'basic camera fallback still scans');
  a.api.stopScanner();
});

test('permission and camera-busy errors do not repeat the camera request',async()=>{
  for(const name of ['NotAllowedError','SecurityError','NotReadableError']){
    let requests=0;
    const a=app({getUserMedia:async()=>{requests++;throw Object.assign(new Error(name),{name});}});
    await a.api.startScanner();await flush();
    assert.equal(requests,1,name);
    assert.equal(a.api.session(),null,name);
    assert.equal(a.get('scanner').open,false,name);
  }
});

test('closing during acquisition failure suppresses an obsolete fallback request',async()=>{
  const pending=deferred();let requests=0;
  const a=app({getUserMedia:()=>{requests++;return pending.promise;}});
  const opening=a.api.startScanner();
  a.api.stopScanner();
  pending.reject(Object.assign(new Error('unsupported resolution'),{name:'OverconstrainedError'}));
  await opening;await flush();
  assert.equal(requests,1);
  assert.equal(a.api.session(),null);
  assert.equal(a.get('scanner').open,false);
});

test('continuous focus and exposure are independent optional improvements',async()=>{
  const a=app(),calls=[];
  a.camera.track.getCapabilities=()=>({focusMode:['manual','continuous'],exposureMode:['continuous']});
  a.camera.track.applyConstraints=async value=>{
    calls.push(value);
    if(value.advanced?.some(option=>option.focusMode))throw new Error('focus unsupported by driver');
  };
  await a.api.startScanner();await flush();
  assert.ok(calls.some(value=>value.advanced?.some(option=>option.focusMode==='continuous')));
  assert.ok(calls.some(value=>value.advanced?.some(option=>option.exposureMode==='continuous')));
  assert.ok(calls.every(value=>!value.advanced?.some(option=>option.focusMode&&option.exposureMode)),'one failure cannot discard both modes');
  assert.equal(a.get('scanner').open,true);
  assert.ok(a.frameReads.length>0);
  a.api.stopScanner();
});

test('missing or failing capability and constraint APIs leave basic scanning usable',async()=>{
  for(const failing of ['capabilities','constraints','missing methods']){
    const a=app({decode:async()=>code('P009000')});
    if(failing==='capabilities')a.camera.track.getCapabilities=()=>{throw new Error('driver capabilities unavailable');};
    if(failing==='constraints'){
      a.camera.track.getCapabilities=()=>({focusMode:['continuous'],exposureMode:['continuous']});
      a.camera.track.getConstraints=()=>{throw new Error('driver constraints unavailable');};
    }
    if(failing==='missing methods'){
      delete a.camera.track.getCapabilities;delete a.camera.track.getConstraints;delete a.camera.track.applyConstraints;
    }
    await a.api.startScanner();await flush();
    assert.equal(a.get('scanner').open,true,failing);
    await a.tick();
    assert.equal(a.api.history()[0]?.code,'P009000',failing);
  }
});

test('ending the track during pending focus setup cannot restart its scanner',async()=>{
  const pending=deferred(),a=app();
  a.camera.track.getCapabilities=()=>({focusMode:['continuous'],exposureMode:['continuous']});
  a.camera.track.applyConstraints=()=>pending.promise;
  const opening=a.api.startScanner();await flush();
  assert.equal(a.get('scanner').open,true);
  assert.ok(a.frameReads.length>0,'optional focus setup cannot block basic decoding');
  a.camera.listeners.ended();
  const frameCount=a.frameReads.length;
  pending.resolve();await opening;await flush();
  assert.equal(a.camera.track.stopped,true);
  assert.equal(a.api.session(),null);
  assert.equal(a.get('scanner').open,false);
  assert.equal(a.frameReads.length,frameCount);
  assert.equal(a.timers.size,0);
});

test('brief track mute recovers without stopping and clears its obsolete timeout',async()=>{
  const a=app();await a.api.startScanner();await flush();
  a.camera.listeners.mute();
  const muteTimer=[...a.timers].find(([,timer])=>timer.ms===3000);
  assert.ok(muteTimer);
  assert.equal(a.camera.track.stopped,false);
  a.camera.listeners.unmute();
  assert.equal(a.timers.has(muteTimer[0]),false);
  assert.equal(a.get('scanner').open,true);
  await a.tick();
  assert.equal(a.camera.track.stopped,false);
  a.api.stopScanner();
});

test('a frozen video frame cannot confirm the same barcode twice',async()=>{
  let decoded=0;
  const a=app({decode:async()=>{decoded++;return code('P009000');}});
  await a.api.startScanner();await flush();
  for(let i=0;i<3;i++)await a.tick({advance:false});
  assert.equal(decoded,1);
  assert.equal(a.api.history().length,0);
  assert.equal(a.get('scanner').open,true);
  await a.tick();
  assert.equal(decoded,2);
  assert.equal(a.api.history()[0]?.code,'P009000');
});

test('slow phones can confirm a matching new frame after three seconds',async()=>{
  const a=app({decode:async()=>code('P009000')});
  await a.api.startScanner();await flush();
  a.api.advance(3200);await a.tick();
  assert.equal(a.api.history()[0]?.code,'P009000');
});

test('expired candidates still require a second fresh matching frame',async()=>{
  const a=app({decode:async()=>code('P009000')});
  await a.api.startScanner();await flush();
  a.api.advance(6000);await a.tick();
  assert.equal(a.api.history().length,0);
  await a.tick();assert.equal(a.api.history()[0]?.code,'P009000');
});

test('native central strips and full frames retain original and normalized passes within the pixel budget',async()=>{
  for(const [width,height] of [[3840,2160],[2160,3840],[7680,4320]]){
    const decoded=[];
    const a=app({decode:async(frame,options)=>{decoded.push({width:frame.width,height:frame.height,pixel:[...frame.data.slice(0,3)],options});return [];}});
    a.get('cameraVideo').videoWidth=width;a.get('cameraVideo').videoHeight=height;
    await a.api.startScanner();await flush();
    for(let i=0;i<3;i++)await a.tick();
    assert.equal(decoded.length,4);
    for(let index=0;index<4;index++){
      const draw=a.canvasDraws[index].args,frame=decoded[index];
      const [,sx,sy,sw,sh,,,cw,ch]=draw;
      assert.ok(frame.width*frame.height<=1200000,'each pass respects the memory and CPU budget');
      assert.equal(frame.options.tryDownscale,false,'preserved barcode detail is not downscaled inside the reader');
      if(index<2){
        assert.equal(cw,sw,'central strip keeps original horizontal pixels');
        assert.equal(ch,sh,'central strip keeps original vertical pixels');
        assert.ok(Math.abs(sx+sw/2-width/2)<=1,'strip is horizontally centered');
        assert.ok(Math.abs(sy+sh/2-height/2)<=1,'strip is vertically centered');
        assert.ok(sw<=3840);assert.ok(sh<height);
      }else{
        assert.equal(sx,0);assert.equal(sy,0);
        assert.equal(sw,width);assert.equal(sh,height,'full-frame pass covers labels outside the center');
        assert.ok(Math.max(cw,ch)<=1920);
      }
    }
    assert.deepEqual(decoded[0].pixel,[90,120,150]);
    assert.notDeepEqual(decoded[1].pixel,decoded[0].pixel);
    assert.deepEqual(decoded[2].pixel,decoded[0].pixel,'full frame retains an unmodified decode attempt');
    assert.deepEqual(decoded[3].pixel,decoded[1].pixel);
    assert.ok(decoded[0].width>1920,'high-resolution narrow bars are preserved');
    a.api.stopScanner();
  }
});

test('the visible guide stays inside the native decoded strip in portrait and landscape views',async()=>{
  for(const [width,height,vw,vh] of [[3840,2160,390,560],[2160,3840,390,560],[7680,4320,800,350]]){
    const a=app(),view=a.get('cameraView');
    Object.defineProperties(view,{clientWidth:{value:vw},clientHeight:{value:vh}});
    a.get('cameraVideo').videoWidth=width;a.get('cameraVideo').videoHeight=height;
    await a.api.startScanner();await flush();
    const [,sx,sy,sw,sh]=a.canvasDraws[0].args;
    const scale=Math.min(vw/width,vh/height);
    const cropLeft=(vw-width*scale)/2+sx*scale,cropTop=(vh-height*scale)/2+sy*scale;
    const guide=a.get('cameraGuide').style;
    const left=parseFloat(guide.left),top=parseFloat(guide.top),gw=parseFloat(guide.width),gh=parseFloat(guide.height);
    assert.ok(gw>0&&gh>0,'guide has a visible area');
    assert.ok(left>=cropLeft&&top>=cropTop,'guide begins inside decoded pixels');
    assert.ok(left+gw<=cropLeft+sw*scale&&top+gh<=cropTop+sh*scale,'guide stays inside decoded pixels');
    assert.ok(Math.abs(left+gw/2-(cropLeft+sw*scale/2))<.01);
    assert.ok(Math.abs(top+gh/2-(cropTop+sh*scale/2))<.01);
    a.api.stopScanner();
  }
});

test('video frame callbacks prevent duplicate-frame confirmation and are cancelled on stop',async()=>{
  const callbacks=new Map();let id=0,decoded=0;
  const a=app({decode:async()=>{decoded++;return code('P009000');}}),video=a.get('cameraVideo');
  video.requestVideoFrameCallback=fn=>{callbacks.set(++id,fn);return id;};
  video.cancelVideoFrameCallback=key=>callbacks.delete(key);
  const present=()=>{
    const next=[...callbacks][0];assert.ok(next);callbacks.delete(next[0]);next[1](0,{presentedFrames:id});
  };
  await a.api.startScanner();await flush();
  assert.equal(decoded,0,'wait for the first presented frame');
  present();await a.tick();assert.equal(decoded,1);
  await a.tick();assert.equal(decoded,1,'changing video time alone does not mean a new presented frame');
  assert.equal(a.api.history().length,0);
  const obsolete=[...callbacks.values()][0];
  present();await a.tick();
  assert.equal(a.api.history()[0]?.code,'P009000');
  assert.equal(callbacks.size,0);
  obsolete();assert.equal(callbacks.size,0,'late callbacks cannot resubscribe after stopping');
});


test('automatic scanning exposes no camera controls and never changes zoom, light or camera selection',async()=>{
  for(const id of ['cameraControls','cameraZoomControl','cameraZoom','cameraZoomLabel','cameraTorch','switchCamera']){
    assert.ok(!new RegExp('\\bid="'+id+'"').test(html),'removed camera control: '+id);
  }
  const requests=[];let enumerations=0;
  const a=app({getUserMedia:async value=>{requests.push(value);return a.camera;},decode:async()=>code('P009000')});
  a.camera.track.getCapabilities=()=>({focusMode:['continuous'],exposureMode:['continuous'],zoom:{min:1,max:8,step:.1},torch:true});
  a.sandbox.navigator.mediaDevices.enumerateDevices=async()=>{enumerations++;return [{kind:'videoinput',deviceId:'rear-other'}];};
  await a.api.startScanner();await flush();await a.tick();
  assert.equal(a.api.history()[0]?.code,'P009000','automatic recognition needs no camera controls');
  assert.equal(enumerations,0);
  assert.equal(requests.length,1);
  assert.equal(requests[0].video.deviceId,undefined);
  assert.equal(requests[0].video.facingMode.ideal,'environment');
  for(const applied of a.camera.constraints){
    for(const value of [applied,...(applied.advanced||[])]){
      for(const key of ['zoom','torch','deviceId'])assert.equal(value[key],undefined,key+' must not be changed');
    }
  }
});

test('automatic camera setup leaves manual-only focus and exposure modes untouched',async()=>{
  const a=app();
  a.camera.track.getCapabilities=()=>({focusMode:['manual'],exposureMode:['manual'],focusDistance:{min:0,max:100},zoom:{min:1,max:8},torch:true});
  await a.api.startScanner();await flush();
  assert.equal(a.camera.constraints.length,0,'unsupported continuous modes do not force manual camera settings');
  assert.ok(a.frameReads.length>0);
  assert.equal(a.get('scanner').open,true);
  a.api.stopScanner();
});

test('continuous autofocus remains preferred when one-shot focus is also available',async()=>{
  const a=app();
  a.camera.track.getCapabilities=()=>({focusMode:['manual','single-shot','continuous'],exposureMode:['continuous']});
  a.sandbox.navigator.mediaDevices.getSupportedConstraints=()=>({pointsOfInterest:true});
  await a.api.startScanner();await flush();
  const added=a.camera.constraints.map(value=>value.advanced.at(-1));
  assert.equal(added[0].focusMode,'continuous');
  assert.equal(added.some(value=>value.focusMode==='single-shot'),false,'working continuous autofocus is never replaced by a one-shot sweep');
  assert.deepEqual(JSON.parse(JSON.stringify(added.find(value=>value.pointsOfInterest).pointsOfInterest)),[{x:.5,y:.5}]);
  assert.equal(a.camera.track.getSettings().focusMode,'continuous');
  assert.equal(a.camera.track.getSettings().exposureMode,'continuous');
  a.api.stopScanner();
});

test('supported one-shot autofocus runs once after exposure and center setup when continuous focus is unavailable',async()=>{
  for(const unavailable of ['unsupported','rejected']){
    const a=app(),calls=[];
    a.camera.track.getCapabilities=()=>({focusMode:unavailable==='unsupported'?['manual','single-shot']:['manual','continuous','single-shot'],exposureMode:['continuous']});
    a.sandbox.navigator.mediaDevices.getSupportedConstraints=()=>({pointsOfInterest:true});
    const apply=a.camera.track.applyConstraints;
    a.camera.track.applyConstraints=async value=>{
      calls.push(value);
      if(unavailable==='rejected'&&value.advanced.at(-1).focusMode==='continuous')throw new Error('driver rejected continuous autofocus');
      await apply(value);
    };
    await a.api.startScanner();await flush();
    const added=calls.map(value=>value.advanced.at(-1));
    const expected=unavailable==='unsupported'?['exposureMode','pointsOfInterest','focusMode']:['focusMode','exposureMode','pointsOfInterest','focusMode'];
    assert.deepEqual(added.map(value=>Object.keys(value)[0]),expected,unavailable);
    assert.equal(added.at(-1).focusMode,'single-shot',unavailable+' focuses only after the target and exposure have been selected');
    assert.equal(calls.filter(value=>value.advanced.some(option=>option.focusMode==='single-shot')).length,1,unavailable+' does not retrigger a single sweep through later constraints');
    const final=Object.assign({},...calls.at(-1).advanced);
    assert.equal(final.focusMode,'single-shot',unavailable);
    assert.equal(final.exposureMode,'continuous',unavailable);
    assert.deepEqual(JSON.parse(JSON.stringify(final.pointsOfInterest)),[{x:.5,y:.5}],unavailable);
    for(const value of calls){
      assert.equal(value.width?.ideal,1920,unavailable+' preserves the requested capture width');
      assert.equal(value.height?.ideal,1080,unavailable+' preserves the requested capture height');
    }
    const count=calls.length;
    await a.tick();await a.tick();
    assert.equal(calls.length,count,unavailable+' does not hunt focus on every frame');
    assert.equal(a.get('scanner').open,true);
    a.api.stopScanner();
  }
});

test('incomplete or stale autofocus settings reports do not replace an accepted continuous focus request',async()=>{
  for(const unavailable of ['missing','throws','no focusMode','stale manual mode']){
    const a=app();
    a.camera.track.getCapabilities=()=>({focusMode:['continuous','single-shot'],exposureMode:['continuous']});
    if(unavailable==='missing')delete a.camera.track.getSettings;
    if(unavailable==='throws')a.camera.track.getSettings=()=>{throw new Error('settings unavailable');};
    if(unavailable==='no focusMode')a.camera.track.getSettings=()=>({facingMode:'environment'});
    if(unavailable==='stale manual mode')a.camera.track.getSettings=()=>({facingMode:'environment',focusMode:'manual'});
    await a.api.startScanner();await flush();
    assert.equal(a.camera.constraints[0].advanced.at(-1).focusMode,'continuous',unavailable);
    assert.equal(a.camera.constraints.some(value=>value.advanced.some(option=>option.focusMode==='single-shot')),false,unavailable+' is not evidence of rejected autofocus');
    assert.equal(a.get('scanner').open,true,unavailable);
    assert.ok(a.frameReads.length>0,unavailable);
    a.api.stopScanner();
  }
});

test('center focus is skipped unless the browser explicitly advertises points of interest',async()=>{
  for(const support of ['missing','false','absent','throws','truthy']){
    const a=app();
    a.camera.track.getCapabilities=()=>({focusMode:['continuous'],exposureMode:['continuous']});
    if(support!=='missing')a.sandbox.navigator.mediaDevices.getSupportedConstraints=()=>{
      if(support==='throws')throw new Error('constraint support unavailable');
      return support==='absent'?{}:{pointsOfInterest:support==='truthy'?1:false};
    };
    await a.api.startScanner();await flush();
    assert.equal(a.camera.constraints.length,2,support+' preserves ordinary focus and exposure setup');
    assert.equal(a.camera.constraints.some(value=>value.advanced.some(option=>option.pointsOfInterest)),false,support);
    assert.ok(a.frameReads.length>0,support);
    a.api.stopScanner();
  }
});

test('center focus is skipped when neither automatic focus mode is usable',async()=>{
  for(const focus of ['manual only','unknown capabilities','continuous rejected']){
    const a=app(),calls=[];
    a.camera.track.getCapabilities=()=>({focusMode:focus==='manual only'?['manual']:focus==='continuous rejected'?['continuous']:undefined,exposureMode:['continuous']});
    a.sandbox.navigator.mediaDevices.getSupportedConstraints=()=>({pointsOfInterest:true});
    const apply=a.camera.track.applyConstraints;
    a.camera.track.applyConstraints=async value=>{
      calls.push(value);
      if(value.advanced.at(-1).focusMode)throw new Error('autofocus unavailable');
      await apply(value);
    };
    await a.api.startScanner();await flush();
    assert.equal(calls.some(value=>value.advanced.some(option=>option.pointsOfInterest)),false,focus);
    assert.equal(a.camera.track.getSettings().exposureMode,'continuous',focus+' does not suppress exposure');
    assert.ok(a.frameReads.length>0,focus);
    a.api.stopScanner();
  }
});

test('rejected center focus cannot discard autofocus, exposure or barcode recognition',async()=>{
  for(const focusMode of ['continuous','single-shot']){
    const a=app({decode:async()=>code('P009000')}),calls=[];
    a.camera.track.getCapabilities=()=>({focusMode:[focusMode],exposureMode:['continuous']});
    a.sandbox.navigator.mediaDevices.getSupportedConstraints=()=>({pointsOfInterest:true});
    const apply=a.camera.track.applyConstraints;
    a.camera.track.applyConstraints=async value=>{
      calls.push(value);
      if(value.advanced.at(-1).pointsOfInterest)throw new Error('driver rejected focus point');
      await apply(value);
    };
    await a.api.startScanner();await flush();
    assert.equal(calls.filter(value=>value.advanced.at(-1).pointsOfInterest).length,1,focusMode);
    assert.equal(a.camera.track.getSettings().focusMode,focusMode);
    assert.equal(a.camera.track.getSettings().exposureMode,'continuous',focusMode);
    assert.equal(a.camera.track.getSettings().pointsOfInterest,undefined,focusMode+' does not reapply rejected focus points');
    if(focusMode==='single-shot')assert.equal(calls.at(-1).advanced.at(-1).focusMode,'single-shot','the one-shot sweep is still attempted after rejected points');
    await a.tick();
    assert.equal(a.api.history()[0]?.code,'P009000',focusMode);
  }
});

test('a late center focus completion cannot trigger a one-shot sweep on an obsolete session',async()=>{
  const pending=deferred(),a=app(),calls=[];
  a.camera.track.getCapabilities=()=>({focusMode:['single-shot'],exposureMode:['continuous']});
  a.sandbox.navigator.mediaDevices.getSupportedConstraints=()=>({pointsOfInterest:true});
  const apply=a.camera.track.applyConstraints;
  a.camera.track.applyConstraints=async value=>{
    calls.push(value);
    if(value.advanced.at(-1).pointsOfInterest)await pending.promise;
    await apply(value);
  };
  await a.api.startScanner();await flush();
  assert.ok(calls.some(value=>value.advanced.at(-1).pointsOfInterest),'center setup is pending');
  assert.ok(a.frameReads.length>0,'optional center setup does not block barcode decoding');
  a.api.stopScanner();
  const next=stream();a.api.setMedia(async()=>next);
  await a.api.startScanner();await flush();
  const current=a.api.session();
  pending.resolve();await flush();
  assert.equal(calls.some(value=>value.advanced.some(option=>option.focusMode==='single-shot')),false,'stopped camera never receives a late focus trigger');
  assert.equal(a.api.session(),current);
  assert.equal(next.track.stopped,false);
  assert.equal(next.constraints.length,0,'obsolete setup does not alter a newer camera');
  assert.equal(a.get('scanner').open,true);
  a.api.stopScanner();
});

test('late automatic focus completion cannot configure or disturb a newer camera session',async()=>{
  const pending=deferred(),a=app(),oldCalls=[];
  const capabilities={focusMode:['continuous'],exposureMode:['continuous']};
  a.camera.track.getCapabilities=()=>capabilities;
  a.camera.track.applyConstraints=value=>{oldCalls.push(value);return pending.promise;};
  await a.api.startScanner();await flush();
  a.api.stopScanner();
  const next=stream({capabilities});a.api.setMedia(async()=>next);
  await a.api.startScanner();await flush();
  const nextSession=a.api.session(),newCalls=next.constraints.length;
  pending.resolve();await flush();
  assert.equal(oldCalls.length,1,'obsolete setup never proceeds from focus to exposure');
  assert.equal(next.constraints.length,newCalls);
  assert.equal(a.api.session(),nextSession);
  assert.equal(next.track.stopped,false);
  assert.equal(a.get('scanner').open,true);
  a.api.stopScanner();
});

test('automatic focus and exposure preserve capture quality despite incomplete constraint reports',async()=>{
  for(const reported of ['missing method','complete','advanced only']){
    const a=app();
    a.camera.track.getCapabilities=()=>({focusMode:['continuous'],exposureMode:['continuous']});
    if(reported!=='missing method')a.camera.track.getConstraints=()=>{
      const applied=a.camera.constraints.at(-1);
      if(applied)return reported==='advanced only'?{advanced:applied.advanced}:applied;
      return {facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30}};
    };
    await a.api.startScanner();await flush();
    assert.equal(a.camera.constraints.length,2,reported);
    for(const applied of a.camera.constraints){
      assert.equal(applied.width?.ideal,1920,reported+' capture width');
      assert.equal(applied.height?.ideal,1080,reported+' capture height');
      assert.equal(applied.frameRate?.ideal,30,reported+' capture frame rate');
    }
    const values=Object.assign({},...a.camera.constraints.at(-1).advanced);
    assert.equal(values.focusMode,'continuous',reported);
    assert.equal(values.exposureMode,'continuous',reported);
    a.api.stopScanner();
  }
});

test('automatic focus does not restore acquisition constraints rejected during camera fallback',async()=>{
  let requests=0;
  const a=app({getUserMedia:async()=>{
    if(++requests===1)throw Object.assign(new Error('resolution unsupported'),{name:'OverconstrainedError'});
    return a.camera;
  }});
  a.camera.track.getCapabilities=()=>({focusMode:['continuous'],exposureMode:['continuous']});
  await a.api.startScanner();await flush();
  assert.equal(requests,2);
  assert.equal(a.camera.constraints.length,2);
  for(const applied of a.camera.constraints){
    for(const key of ['width','height','frameRate'])assert.equal(applied[key],undefined,'rejected '+key+' is not reapplied');
    assert.equal(applied.facingMode.ideal,'environment');
  }
  assert.ok(a.frameReads.length>0);
  a.api.stopScanner();
});

test('automatic contrast keeps bright and dark barcode bars distinct and expands low contrast',()=>{
  const a=app();
  for(const [dark,light] of [[130,140],[210,235],[20,40]]){
    const data=new Uint8ClampedArray(400);
    for(let pixel=0;pixel<100;pixel++){
      const gray=pixel<50?dark:light;
      data.set([gray,gray,gray,255],pixel*4);
    }
    const enhanced=a.api.enhanceContrast({data,width:100,height:1});
    const darkResult=enhanced.data[0],lightResult=enhanced.data[50*4];
    assert.ok(lightResult>darkResult,`${dark}/${light}: enhancement retains distinct bars and background`);
    assert.ok(lightResult-darkResult>light-dark,`${dark}/${light}: contrast improves without clipping both tones together`);
    for(let pixel=0;pixel<100;pixel++)assert.equal(enhanced.data[pixel*4+3],255,'alpha retained');
  }
});

test('automatic contrast does not amplify a flat frame or low-level sensor noise',()=>{
  const a=app();
  for(const range of [0,6]){
    const data=new Uint8ClampedArray(400);
    for(let pixel=0;pixel<100;pixel++){
      const gray=127+(range?pixel%(range+1):0);
      data.set([gray,gray,gray,255],pixel*4);
    }
    const original=[...data];
    const enhanced=a.api.enhanceContrast({data,width:100,height:1});
    assert.deepEqual([...enhanced.data],original,'flat or noisy frames remain unchanged');
  }
});
