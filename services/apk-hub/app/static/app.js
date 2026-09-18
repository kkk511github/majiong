const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name,size=20)=>{const paths={box:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7 5.8l9 5"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',chevron:'<path d="m9 5 7 7-7 7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.box}</svg>`};
const demos=[{id:'demo1',name:'轻记',version:'2.4.0',description:'随手记录灵感，让每一个想法都有安放的地方。',category:'效率办公',size:18600000,downloads:0,mark:'记',color:'blue',notes:'全新笔记编辑体验\n支持离线保存与深色模式',package:'com.example.notes'},{id:'demo2',name:'云端文件',version:'1.8.2',description:'文件随身携带，在不同设备间轻松整理与访问。',category:'实用工具',size:32400000,mark:'云',color:'violet'},{id:'demo3',name:'专注时刻',version:'3.1.0',description:'从一个番茄钟开始，找回不被打扰的专注。',category:'效率办公',size:12800000,mark:'◷',color:'orange'},{id:'demo4',name:'像素相册',version:'1.6.0',description:'收藏日常的美好，让每张照片都井井有条。',category:'生活日常',size:25600000,mark:'像',color:'pink'}].map(x=>({...x,demo:true,published:1,created:Date.now()/1000}));
let apps=[],csrf='',preview=false,category='全部应用',platform='all',query='';
const admin=location.pathname.startsWith('/admin');
const standalone=location.pathname.startsWith('/app/'),sharedId=(location.pathname.match(/^\/app\/([a-f0-9]{24})$/)||[])[1];
const mb=n=>(n/1024/1024).toFixed(1)+' MB';
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3500)}
async function api(path,options={}){const r=await fetch(path,{...options,headers:{...options.headers,...(csrf?{'X-CSRF-Token':csrf}:{})}});const d=await r.json();if(!r.ok){const error=Error(d.error||'请求失败');error.status=r.status;throw error}return d}
function logo(){return `<a class="brand" href="/"><span class="brand-icon">${icon('box',25)}</span><span>轻装<span class="brand-en">APP SPACE</span></span></a>`}
function shell(content){$('#app').innerHTML=`<header><div class="nav">${logo()}${standalone?'<span class="standalone-nav">应用分发</span>':`<nav><a class="${!admin?'active':''}" href="/">应用广场</a>${admin?'<a class="active" href="/admin">管理后台 </a>':''}</nav>`}</div></header>${content}<footer><span>轻装 · 让应用触手可及</span><span>Android / iOS 应用分发 <i>·</i> 简单，自在</span></footer>`}
function badge(a){const name=String(a.name||'应用');if(a.icon_url && /^\/icons\/[a-f0-9]{24}\.png$/.test(a.icon_url)) return `<img class="app-icon" src="${esc(a.icon_url)}" alt="${esc(a.name)}图标" style="object-fit:contain;background:transparent">`;return `<div class="app-icon ${['blue','violet','orange','pink'].includes(a.color)?a.color:['blue','violet','orange','pink'][name.length%4]}">${esc(a.mark||name.slice(0,1))}</div>`}
const appPlatform=a=>a.platform==='ios'?'ios':'android';
const platformName=a=>appPlatform(a)==='ios'?'iOS':'Android';
const packageLabel=a=>appPlatform(a)==='ios'?'IPA':'APK';
function publicLink(value,path){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname===path?u.href:''}catch{return ''}
}
function downloadURL(a){return /^[a-f0-9]{24}$/.test(String(a.id||''))?(publicLink(a.download_url,'/download/'+a.id+'.'+packageLabel(a).toLowerCase())||'/download/'+a.id):''}
function shareURL(a){return a.published&&/^[a-f0-9]{24}$/.test(String(a.id||''))?publicLink(a.share_url,'/app/'+a.id):''}
function shareBlock(a){const url=shareURL(a);return url?`<section class="share-section"><h3>分发链接</h3><p>${a.unlisted?'仅通过链接访问，不在应用市场显示。':'可分享此链接，直接打开本应用。'}</p><div class="share-controls"><input aria-label="分发链接" readonly value="${esc(url)}"><button type="button" class="secondary" data-copy-share>复制链接</button></div><a class="source-download" href="${esc(url)}" target="_blank" rel="noopener">打开独立分发页 ${icon('arrow',15)}</a></section>`:''}
function wireShare(root){root.querySelectorAll('[data-copy-share]').forEach(button=>button.onclick=async()=>{const input=button.parentElement.querySelector('input');try{await navigator.clipboard.writeText(input.value);toast('分发链接已复制')}catch{input.focus();input.select();toast('请复制已选中的分发链接')}})}
function installURL(a){
 if(appPlatform(a)!=='ios'||!a.published||!downloadURL(a)||typeof a.install_url!=='string')return '';
 try{
  const u=new URL(a.install_url),keys=[...u.searchParams.keys()];
  if(!a.install_url.startsWith('itms-services://?')||u.protocol!=='itms-services:'||u.host||u.pathname||u.hash||keys.length!==2||u.searchParams.getAll('action').length!==1||u.searchParams.getAll('url').length!==1||u.searchParams.get('action')!=='download-manifest')return '';
  const manifest=new URL(u.searchParams.get('url'));
  if(manifest.protocol!=='https:'||!manifest.hostname||manifest.username||manifest.password||manifest.search||manifest.hash||manifest.pathname!=='/manifest/'+a.id+'.plist')return '';
  return a.install_url;
 }catch{return ''}
}
function iosNote(a){return !a.published?'此应用尚未启用，暂不能安装。':a.installation_note||'此 IPA 尚未满足网页安装条件，请联系发布者上传签名有效且适配设备的安装包。'}
function appActions(a,full=false){
 const download=downloadURL(a),install=installURL(a);
 if(!download)return '';
 if(appPlatform(a)==='ios'){
  const actionClass=full?'primary full':'download install';
  return `<div class="${full?'detail-actions':'package-actions'}">${install?`<a class="${actionClass}" href="${esc(install)}">${icon('phone',full?20:16)} 安装到 iPhone/iPad</a>`:`<button class="${actionClass} install-unavailable" disabled>${icon('phone',full?20:16)} 暂不能安装</button>`}</div><p class="installation-note">${install&&!String(iosNote(a)).includes('Safari')?'请在 Safari 中打开。':''}${esc(iosNote(a))}</p>${full&&a.parse_warning?`<p class="installation-warning">安装包检查：${esc(a.parse_warning)}</p>`:''}${full&&a.published&&(standalone||(admin&&csrf&&!preview))?`<a class="source-download" href="${esc(download)}">${icon('download',15)} 下载原始 IPA</a>`:''}`;
 }
 if(!a.published)return '<div class="draft-note">启用后可下载安装包。</div>';
 return `<div class="${full?'detail-actions':'package-actions'}"><a class="${full?'primary full':'download'}" href="${esc(download)}">${icon('download',full?20:16)} 下载 APK</a></div>`;
}
function standalonePage(a){
 const ios=appPlatform(a)==='ios';
 document.title=String(a.name||'应用')+' · 应用分发';
 shell(`<main class="standalone-page"><article class="standalone-card">${badge(a)}<h1>${esc(a.name)}</h1><div class="detail-meta">v${esc(a.version)} <span>·</span> ${mb(a.size)} <span>·</span> ${platformName(a)}${ios&&a.minimum_os_version?' '+esc(a.minimum_os_version)+' 及以上':''}</div>${a.description?`<p class="standalone-description">${esc(a.description)}</p>`:''}${appActions(a,true)}${a.notes?`<section class="standalone-notes"><h2>版本说明</h2><p class="pre">${esc(a.notes)}</p></section>`:''}</article></main>`);
}
function publicPage(){
 const featured=(apps.length?apps:demos)[0];
 shell(`<main class="public"><section class="hero"><div><div class="eyebrow"><span></span> YOUR APPS, ONE PLACE</div><h1>好用的应用，<br><span>轻松装进手机。</span></h1><p>发现、安装、轻松分享。你的 Android 与 iOS 应用集合。</p><div class="hero-meta">${icon('phone',17)} Android / iOS 应用 <b> / </b> 无需登录即可安装</div></div><div class="feature"><div class="feature-top"><span>精选应用</span><span>01 / COLLECTION</span></div><div class="featured-body">${badge(featured)}<div><h2>${esc(featured.name)}</h2><p>${platformName(featured)} · ${esc(featured.category)} · v${esc(featured.version)}</p></div></div><p class="feature-desc">${esc(featured.description)}</p><button class="feature-link" data-detail="${esc(featured.id)}">查看应用 ${icon('arrow')}</button></div></section><section class="library"><div class="section-head"><div><h2>应用广场 <span id="count"></span></h2><p>为你的手机，添一点新可能。</p></div><label class="search">${icon('search')}<input id="search" placeholder="搜索应用名称" aria-label="搜索应用" value="${esc(query)}"></label></div><div class="filter-bar"><div class="platform-filters" aria-label="筛选应用平台">${[['all','全部平台'],['android','Android'],['ios','iOS']].map(([value,label])=>`<button class="platform-filter ${platform===value?'selected':''}" data-platform="${value}" aria-pressed="${platform===value}">${label}</button>`).join('')}</div><div class="filters" aria-label="筛选应用分类">${['全部应用','效率办公','实用工具','生活日常','其他'].map(x=>`<button class="filter ${category===x?'selected':''}" data-category="${x}" aria-pressed="${category===x}">${x}</button>`).join('')}</div></div>${!apps.length?'<div class="demo-note">页面预览 · 以下为演示应用，上传首个安装包后将展示你的真实应用。</div>':''}<div class="cards" id="cards"></div></section><div class="bottom-note">${icon('shield',22)}<div><strong>安装前，确认应用来源与设备要求</strong><span>Android：下载 APK 后按系统提示安装。iOS：IPA 需有效签名并适配设备；有安装入口时，请用 Safari 打开。</span></div><span class="format">APK / IPA</span></div></main>`);
 renderCards();
 $('#search').oninput=e=>{query=e.target.value;renderCards()};
 document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});renderCards()});
 document.querySelectorAll('[data-platform]').forEach(b=>b.onclick=()=>{platform=b.dataset.platform;document.querySelectorAll('[data-platform]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});renderCards()});
 wireDetails();
}
function renderCards(){
 const rows=(apps.length?apps:demos).filter(a=>(platform==='all'||appPlatform(a)===platform)&&(category==='全部应用'||a.category===category)&&String(a.name||'').toLowerCase().includes(query.trim().toLowerCase()));
 $('#count').textContent=String(rows.length).padStart(2,'0');
 $('#cards').innerHTML=rows.length?rows.map(a=>`<article class="app-card"><div class="card-top">${badge(a)}<span class="category">${esc(a.category)}</span></div><button class="app-title" data-detail="${esc(a.id)}">${esc(a.name)} ${icon('chevron',16)}</button><p>${esc(a.description||'暂无应用介绍')}</p><div class="app-meta"><span>v${esc(a.version)}</span><span>${mb(a.size)}</span><span>${platformName(a)}</span></div><div class="card-bottom ${appPlatform(a)==='ios'?'ios-bottom':''}"><span>${a.demo?'演示应用':new Date(a.created*1000).toLocaleDateString('zh-CN')+' 更新'}</span>${a.demo?`<button class="download" data-detail="${esc(a.id)}">查看演示 ${icon('arrow',16)}</button>`:appActions(a)}</div></article>`).join(''):'<div class="empty">没有找到匹配的应用，请试试其他平台、分类或关键词。</div>';
 wireDetails();
}
function wireDetails(){document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detail(b.dataset.detail))}
function detail(id){
 const a=[...apps,...demos].find(a=>a.id===id);if(!a)return;
 const ios=appPlatform(a)==='ios',d=document.createElement('dialog');
 d.innerHTML=`<button class="dialog-close" aria-label="关闭">${icon('close')}</button>${badge(a)}<h2>${esc(a.name)} <small>v${esc(a.version)}</small></h2><p>${esc(a.description||'暂无应用介绍')}</p><div class="detail-meta">${mb(a.size)} <span>·</span> ${esc(a.category)} <span>·</span> ${platformName(a)}${ios&&a.minimum_os_version?' '+esc(a.minimum_os_version)+' 及以上':''}</div>${ios&&!a.demo?`<h3>iOS 安装</h3>${appActions(a,true)}<p class="installation-help">请使用 Safari 打开本页。只有签名有效且设备符合要求的安装包才能安装，最终由设备系统验证。</p>`:''}<h3>版本说明</h3><p class="pre">${esc(a.notes||'暂无版本说明')}</p>${a.package?`<h3>${ios?'应用标识':'应用包名'}</h3><p class="hash">${esc(a.package)}</p>`:''}${a.sha256?`<h3>SHA-256 文件校验</h3><p class="hash">${esc(a.sha256)}</p>`:''}${admin&&csrf&&!preview?shareBlock(a):''}${a.demo?'<div class="demo-note">这是界面演示，尚未上传可下载的安装包。</div>':ios?'':appActions(a,true)}`;
 document.body.append(d);wireShare(d);d.showModal();d.querySelector('button').onclick=()=>d.close();d.onclose=()=>d.remove();
}
function login(){shell(`<main class="login-wrap"><div class="login-aside"><div class="eyebrow">APP SPACE / CONSOLE</div><h1>每一次更新，<br>都从这里开始。</h1><p>上传安装包，发布新版本，<br>让你的应用与更多人见面。</p></div><form id="login" class="login-card"><span class="login-symbol">${icon('shield',28)}</span><h2>登录管理后台</h2><p>输入管理员密码，管理你的应用。</p><label>管理密码<input type="password" name="password" required autocomplete="current-password" placeholder="请输入管理员密码"></label><div id="login-error" class="error" role="alert"></div><button class="primary full">进入后台 ${icon('arrow')}</button><a class="back" href="/">返回应用广场</a></form></main>`);$('#login').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{const d=await api('/api/login',{method:'POST',body:JSON.stringify({password:e.target.password.value})});csrf=d.csrf;await loadAdmin()}catch(e){$('#login-error').textContent=e.message}finally{b.disabled=false}}}
async function loadAdmin(){apps=preview?demos:await api('/api/admin/apps');dashboard()}
function dashboard(){
 shell(`<main class="admin-layout"><aside><div class="console-label">工作空间</div><button class="side-active">${icon('grid')} 应用管理 <span>${apps.length}</span></button><button id="side-upload">${icon('upload')} 上传安装包</button><div class="aside-bottom">${icon('shield')}<div>${preview?'后台演示':'管理员'}<small>${preview?'只读预览模式':'当前已登录'}</small></div></div></aside><section class="workspace"><div class="admin-heading"><div><div class="eyebrow">WORKSPACE / APPLICATIONS</div><h1>应用管理</h1><p>管理安装包，让每个版本有序发布。</p></div><div>${preview?'<a class="secondary" href="/admin">登录后台</a>':'<button class="secondary" id="logout">退出登录</button>'}<button class="primary" id="new-upload">${icon('upload')} 上传应用</button></div></div>${preview?'<div class="demo-note">后台演示 · 你可以查看上传表单。登录后才能上传和发布真实安装包。</div>':''}<div class="stats"><div><span>应用总数 ${icon('box')}</span><strong>${String(apps.length).padStart(2,'0')}</strong><small>全部安装包版本</small></div><div><span>已启用 ${icon('grid')}</span><strong>${String(apps.filter(a=>a.published).length).padStart(2,'0')}<i></i></strong><small>市场与仅链接应用</small></div><div><span>下载请求 ${icon('download')}</span><strong>${apps.reduce((n,a)=>n+(a.downloads||0),0)}</strong><small>${preview?'演示数据':'累计下载请求次数'}</small></div></div><section class="table-panel"><div class="table-heading"><h2>全部应用 <span>${apps.length}</span></h2><span>最近上传优先</span></div><div class="table-scroll"><table><thead><tr><th>应用</th><th>版本 / 大小</th><th>状态</th><th>展示范围</th><th>下载</th><th>操作</th></tr></thead><tbody>${apps.length?apps.map(a=>`<tr><td><div class="table-app">${badge(a)}<div><strong>${esc(a.name)}</strong><small>${platformName(a)} · ${esc(a.category)}</small></div></div></td><td>v${esc(a.version)}<small>${mb(a.size)}</small></td><td><span class="status ${a.published?'live':''}">${a.published?(a.unlisted?'链接已启用':'已上架'):'草稿'}</span></td><td><span class="visibility-label ${a.unlisted?'unlisted':''}">${a.unlisted?'仅链接':'应用市场'}</span><button class="text-button visibility-button" data-visibility="${esc(a.id)}">${a.unlisted?'显示到市场':'设为仅链接'}</button></td><td>${a.downloads||0}</td><td><button class="text-button" data-publish="${esc(a.id)}">${a.unlisted?(a.published?'停用链接':'启用链接'):(a.published?'下架':'上架')}</button><button class="text-button" data-detail="${esc(a.id)}">详情${a.published?' / 链接':''}</button><button class="text-button delete-button" data-delete="${esc(a.id)}">删除</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">还没有应用。上传第一个 APK 或 IPA，开启你的分发站。</div></td></tr>'}</tbody></table></div></section><div class="admin-tip">${icon('clock')} “仅链接”应用启用后可通过分发链接访问，不会显示在应用市场；草稿不开放下载。</div></section></main>`);
 $('#new-upload').onclick=uploadAutoDialog;$('#side-upload').onclick=uploadAutoDialog;
 if($('#logout'))$('#logout').onclick=async()=>{await api('/api/logout',{method:'POST',body:'{}'});location.reload()};
 document.querySelectorAll('[data-publish]').forEach(b=>b.onclick=async()=>{
  if(preview)return toast('演示模式，请先登录后台');b.disabled=true;
  try{const a=apps.find(a=>a.id===b.dataset.publish);await api('/api/publish',{method:'POST',body:JSON.stringify({id:a.id,published:!a.published})});toast(a.unlisted?(a.published?'分发链接已停用':'分发链接已启用'):(a.published?'应用已下架':'应用已上架'));await loadAdmin()}catch(e){toast(e.message);b.disabled=false}
 });
 document.querySelectorAll('[data-visibility]').forEach(b=>b.onclick=async()=>{
  if(preview)return toast('演示模式，请先登录后台');b.disabled=true;
  try{const a=apps.find(a=>a.id===b.dataset.visibility),unlisted=!a.unlisted;await api('/api/visibility',{method:'POST',body:JSON.stringify({id:a.id,unlisted})});toast(unlisted?'已设为仅链接，应用市场不再显示':(a.published?'应用已显示到市场':'已设为市场展示，上架后显示'));await loadAdmin()}catch(e){toast(e.message);b.disabled=false}
 });
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{
  if(preview)return toast('演示模式，请先登录后台');
  const a=apps.find(a=>a.id===b.dataset.delete);if(!a)return;
  if(!confirm(`确定永久删除「${a.name}」v${a.version} 吗？\n\n安装包、图标和该版本记录将被删除，分享及下载链接立即失效。此操作无法撤销。`))return;
  b.disabled=true;
  try{await api('/api/delete',{method:'POST',body:JSON.stringify({id:a.id,confirm_name:a.name})});toast('应用已删除');await loadAdmin()}catch(e){toast(e.message);b.disabled=false}
 });
 wireDetails();
}
async function start(){try{
 if(standalone){if(!sharedId){const error=Error('链接无效或应用已停用');error.status=404;throw error}standalonePage(await api('/api/apps/'+sharedId))}
 else if(admin){const s=await api('/api/session');csrf=s.csrf;if(s.authenticated||preview)await loadAdmin();else login()}
 else{apps=await api('/api/apps');publicPage()}
}catch(e){shell(`<main class="empty"><h2>${standalone&&e.status===404?'此应用暂不可用':'暂时无法加载'}</h2><p>${standalone&&e.status===404?'链接无效或应用已停用，请联系发布者。':esc(e.message)}</p>${e.status===404?'':'<button class="primary" id="retry">重新加载</button>'}</main>`);if($('#retry'))$('#retry').onclick=start}}start();
