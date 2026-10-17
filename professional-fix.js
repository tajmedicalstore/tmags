/* TMS professional motion + fixed-header geometry */
(function(){
  const root=document.documentElement;
  const header=document.querySelector('.sticky-header-group');
  function syncHeader(){
    if(!header)return;
    root.style.setProperty('--tms-header-h', header.getBoundingClientRect().height+'px');
  }
  syncHeader();
  window.addEventListener('load',syncHeader,{passive:true});
  window.addEventListener('resize',syncHeader,{passive:true});
  if(window.ResizeObserver && header){ new ResizeObserver(syncHeader).observe(header); }

  const targets=document.querySelectorAll('.anim-fade-up,.glass-box,.glass-card,.category-card,.product-card,.service-card,.review-card,.contact-card,.feature-card,.contact-action,.map-frame,.footer-col');
  targets.forEach((el,i)=>{el.classList.add('tms-reveal'); el.classList.add('tms-delay-'+Math.min((i%4)+1,4));});
  const show=(el)=>el.classList.add('tms-visible');
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){show(e.target);io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -30px 0px'});
    targets.forEach(el=>io.observe(el));
  }else targets.forEach(show);
})();

/* Final interaction reliability patch */
(function(){
  const sync=()=>{
    const h=document.querySelector('.sticky-header-group');
    if(h) document.documentElement.style.setProperty('--tms-header-h', Math.ceil(h.getBoundingClientRect().height)+'px');
  };
  window.addEventListener('load',sync,{passive:true});
  window.addEventListener('resize',sync,{passive:true});
  setTimeout(sync,0); setTimeout(sync,250);

  const oldToggleSidebar=window.toggleSidebar;
  window.toggleSidebar=function(){
    const sb=document.getElementById('sidebar'), ov=document.getElementById('sidebarOverlay');
    if(!sb||!ov){return oldToggleSidebar?.();}
    const opening=!sb.classList.contains('active');
    sb.classList.toggle('active',opening); ov.classList.toggle('active',opening);
    document.body.classList.toggle('tms-sidebar-open',opening);
    if(opening) sync();
  };

  window.toggleNotifDropdown=function(){
    const box=document.getElementById('notifDropdown');
    if(!box)return;
    const opening=!box.classList.contains('active');
    if(opening && typeof window.renderNotificationBell==='function') window.renderNotificationBell();
    box.classList.toggle('active',opening);
    if(opening){
      box.querySelector('.modal-box')?.setAttribute('tabindex','-1');
      box.querySelector('.modal-box')?.focus({preventScroll:true});
    }
  };
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      document.getElementById('searchOverlay')?.classList.remove('active');
      document.getElementById('notifDropdown')?.classList.remove('active');
      document.getElementById('sidebar')?.classList.remove('active');
      document.getElementById('sidebarOverlay')?.classList.remove('active');
      document.body.classList.remove('tms-sidebar-open');
      window.tmsAiClose?.();
    }
  });
})();
