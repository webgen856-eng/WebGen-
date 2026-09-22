(() => {
  'use strict';
  const LEGACY_STORAGE_KEY='webgen-lg-projects-v2';
  const GUEST_STORAGE_KEY='webgen-lg-projects-guest-v3';
  const USER_STORAGE_PREFIX='webgen-lg-projects-user-v3:';
  const ACTIVE_KEY='webgen-lg-active-project';
  const config=window.WEBGEN_CONFIG||{};
  let supabaseClient=null,user=null,activeProject=null,saveTimer=null,toastTimer=null;
  const $=(id)=>document.getElementById(id);
  const $$=(sel)=>[...document.querySelectorAll(sel)];

  const templates={
    modern:{name:'Moderna',desc:'Limpia y profesional',className:'modern',swatch:'linear-gradient(135deg,#2563eb,#0f172a)'},
    minimal:{name:'Minimal',desc:'Simple y elegante',className:'minimal',swatch:'linear-gradient(135deg,#fafafa,#111827)'},
    bold:{name:'Impactante',desc:'Alto contraste',className:'bold',swatch:'linear-gradient(135deg,#111827,#7c3aed)'},
    boutique:{name:'Boutique',desc:'Editorial y fina',className:'boutique',swatch:'linear-gradient(135deg,#f5e7da,#7c2d12)'},
    tech:{name:'Tech',desc:'Oscura y tecnológica',className:'tech',swatch:'linear-gradient(135deg,#020617,#06b6d4)'},
    restaurant:{name:'Restaurante',desc:'Cálida y visual',className:'restaurant',swatch:'linear-gradient(135deg,#fff7ed,#c2410c)'}
  };

  const defaults=()=>({
    id:crypto.randomUUID?crypto.randomUUID():'p-'+Date.now(),name:'Nova Studio',tagline:'Ideas que se convierten en resultados',description:'Creamos experiencias profesionales con atención personalizada, soluciones modernas y un servicio pensado para cada cliente.',category:'Servicios',slug:'nova-studio',template:'modern',primaryColor:'#2563eb',secondaryColor:'#0f172a',phone:'+502 5555 5555',instagram:'@novastudio',facebook:'',location:'Guatemala',ctaText:'Contáctanos',logo:'',heroImage:'',published:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),items:[{title:'Servicio Premium',text:'Atención personalizada y resultados de alta calidad.',price:'Q 250'},{title:'Soluciones rápidas',text:'Procesos eficientes diseñados para ahorrar tiempo.',price:'Q 175'},{title:'Soporte confiable',text:'Acompañamiento antes, durante y después del servicio.',price:'Incluido'}]
  });

  function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function slugify(v=''){return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'mi-negocio';}
  function initials(name=''){return name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'LG';}
  function formatDate(iso){try{return new Intl.DateTimeFormat('es-GT',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(iso));}catch{return 'Hoy';}}
  function showToast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
  function setAutosave(text='Guardado'){const el=$('autosaveState');el.textContent=text;}
  function validHex(v){return /^#[0-9A-Fa-f]{6}$/.test(v);}

  function storageKey(){return user?`${USER_STORAGE_PREFIX}${user.id}`:GUEST_STORAGE_KEY;}
  function getProjectsFromKey(key){try{return JSON.parse(localStorage.getItem(key)||'[]');}catch{return [];} }
  function setProjectsForKey(key,list){localStorage.setItem(key,JSON.stringify(list));}
  function getLocalProjects(){return getProjectsFromKey(storageKey());}
  function setLocalProjects(list){setProjectsForKey(storageKey(),list);}
  function upsertLocalProject(project){const list=getLocalProjects();const i=list.findIndex(p=>p.id===project.id);if(i>=0)list[i]=project;else list.unshift(project);setLocalProjects(list);}
  function deleteLocalProject(id){setLocalProjects(getLocalProjects().filter(p=>p.id!==id));}
  function migrateLegacyLocal(){
    const legacy=getProjectsFromKey(LEGACY_STORAGE_KEY);
    if(!legacy.length)return;
    const guest=getProjectsFromKey(GUEST_STORAGE_KEY),merged=new Map();
    [...guest,...legacy].forEach(p=>{if(p?.id)merged.set(p.id,p);});
    setProjectsForKey(GUEST_STORAGE_KEY,[...merged.values()]);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
  async function claimGuestProjects(){
    if(!user||!supabaseClient)return;
    const guest=getProjectsFromKey(GUEST_STORAGE_KEY);
    if(!guest.length)return;
    const userKey=`${USER_STORAGE_PREFIX}${user.id}`;
    const owned=getProjectsFromKey(userKey),merged=new Map(owned.map(p=>[p.id,p]));
    let failed=false;
    for(const p of guest){
      const copy={...p,updatedAt:new Date().toISOString()};
      merged.set(copy.id,copy);
      try{await saveCloud(copy);}catch(err){failed=true;console.error('No se pudo migrar un proyecto invitado:',err);}
    }
    setProjectsForKey(userKey,[...merged.values()]);
    if(!failed){localStorage.removeItem(GUEST_STORAGE_KEY);showToast('Tus proyectos locales se vincularon a tu cuenta.');}
  }

  async function initSupabase(){
    if(!config.SUPABASE_URL||!config.SUPABASE_ANON_KEY||!window.supabase){updateConnectionUI(false);return;}
    try{
      supabaseClient=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const {data,error}=await supabaseClient.auth.getSession();
      if(error)throw error;
      user=data.session?.user||null;
      if(user)await claimGuestProjects();
      updateConnectionUI(true);updateAuthUI();
      supabaseClient.auth.onAuthStateChange(async (_event,session)=>{
        const previousUserId=user?.id||null;
        user=session?.user||null;
        if(user&&user.id!==previousUserId)await claimGuestProjects();
        updateAuthUI();updateConnectionUI(true);await renderDashboard();
      });
    }catch(err){console.error(err);updateConnectionUI(false);}
  }

  function updateConnectionUI(configured){
    $('supabaseDot').classList.toggle('online',configured);
    $('supabaseStatus').textContent=configured?'Configurado':'No configurado';
    $('supabaseStatusText').textContent=configured?'Supabase está listo. Inicia sesión para sincronizar.':'La plataforma está usando almacenamiento local.';
    $('storageMode').textContent=configured&&user?'Nube + local':'Modo local';
    $('storageModeText').textContent=configured&&user?'Tus proyectos se sincronizan con tu cuenta.':'Tus cambios se guardan en este navegador.';
    document.querySelector('.status-dot').style.background=configured&&user?'#22c55e':'#f59e0b';
  }
  function updateAuthUI(){
    $('authLoggedOut').hidden=!!user;$('authLoggedIn').hidden=!user;$('userEmail').textContent=user?.email||'Usuario';updateConnectionUI(!!supabaseClient);
  }

  async function cloudProjects(){
    if(!supabaseClient||!user)return [];
    const {data,error}=await supabaseClient.from('webgen_projects').select('*').eq('user_id',user.id).order('updated_at',{ascending:false});
    if(error){console.error(error);return [];}
    return (data||[]).map(row=>({...row.site_data,id:row.id,published:row.is_published,createdAt:row.created_at,updatedAt:row.updated_at}));
  }
  async function allProjects(){
    const local=getLocalProjects();if(!supabaseClient||!user)return local;
    const cloud=await cloudProjects();const merged=new Map();[...local,...cloud].forEach(p=>{const old=merged.get(p.id);if(!old||new Date(p.updatedAt)>new Date(old.updatedAt))merged.set(p.id,p);});return [...merged.values()].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  }
  async function saveCloud(project){
    if(!supabaseClient||!user)return;
    const payload={id:project.id,user_id:user.id,slug:project.slug,name:project.name,is_published:!!project.published,site_data:project,updated_at:new Date().toISOString()};
    const {error}=await supabaseClient.from('webgen_projects').upsert(payload,{onConflict:'id'});if(error)throw error;
  }
  async function deleteCloud(id){if(!supabaseClient||!user)return;await supabaseClient.from('webgen_projects').delete().eq('id',id).eq('user_id',user.id);}

  function showView(name){
    $$('.view').forEach(v=>v.classList.remove('active'));$(`${name}View`).classList.add('active');
    $$('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    const labels={dashboard:['Mis proyectos','Crea, edita y exporta páginas para cualquier negocio.'],editor:['Editor de página','Personaliza el sitio y observa los cambios en tiempo real.'],account:['Mi cuenta','Configura sincronización y acceso a la nube.']};
    $('pageTitle').textContent=labels[name][0];$('pageSubtitle').textContent=labels[name][1];
    if(name==='dashboard')renderDashboard();
    if(window.innerWidth<761)$('sidebar').classList.remove('open');
  }

  async function renderDashboard(){
    const list=await allProjects(),q=$('projectSearch').value.trim().toLowerCase(),filtered=list.filter(p=>(p.name+' '+p.category).toLowerCase().includes(q));
    $('projectCount').textContent=list.length;$('emptyProjects').hidden=list.length>0;
    $('projectGrid').innerHTML=filtered.map(p=>`<article class="project-card" data-project-id="${escapeHtml(p.id)}"><div class="project-thumb" style="--pc1:${escapeHtml(p.primaryColor||'#2563eb')};--pc2:${escapeHtml(p.secondaryColor||'#0f172a')}"><span>${escapeHtml(templates[p.template]?.name||'Moderna')} · ${p.published?'PUBLICADA':'BORRADOR'}</span><strong>${escapeHtml(p.name||'Sin nombre')}</strong></div><div class="project-info"><div class="project-meta"><span>${escapeHtml(p.category||'Negocio')}</span><span>${formatDate(p.updatedAt)}</span></div><div class="project-actions"><button class="btn btn-primary" type="button" data-card-action="edit">Editar</button><button class="btn btn-ghost" type="button" data-card-action="duplicate" aria-label="Duplicar">⧉</button><button class="btn mini-danger" type="button" data-card-action="delete" aria-label="Eliminar">×</button></div></div></article>`).join('');
    if(list.length>0&&filtered.length===0)$('projectGrid').innerHTML='<div class="empty-state" style="grid-column:1/-1"><h3>Sin resultados</h3><p>No hay proyectos que coincidan con la búsqueda.</p></div>';
  }

  function renderTemplatePicker(){
    $('templatePicker').innerHTML=Object.entries(templates).map(([id,t])=>`<button type="button" class="template-card ${activeProject?.template===id?'active':''}" data-template="${id}"><div class="template-swatch" style="background:${t.swatch};color:white">${t.name}</div><strong>${t.name}</strong><small>${t.desc}</small></button>`).join('');
  }

  function loadProjectToForm(){
    const p=activeProject;['businessName','tagline','description','category','slug','primaryColor','secondaryColor','phone','instagram','facebook','location','ctaText'].forEach(id=>{const key=id==='businessName'?'name':id;$(id).value=p[key]??'';});
    $('primaryHex').value=p.primaryColor;$('secondaryHex').value=p.secondaryColor;$('editorProjectTitle').textContent=p.name||'Nueva página';renderTemplatePicker();renderItemsEditor();renderUploads();renderPreview();
  }

  function renderUploads(){
    const lp=$('logoPreview'),hp=$('heroImagePreview');
    lp.innerHTML=activeProject.logo?`<img src="${activeProject.logo}" alt="Logo">`:escapeHtml(initials(activeProject.name));
    hp.innerHTML=activeProject.heroImage?`<img src="${activeProject.heroImage}" alt="Portada">`:'Sin imagen';
  }

  function renderItemsEditor(){
    $('itemsEditor').innerHTML=activeProject.items.map((it,i)=>`<div class="item-row" data-item-index="${i}"><input data-item-field="title" type="text" maxlength="50" value="${escapeHtml(it.title)}" placeholder="Título"><input data-item-field="price" type="text" maxlength="25" value="${escapeHtml(it.price||'')}" placeholder="Precio"><input class="wide" data-item-field="text" type="text" maxlength="140" value="${escapeHtml(it.text)}" placeholder="Descripción"><div class="item-row-footer"><small>Elemento ${i+1}</small><button class="remove-item" type="button" data-remove-item="${i}">Eliminar</button></div></div>`).join('');
  }

  function siteMarkup(p,forExport=false){
    const logo=p.logo?`style="background-image:url('${escapeHtml(p.logo)}')"`:'',hero=p.heroImage?`style="background-image:url('${escapeHtml(p.heroImage)}')"`:'';
    const phoneHref=p.phone?`https://wa.me/${p.phone.replace(/\D/g,'')}`:'#';
    return `<div class="generated-site ${escapeHtml(templates[p.template]?.className||'modern')}" style="--p:${escapeHtml(p.primaryColor)};--s:${escapeHtml(p.secondaryColor)}"><nav class="gs-nav"><div class="gs-brand"><div class="gs-logo" ${logo}>${p.logo?'':escapeHtml(initials(p.name))}</div><strong>${escapeHtml(p.name)}</strong></div><a href="${escapeHtml(phoneHref)}" ${forExport?'target="_blank" rel="noopener"':''}>Contacto</a></nav><section class="gs-hero"><div class="gs-copy"><span class="gs-tag">${escapeHtml(p.category)}</span><h1>${escapeHtml(p.tagline)}</h1><p>${escapeHtml(p.description)}</p><div class="gs-actions"><a class="primary" href="#servicios">${escapeHtml(p.ctaText||'Contáctanos')}</a><a class="secondary" href="${escapeHtml(phoneHref)}">${escapeHtml(p.phone||'WhatsApp')}</a></div></div><div class="gs-visual ${p.heroImage?'has-image':''}" ${hero}><div class="gs-visual-card"><small>${escapeHtml(p.location||'')}</small><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.instagram||'')}</small></div></div></section><section class="gs-services" id="servicios"><div class="gs-services-head"><h2>Lo que ofrecemos</h2><p>Productos y servicios</p></div><div class="gs-cards">${p.items.map((it,i)=>`<article class="gs-card"><div class="num">${String(i+1).padStart(2,'0')}</div><h3>${escapeHtml(it.title||'Servicio')}</h3><p>${escapeHtml(it.text||'')}</p>${it.price?`<span class="price">${escapeHtml(it.price)}</span>`:''}</article>`).join('')}</div></section><footer class="gs-footer"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml([p.phone,p.instagram,p.location].filter(Boolean).join(' · '))}</span></footer></div>`;
  }

  function renderPreview(){
    if(!activeProject)return;$('preview').innerHTML=siteMarkup(activeProject);$('previewTemplateLabel').textContent=templates[activeProject.template]?.name||'Moderna';$('projectStatusText').textContent=activeProject.published?'Publicado':'Borrador guardado';
  }

  function scheduleSave(){
    if(!activeProject)return;activeProject.updatedAt=new Date().toISOString();setAutosave('Guardando…');clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{upsertLocalProject(activeProject);await saveCloud(activeProject);setAutosave('Guardado');}catch(err){console.error(err);setAutosave('Guardado local');}},450);
  }

  function syncField(id,key=id){
    const el=$(id);el.addEventListener('input',()=>{activeProject[key]=el.value;if(id==='businessName'){$('editorProjectTitle').textContent=el.value||'Nueva página';if(!activeProject.slug||activeProject.slug===slugify(activeProject.name))activeProject.slug=slugify(el.value);renderUploads();}if(id==='primaryColor')$('primaryHex').value=el.value;if(id==='secondaryColor')$('secondaryHex').value=el.value;renderPreview();scheduleSave();});
  }

  function openProject(p){activeProject=JSON.parse(JSON.stringify(p));localStorage.setItem(ACTIVE_KEY,activeProject.id);showView('editor');loadProjectToForm();}
  function newProject(){const p=defaults();upsertLocalProject(p);openProject(p);showToast('Nuevo proyecto creado');}
  async function duplicateProject(p){const copy=JSON.parse(JSON.stringify(p));copy.id=crypto.randomUUID?crypto.randomUUID():'p-'+Date.now();copy.name=(p.name||'Proyecto')+' - Copia';copy.slug=slugify(copy.name);copy.published=false;copy.createdAt=copy.updatedAt=new Date().toISOString();upsertLocalProject(copy);if(user)await saveCloud(copy);await renderDashboard();showToast('Proyecto duplicado');}

  async function fileToDataUrl(file){return new Promise((resolve,reject)=>{if(!file){resolve('');return;}if(file.size>4*1024*1024){reject(new Error('La imagen supera 4 MB.'));return;}const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}

  function generatedDocument(p){
    const previewCSS=[...document.styleSheets].find(s=>s.href&&s.href.includes('style.css'));
    let css='';try{css=[...previewCSS.cssRules].map(r=>r.cssText).filter(t=>t.includes('.generated-site')||t.includes('.gs-')||t.startsWith('@media')).join('\n');}catch{}
    if(!css)css='body{margin:0;font-family:Arial,sans-serif}.generated-site{--p:#2563eb;--s:#0f172a;color:#111827}.gs-nav,.gs-footer{padding:20px}.gs-hero,.gs-services{padding:40px}.gs-card{border:1px solid #ddd;padding:16px;margin:8px 0}';
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(p.description)}"><title>${escapeHtml(p.name)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif}${css}</style></head><body>${siteMarkup(p,true)}</body></html>`;
  }

  function exportHtml(){
    const blob=new Blob([generatedDocument(activeProject)],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${slugify(activeProject.name)}.html`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('Página HTML descargada');
  }

  async function publishProject(){
    if(!activeProject)return;activeProject.slug=slugify(activeProject.slug||activeProject.name);$('slug').value=activeProject.slug;
    if(!supabaseClient){showToast('Configura Supabase para publicar. El HTML sí se puede descargar.');showView('account');return;}
    if(!user){showToast('Inicia sesión para publicar.');showView('account');return;}
    activeProject.published=true;activeProject.updatedAt=new Date().toISOString();upsertLocalProject(activeProject);
    try{await saveCloud(activeProject);renderPreview();showToast(`Publicado como ${activeProject.slug}`);}catch(err){console.error(err);activeProject.published=false;showToast('No se pudo publicar. Revisa Supabase.');}
  }

  async function login(signup=false){
    if(!supabaseClient){$('authStatus').textContent='Supabase no está disponible. Revisa config.js.';return;}
    const email=$('authEmail').value.trim(),password=$('authPassword').value;
    if(!/^\S+@\S+\.\S+$/.test(email)||password.length<6){$('authStatus').textContent='Ingresa un correo válido y una contraseña de al menos 6 caracteres.';return;}
    $('authStatus').textContent='Procesando…';
    const method=signup?'signUp':'signInWithPassword';
    const {data,error}=await supabaseClient.auth[method]({email,password});
    if(error){$('authStatus').textContent=error.message;return;}
    if(signup&&!data.session){
      user=null;
      $('authStatus').textContent='Cuenta creada. Revisa tu correo y confirma la cuenta; después inicia sesión.';
      updateAuthUI();return;
    }
    user=data.session?.user||null;
    if(user)await claimGuestProjects();
    $('authStatus').textContent='Sesión iniciada. Tus proyectos se sincronizan con esta cuenta.';
    updateAuthUI();await renderDashboard();
  }

  // Global navigation
  $$('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  $$('[data-action="new-project"]').forEach(b=>b.addEventListener('click',newProject));
  $('backDashboard').addEventListener('click',()=>showView('dashboard'));
  $('menuBtn').addEventListener('click',()=>$('sidebar').classList.add('open'));$('mobileClose').addEventListener('click',()=>$('sidebar').classList.remove('open'));
  $('projectSearch').addEventListener('input',renderDashboard);

  $('projectGrid').addEventListener('click',async e=>{const card=e.target.closest('[data-project-id]'),btn=e.target.closest('[data-card-action]');if(!card||!btn)return;const list=await allProjects(),p=list.find(x=>x.id===card.dataset.projectId);if(!p)return;if(btn.dataset.cardAction==='edit')openProject(p);if(btn.dataset.cardAction==='duplicate')duplicateProject(p);if(btn.dataset.cardAction==='delete'){if(!confirm(`¿Eliminar "${p.name}"?`))return;deleteLocalProject(p.id);await deleteCloud(p.id);renderDashboard();showToast('Proyecto eliminado');}});

  ['businessName','tagline','description','category','slug','primaryColor','secondaryColor','phone','instagram','facebook','location','ctaText'].forEach(id=>syncField(id,id==='businessName'?'name':id));
  $('slug').addEventListener('blur',()=>{activeProject.slug=slugify($('slug').value);$('slug').value=activeProject.slug;renderPreview();scheduleSave();});
  [['primaryHex','primaryColor'],['secondaryHex','secondaryColor']].forEach(([hex,color])=>{$(hex).addEventListener('change',()=>{if(!validHex($(hex).value)){showToast('Usa un color hexadecimal como #2563eb');$(hex).value=activeProject[color];return;}activeProject[color]=$(hex).value;$(color).value=$(hex).value;renderPreview();scheduleSave();});});

  $('templatePicker').addEventListener('click',e=>{const b=e.target.closest('[data-template]');if(!b)return;activeProject.template=b.dataset.template;renderTemplatePicker();renderPreview();scheduleSave();});
  $$('.step-tab').forEach(b=>b.addEventListener('click',()=>{$$('.step-tab').forEach(x=>x.classList.toggle('active',x===b));$$('.editor-tab').forEach(p=>p.classList.toggle('active',p.dataset.editorPanel===b.dataset.editorTab));}));
  $$('.device-btn').forEach(b=>b.addEventListener('click',()=>{$$('.device-btn').forEach(x=>x.classList.toggle('active',x===b));$('previewShell').className='preview-shell '+b.dataset.device;}));

  $('addItemBtn').addEventListener('click',()=>{if(activeProject.items.length>=9){showToast('Máximo 9 elementos por página.');return;}activeProject.items.push({title:'Nuevo servicio',text:'Describe este producto o servicio.',price:''});renderItemsEditor();renderPreview();scheduleSave();});
  $('itemsEditor').addEventListener('input',e=>{const row=e.target.closest('[data-item-index]');if(!row||!e.target.dataset.itemField)return;activeProject.items[Number(row.dataset.itemIndex)][e.target.dataset.itemField]=e.target.value;renderPreview();scheduleSave();});
  $('itemsEditor').addEventListener('click',e=>{const b=e.target.closest('[data-remove-item]');if(!b)return;if(activeProject.items.length<=1){showToast('Debe quedar al menos un elemento.');return;}activeProject.items.splice(Number(b.dataset.removeItem),1);renderItemsEditor();renderPreview();scheduleSave();});

  async function handleImage(id,key){try{const file=$(id).files[0];if(!file)return;activeProject[key]=await fileToDataUrl(file);renderUploads();renderPreview();scheduleSave();}catch(err){showToast(err.message||'No se pudo cargar la imagen.');}finally{$(id).value='';}}
  $('logoInput').addEventListener('change',()=>handleImage('logoInput','logo'));$('heroImageInput').addEventListener('change',()=>handleImage('heroImageInput','heroImage'));
  $('removeLogo').addEventListener('click',()=>{activeProject.logo='';renderUploads();renderPreview();scheduleSave();});$('removeHeroImage').addEventListener('click',()=>{activeProject.heroImage='';renderUploads();renderPreview();scheduleSave();});

  $('exportBtn').addEventListener('click',exportHtml);$('publishBtn').addEventListener('click',publishProject);$('duplicateBtn').addEventListener('click',()=>duplicateProject(activeProject));
  $('loginBtn').addEventListener('click',()=>login(false));$('signupBtn').addEventListener('click',()=>login(true));$('logoutBtn').addEventListener('click',async()=>{if(supabaseClient)await supabaseClient.auth.signOut();user=null;updateAuthUI();showToast('Sesión cerrada');});

  async function boot(){
    migrateLegacyLocal();renderTemplatePicker();await initSupabase();let projects=getLocalProjects();if(!projects.length){const p=defaults();upsertLocalProject(p);projects=[p];}renderDashboard();updateAuthUI();
  }
  boot();
})();
