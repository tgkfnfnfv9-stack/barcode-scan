(async()=>{
  const loaderURL=(document.currentScript&&document.currentScript.src)||'https://tgkfnfnfv9-stack.github.io/barcode-scan/staff-loader.js';
  const STAFF_ORIGIN='https://www.kkmt.co.jp';

  if(location.origin!==STAFF_ORIGIN){
    alert('会社サイト（www.kkmt.co.jp）へログインしてから、もう一度「社内バーコード」をタップしてください。');
    location.href='https://www.kkmt.co.jp/staff/stocks';
    return;
  }

  try{
    const authCheck=await fetch('/staff/stocks',{credentials:'same-origin',cache:'no-store',redirect:'follow'});
    if(authCheck.url.includes('/users/sign_in')){
      alert('先に会社サイトへログインしてください。ログイン後、「社内バーコード」をもう一度タップしてください。');
      location.href='/users/sign_in';
      return;
    }

    document.body.innerHTML='<div style="font-family:system-ui,-apple-system,sans-serif;padding:32px;text-align:center;color:#333">バーコードスキャナーを起動中…</div>';

    const appURL=new URL('index.html',loaderURL);
    appURL.searchParams.set('staff','1');
    appURL.searchParams.set('v',String(Date.now()));
    const response=await fetch(appURL.href,{cache:'no-store',mode:'cors',credentials:'omit'});
    if(!response.ok) throw new Error('scanner '+response.status);

    let html=await response.text();
    if(!html.includes('id="zxwasm"') || !html.includes('async function fetchStock') || !/<\/html>\s*$/i.test(html)){
      throw new Error('scanner incomplete');
    }

    html=html.replace('<head>','<head><base href="https://tgkfnfnfv9-stack.github.io/barcode-scan/">');
    document.open('text/html','replace');
    document.write(html);
    document.close();
  }catch(error){
    document.body.innerHTML='<div style="font-family:system-ui,-apple-system,sans-serif;padding:32px;line-height:1.7;color:#B42318"><b>バーコードスキャナーを起動できませんでした。</b><br>通信を確認して、もう一度「社内バーコード」をタップしてください。</div>';
    console.error(error);
  }
})();
