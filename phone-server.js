'use strict';
// Authenticated LAN gateway. The record server remains bound to loopback.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function privateIPv4(host){return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)&&host.split('.').length===4&&host.split('.').every(n=>/^\d{1,3}$/.test(n)&&Number(n)<=255);}
const pairingPage=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vivian · 手机工作台</title><style>body{font:16px/1.8 system-ui;background:#faf4ee;color:#44323b;margin:0;padding:30px 20px}main{max-width:400px;margin:12vh auto;background:#fffdfa;padding:28px;border:1px solid #eadde1;border-radius:20px}h1{font-size:27px}p{font-size:14px;color:#8b7580}input,button{box-sizing:border-box;width:100%;border-radius:10px;padding:13px;font:inherit;margin-top:12px}input{border:1px solid #ddcbd3}button{background:#b6507e;color:white;border:0}small{display:block;color:#8b7580;margin-top:18px}</style><main><h1>Vivian 的随身工作台 ✎</h1><p>使用电脑提供的完整手机链接，即可打开同一份生活记录。</p><form id="pair"><label>访问凭证<input id="key" type="password" required autocomplete="off" placeholder="完整链接会自动填写"></label><button id="go">打开我的工作台</button></form><p id="status" role="status"></p><small>手机和电脑连接同一 Wi-Fi，电脑保持开机。</small></main><script>const input=document.getElementById('key'),status=document.getElementById('status'),button=document.getElementById('go');const token=location.hash.slice(1);if(token){input.value=token;history.replaceState(null,'','/');}async function pair(e){e?.preventDefault();button.disabled=true;status.textContent='正在连接…';try{const r=await fetch('/api/phone/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:input.value.trim()})});if(!r.ok)throw Error('凭证不正确，请重新打开电脑提供的完整链接。');location.replace('/');}catch(e){status.textContent=e.message;button.disabled=false;}}document.getElementById('pair').onsubmit=pair;if(token)pair();</script></html>`;
function createPhoneServer({host,key,upstreamPort=8777}){
  if(!(privateIPv4(host)||host==='127.0.0.1')||!/^[a-f0-9]{64}$/.test(key))throw Error('手机访问配置无效');
  const matches=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)&&crypto.timingSafeEqual(Buffer.from(value),Buffer.from(key));
  const server=http.createServer(async(req,res)=>{
    const respond=(status,text,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(text);};
    try{
      const authority=host+':'+server.address().port,origin='http://'+authority;
      if(req.headers.host!==authority)return respond(403,'{"error":"地址不匹配"}');
      if(req.headers.origin&&req.headers.origin!==origin)return respond(403,'{"error":"不允许其他网站访问"}');
      if(!req.url.startsWith('/')||req.url.startsWith('//'))return respond(400,'{"error":"地址无效"}');
      const url=new URL(req.url,origin),cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('vivian_phone='))?.slice(13);
      if(url.pathname==='/api/phone/pair'&&req.method==='POST'){
        if(req.headers.origin!==origin||!String(req.headers['content-type']).startsWith('application/json'))return respond(403,'{"error":"请从手机入口连接"}');
        let data='',length=0;for await(const chunk of req){length+=chunk.length;if(length>1024)return respond(413,'{"error":"内容过长"}');data+=chunk;}
        let body;try{body=JSON.parse(data);}catch(_){return respond(400,'{"error":"内容无效"}');}
        if(!matches(body?.key))return respond(401,'{"error":"凭证无效"}');
        res.setHeader('Set-Cookie','vivian_phone='+key+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000');return respond(200,'{"ok":true}');
      }
      if(!matches(cookie)){
        if((url.pathname==='/'||url.pathname==='/index.html')&&req.method==='GET')return respond(200,pairingPage,'text/html; charset=utf-8');
        return respond(401,'{"error":"请用完整手机链接重新连接工作台"}');
      }
      if(req.headers['sec-fetch-site']==='cross-site')return respond(403,'{"error":"不允许跨站访问"}');
      const headers={host:'127.0.0.1:'+upstreamPort,'sec-fetch-site':'same-origin','x-vivian-phone':'1'};
      for(const name of ['content-type','content-length','accept','if-none-match','if-modified-since'])if(req.headers[name])headers[name]=req.headers[name];
      if(req.headers.origin)headers.origin='http://127.0.0.1:'+upstreamPort;
      const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:url.pathname+url.search,method:req.method,headers},response=>{
        res.writeHead(response.statusCode,{...response.headers,'Referrer-Policy':'no-referrer'});response.pipe(res);
      });
      upstream.setTimeout(90000,()=>upstream.destroy(Error('timeout')));
      upstream.on('error',()=>{if(!res.headersSent)respond(502,'{"error":"电脑工作台未启动，请在电脑上打开工作台"}');else res.end();});
      req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
    }catch(_){if(!res.headersSent)respond(500,'{"error":"手机连接暂时失败，请重试"}');else res.end();}
  });
  return server;
}
if(require.main===module){
  const host=process.env.VIVIAN_PHONE_HOST;if(!privateIPv4(host||''))throw Error('请通过打开手机工作台启动');
  const dataDir=path.join(__dirname,'local-data');fs.mkdirSync(dataDir,{recursive:true});
  const configFile=path.join(dataDir,'phone-access.json');
  let key;if(fs.existsSync(configFile))key=JSON.parse(fs.readFileSync(configFile,'utf8')).key;else{key=crypto.randomBytes(32).toString('hex');fs.writeFileSync(configFile,JSON.stringify({key}),{mode:0o600});}
  const server=createPhoneServer({host,key});server.on('error',e=>{console.error(e.message);process.exitCode=1;});
  server.listen(8778,host,()=>{fs.writeFileSync(path.join(dataDir,'phone-url.txt'),'http://'+host+':8778/#'+key);console.log('Vivian 手机入口已启动：http://'+host+':8778/');});
}
module.exports={createPhoneServer,privateIPv4};
