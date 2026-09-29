const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require('playwright');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
let server,url;
before(async()=>{
  server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));});
const memo='引き合い情報です。動作確認済みです。仕様書があります。\n'.repeat(12);
const stock={name:'テスト機械',model_type:'V33i',current_price:16500000,internal_price:18500000,external_price:0,price_memo:memo,memo};
async function fixture(browser,{count=12,expiry=60000}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
  await context.addInitScript(({count,expiry,stock})=>{
    localStorage.setItem('kkmt_barcode_auth',JSON.stringify({token:'test-only',expires_at:new Date(Date.now()+expiry).toISOString()}));
    localStorage.setItem('kkmt_barcode_history',JSON.stringify(Array.from({length:count},(_,i)=>({code:'P'+String(9000+i).padStart(6,'0'),fmt:'手入力',stock}))));
  },{count,expiry,stock});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // 社員APIや認証サイトへは接続せず、テストデータだけを返す。
  await page.route('https://www.kkmt.co.jp/**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(stock)}));
  await page.goto(url);
  await page.waitForFunction(()=>document.querySelector('#scanButtonLabel').textContent==='スキャン');
  await page.waitForFunction(()=>!document.querySelector('.stock-state'));
  return {context,page,errors};
}
for(const [name,type] of Object.entries({chromium,webkit})){
  test(`${name}: lower-card details keep scroll, focus and memo layout`,async()=>{
    const browser=await type.launch({headless:true});
    try{
      const {context,page,errors}=await fixture(browser);
      const row=page.locator('.row').nth(7),toggle=row.locator('.detail-toggle');
      await toggle.scrollIntoViewIfNeeded();
      await page.evaluate(()=>{document.querySelectorAll('.row')[7].dataset.identity='preserved';});
      const before=await toggle.boundingBox();const y=await page.evaluate(()=>window.scrollY);
      await toggle.click();
      await page.waitForFunction(()=>!document.querySelectorAll('.stock-details')[7].hidden);
      assert.equal(await row.getAttribute('data-identity'),'preserved');
      assert.ok(Math.abs((await toggle.boundingBox()).y-before.y)<2,'toggle stays in the same position');
      assert.ok(Math.abs((await page.evaluate(()=>window.scrollY))-y)<2,'page does not jump to the first card');
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      assert.equal(await row.locator('.memo-more:visible').count(),0);
      assert.ok((await row.locator('.stock-details').innerText()).includes(memo.trim()));
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      assert.equal(await row.locator('.memo-more:visible').count(),2);
      for(const preview of await row.locator('.memo-preview').all()){
        const layout=await preview.evaluate(el=>({height:el.clientHeight,line:parseFloat(getComputedStyle(el).lineHeight),overflow:el.scrollHeight>el.clientHeight}));
        assert.ok(layout.height<=layout.line*3+1);assert.equal(layout.overflow,true);
      }
      await page.setViewportSize({width:360,height:780});
      assert.equal(await row.getAttribute('data-identity'),'preserved');
      assert.equal(await row.locator('.memo-more:visible').count(),2);
      assert.deepEqual(errors,[]);
      await context.close();
    }finally{await browser.close();}
  });
  test(`${name}: expired login removes confidential content automatically`,async()=>{
    const browser=await type.launch({headless:true});
    try{
      const {context,page,errors}=await fixture(browser,{count:1,expiry:2500});
      assert.equal(await page.locator('.staff-prices').count(),1);
      await page.waitForFunction(()=>document.querySelector('.staff-login'),{},{timeout:7000});
      assert.equal(await page.locator('.staff-prices,.price-line').count(),0);
      assert.ok(!(await page.locator('#histList').innerText()).includes('¥16,500,000'));
      assert.deepEqual(errors,[]);await context.close();
    }finally{await browser.close();}
  });
}
