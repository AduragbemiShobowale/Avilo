// H1 against the live Supabase project: in-app latency test, cross-user latency, planted-discrepancy detection.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const http=require('http');
const D=process.argv[2],OUT=process.argv[3],N=+process.argv[4]||200;
const L=fs.readFileSync(process.argv[5],'utf8');const pw=(e)=>{const m=L.split('\n').find(l=>l.includes('`'+e+'`'));return m.split('`')[3]};
const srv=http.createServer((q,r)=>{let f=q.url.split('?')[0];let p=path.join(D,f);if(!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(D,'index.html');r.setHeader('content-type',p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':'text/html');r.end(fs.readFileSync(p));}).listen(8790);
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
(async()=>{
 const b=await chromium.launch({proxy:{server:process.env.HTTPS_PROXY,bypass:'localhost,127.0.0.1'},args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errs=[];
 async function signIn(email,url){const c=await b.newContext({viewport:{width:1280,height:950},acceptDownloads:true});const p=await c.newPage();
  p.on('pageerror',e=>errs.push(email+': '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(email+': '+m.text())});
  await p.addInitScript(()=>{try{sessionStorage.setItem('avilo-intro','1')}catch(e){}});
  await p.goto('http://localhost:8790/');await p.waitForSelector('input[type=email]',{timeout:60000});
  await p.fill('input[type=email]',email);await p.fill('input[autocomplete=current-password]',pw(email));await p.click('button.btn.primary.lg.block');
  await p.waitForFunction(()=>window.__avilo&&window.__avilo.lastEventId>0&&(window.__aviloCh||[]).some(x=>x[1]==='SUBSCRIBED'),null,{timeout:90000});
  if(url){await p.evaluate(u=>{history.pushState({},'',u);dispatchEvent(new PopStateEvent('popstate'))},url);await p.waitForTimeout(1500);}
  log('signed in',email);return p;}
 const admin=await signIn('admin@avilo.test','/visibility-test');
 const planner=await signIn('planner@avilo.test','/');
 const env={ua:await admin.evaluate(()=>navigator.userAgent),startedAt:new Date().toISOString(),n:N};

 // 1. In-app latency test (the Visibility test page, as a user would run it)
 await admin.fill('input[type=number] >> nth=0',String(N));
 await admin.click('text=Run latency test');
 await admin.waitForFunction((n)=>{const t=[...document.querySelectorAll('.tile')].find(x=>/Events measured/i.test(x.textContent));return t&&new RegExp('^\\s*Events measured\\s*'+n+'\\b').test(t.textContent.replace(/\s+/g,' '))},N,{timeout:N*20000});
 await admin.waitForTimeout(1000);
 const [dl]=await Promise.all([admin.waitForEvent('download'),admin.click('button:has-text("Export CSV") >> nth=0')]);await dl.saveAs(OUT+'/h1_latency_inapp.csv');
 await admin.screenshot({path:OUT+'/h1_latency_inapp.png',fullPage:true});log('in-app latency done');

 // 2. Cross-user latency: the admin writes, the planner (another signed-in user, another session) sees it
 const rows=[];
 for(let i=0;i<N;i++){
  const t0=Date.now();
  const res=await admin.evaluate((i)=>window.__avilo.rpc('h1_probe',{p_seq:i}),1000+i);
  const t1=Date.now();
  let t2=null;try{await planner.waitForFunction(id=>window.__avilo.lastEventId>=id,res.id,{polling:'raf',timeout:15000});t2=Date.now()}catch(e){}
  rows.push({seq:i+1,event_id:res.id,server_ts:res.ts,write_ms:t1-t0,seen_by_other_user_ms:t2==null?'':t2-t0});
  await new Promise(r=>setTimeout(r,600));
 }
 fs.writeFileSync(OUT+'/h1_latency_cross_user.csv',['seq,event_id,server_ts,write_ms,seen_by_other_user_ms',...rows.map(r=>[r.seq,r.event_id,r.server_ts,r.write_ms,r.seen_by_other_user_ms].join(','))].join('\n')+'\n');
 log('cross-user latency done');

 // 3. Detection of planted discrepancies (Visibility test page)
 const before=await planner.evaluate(()=>window.__avilo.lastEventId);
 const tp=Date.now();await admin.click('button:has-text("Plant discrepancies")');
 // seed_h1 writes 40 ledger events; time how long until the planner (another user) has all of them
 const catchUp=planner.waitForFunction(id=>window.__avilo.lastEventId>=id,before+40,{timeout:30000,polling:'raf'}).then(()=>Date.now()-tp).catch(()=>null);
 try{await admin.waitForSelector('td:has-text("Lost transfers")',{timeout:60000});}catch(e){await admin.screenshot({path:OUT+'/h1_detection_fail.png',fullPage:true});console.log('NOTICE',await admin.evaluate(()=>[...document.querySelectorAll('.notice')].map(n=>n.textContent).join(' | ')));throw e}await admin.waitForTimeout(3000);
 const [dl2]=await Promise.all([admin.waitForEvent('download'),admin.click('button:has-text("Export CSV") >> nth=1')]);await dl2.saveAs(OUT+'/h1_detection.csv');
 await admin.screenshot({path:OUT+'/h1_detection.png',fullPage:true});
 env.plannerCaughtUpMs=await catchUp;
 await planner.waitForTimeout(1500);env.plannerChannel=await planner.evaluate(()=>window.__aviloCh);
 const tower=await planner.evaluate(()=>({overdue:[...document.querySelectorAll('.chip')].filter(c=>/Overdue/.test(c.textContent)).length,exceptions:[...document.querySelectorAll('.chip')].filter(c=>/RFID gate/.test(c.textContent)).length}));
 await planner.screenshot({path:OUT+'/h1_planner_tower_after_plant.png'});
 env.towerAfterPlant=tower;env.finishedAt=new Date().toISOString();
 fs.writeFileSync(OUT+'/h1_run.json',JSON.stringify({...env,errors:errs},null,2));
 log('tower after plant',JSON.stringify(tower));log('ERRORS',errs.length?errs.slice(0,10).join('\n'):'none');
 await b.close();srv.close();
})().catch(e=>{console.error('FAILED',e.message);process.exit(1)});
