(async()=>{
  const loaderURL=(document.currentScript&&document.currentScript.src)||'https://tgkfnfnfv9-stack.github.io/barcode-scan/staff-loader.js';
  const APP_URL=loaderURL.replace(/staff-loader\.js(?:[?#].*)?$/,'index.html');
  const STAFF_ORIGIN='https://www.kkmt.co.jp';

  if(location.origin!==STAFF_ORIGIN){
    alert('会社サイト（www.kkmt.co.jp）へログインしてから、もう一度「社内バーコード」をタップしてください。');
    location.href='https://www.kkmt.co.jp/staff/stocks';
    return;
  }

  try{
    const authCheck=await fetch('/staff/stocks',{credentials:'include',cache:'no-store'});
    if(authCheck.url.includes('/users/sign_in')){
      alert('先に会社サイトへログインしてください。ログイン後、「社内バーコード」をもう一度タップしてください。');
      location.href='/users/sign_in';
      return;
    }
    document.body.innerHTML='<div style="font-family:system-ui,-apple-system,sans-serif;padding:32px;text-align:center;color:#333">バーコードスキャナーを起動中…</div>';
    const response=await fetch(APP_URL,{cache:'no-store',credentials:'omit'});
    if(!response.ok) throw new Error('scanner '+response.status);
    let html=await response.text();
    html=html.replace('<head>','<head><base href="https://tgkfnfnfv9-stack.github.io/barcode-scan/">');
    document.open('text/html','replace');
    document.write(html);
    document.close();
  }catch(error){
    document.body.innerHTML='<div style="font-family:system-ui,-apple-system,sans-serif;padding:32px;line-height:1.7;color:#B42318"><b>バーコードスキャナーを起動できませんでした。</b><br>通信を確認して、もう一度ブックマークをタップしてください。</div>';
    console.error(error);
  }
})();
