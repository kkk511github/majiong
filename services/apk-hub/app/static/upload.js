function uploadAutoDialog(){
 const dialog=document.createElement('dialog');dialog.className='upload-dialog';
 dialog.innerHTML=`<button class="dialog-close" aria-label="关闭">${icon('close')}</button><div class="eyebrow">NEW RELEASE</div><h2>上传并解析应用</h2><p>选择 APK 或 IPA，自动读取应用名称、应用标识、版本和图标。</p><form id="auto-upload"><label class="dropzone" id="auto-drop">${icon('upload',30)}<strong id="auto-file-label">点击选择或拖拽 APK / IPA 到这里</strong><span>最大 500 MB · 选择后自动上传为草稿</span><input type="file" name="apk" accept=".apk,.ipa"></label><progress id="auto-progress" max="100" value="0" hidden></progress><div id="parse-status" role="status" style="font-size:14px;color:#758095;margin-bottom:16px">上传后自动填入，无需手动查询包信息。</div><div id="parsed-icon"></div><p class="upload-ios-note" id="upload-ios-note" hidden></p><div class="form-grid"><label>应用名称<input name="name" maxlength="200" required placeholder="等待解析"></label><label>版本号（自动读取）<input name="version" readonly placeholder="等待解析"></label><label>分类<select name="category"><option>实用工具</option><option>效率办公</option><option>生活日常</option><option>其他</option></select></label><label>应用标识（自动读取）<input name="package" readonly placeholder="等待解析"></label></div><label>应用简介<textarea name="description" maxlength="500" rows="2" placeholder="简单介绍应用的用途"></textarea></label><label>版本说明<textarea name="notes" maxlength="3000" rows="3" placeholder="这一版更新了什么？"></textarea></label><label class="check"><input type="checkbox" name="published" value="1"> 保存后立即上架</label><div id="auto-error" class="error" role="alert"></div><button class="primary full" type="submit" disabled>保存应用信息</button></form>`;
 document.body.append(dialog);dialog.showModal();
 const form=dialog.querySelector('form'),input=form.elements.apk,button=form.querySelector('[type=submit]'),label=$('#auto-file-label'),status=$('#parse-status'),error=$('#auto-error'),progress=$('#auto-progress');let appId=null,busy=false;
 const close=()=>{if(busy){toast('正在上传或保存，请稍候');return}dialog.close()};
 dialog.querySelector('.dialog-close').onclick=close;dialog.oncancel=e=>{if(busy){e.preventDefault();toast('正在上传或保存，请稍候')}};
 dialog.onclose=()=>{dialog.remove();if(appId)loadAdmin().catch(e=>toast(e.message))};
 const choose=()=>{
  const file=input.files[0];if(!file)return;
  if(preview){input.value='';toast('演示模式不上传文件，请先登录后台');return}
  if(!/\.(apk|ipa)$/i.test(file.name)){error.textContent='仅支持 APK 或 IPA 文件';return}
  if(file.size>500*1024*1024){error.textContent='文件不能超过 500 MB';return}
  if(busy||appId)return;
  busy=true;input.disabled=true;button.disabled=true;error.textContent='';label.textContent=file.name;progress.hidden=false;status.textContent='正在上传安装包…';
  const kind=file.name.toLowerCase().endsWith('.ipa')?'IPA':'APK';const data=new FormData();data.append('file',file);const xhr=new XMLHttpRequest();xhr.open('POST','/api/upload');xhr.setRequestHeader('X-CSRF-Token',csrf);
  xhr.upload.onprogress=e=>{if(e.lengthComputable){progress.value=e.loaded/e.total*100;status.textContent=progress.value>=100?`上传完成，正在解析 ${kind}…`:`正在上传 ${Math.round(progress.value)}%`}};
  xhr.onload=()=>{busy=false;let result;try{result=JSON.parse(xhr.responseText)}catch{result={error:'上传失败，请稍后重试'}}if(xhr.status!==201){input.disabled=false;input.value='';error.textContent=result.error;status.textContent='解析未完成，请重新选择文件';return}appId=result.id;progress.value=100;form.elements.name.value=result.name;form.elements.version.value=result.version;form.elements.package.value=result.package;$('#parsed-icon').innerHTML=badge(result);status.textContent=`${platformName(result)} 解析成功 · ${result.version_code?'构建版本 '+result.version_code+' · ':''}已保存为草稿`;const note=$('#upload-ios-note');note.hidden=appPlatform(result)!=='ios';note.textContent=appPlatform(result)==='ios'?`${result.minimum_os_version?'适用于 iOS '+result.minimum_os_version+' 及以上。':''}${iosNote(result)}`:'';if(result.parse_warning)error.textContent=result.parse_warning;button.disabled=false;label.textContent=file.name+' · 已上传';};
  xhr.onerror=()=>{busy=false;input.disabled=false;input.value='';error.textContent='连接中断，请检查后台草稿列表后重试';status.textContent='上传未完成'};
  xhr.send(data);
 };
 input.onchange=choose;
 const zone=$('#auto-drop');zone.ondragover=e=>{e.preventDefault();if(!busy&&!appId)zone.classList.add('drag')};zone.ondragleave=()=>zone.classList.remove('drag');zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag');if(busy||appId)return;input.files=e.dataTransfer.files;choose()};
 form.onsubmit=async e=>{e.preventDefault();if(!appId||busy)return;busy=true;button.disabled=true;try{await api('/api/update',{method:'POST',body:JSON.stringify({id:appId,name:form.elements.name.value,category:form.elements.category.value,description:form.elements.description.value,notes:form.elements.notes.value,published:form.elements.published.checked})});busy=false;dialog.close();toast(form.elements.published.checked?'应用已保存并上架':'应用已保存为草稿')}catch(e){error.textContent=e.message;busy=false;button.disabled=false}};
}
