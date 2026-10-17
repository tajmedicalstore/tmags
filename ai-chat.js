import { FIREBASE_CONFIG } from './firebase-config.js';

(() => {
  const KEY = FIREBASE_CONFIG.apiKey;
  const MODELS = ['gemini-3.8-flash','gemini-2.5-flash','gemini-2.5-flash-lite'];
  let history = [];

  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function siteContext(){
    const d = window.currentSiteData || {};
    const stock = Array.isArray(d.stock) ? d.stock.slice(0,80).map(x=>`${x.name} | ${x.desc||''} | Rs.${x.salePrice||x.price||''} | ${x.stock?'in stock':'out of stock'}`).join('\n') : '';
    const services = Array.isArray(d.services) ? d.services.map(x=>x.title||x.name||'').join(', ') : '';
    return `Taj Medical & General Store, Chak 99 GB Nehang Badala, Jaranwala. Proprietor: Muhammad Pervaiz. No home delivery. Original doctor's prescription is mandatory for antibiotics and sedatives. Services: ${services}. Current stock:\n${stock}`;
  }
  function addMsg(text, who='bot'){
    const box=document.getElementById('tmsAiMessages'); if(!box)return;
    const div=document.createElement('div'); div.className='tms-ai-msg '+who; div.textContent=text; box.appendChild(div); box.scrollTop=box.scrollHeight; return div;
  }
  async function ask(text){
    text=String(text||'').trim(); if(!text)return;
    if(!KEY || KEY.startsWith('YOUR_')){addMsg('AI assistant is not connected yet. Please configure the Firebase/Google AI API key.','bot');return;}
    addMsg(text,'user');
    window.tmsAiLog?.('user', text);
    const typing=addMsg('Thinking…','bot'); typing.classList.add('tms-ai-typing');
    history.push({role:'user',parts:[{text}]});
    try{
      const prompt = `You are the official Taj Medical Store website assistant. Answer briefly and professionally in the same language as the customer. Never diagnose or prescribe medicine. For medicine questions, advise the customer to consult a doctor/pharmacist. Do not invent stock, prices, opening hours, delivery, policies, or contact details. Use only the supplied store context when making store-specific claims. Store context:\n${siteContext()}`;
      const body={system_instruction:{parts:[{text:prompt}]},contents:history.slice(-12),generationConfig:{temperature:.35,maxOutputTokens:500}};
      let data=null, lastError=null;
      for (const model of MODELS) {
        try {
          const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':KEY},body:JSON.stringify(body)});
          data=await res.json();
          if(res.ok) break;
          lastError=new Error(data?.error?.message || `AI request failed (${res.status})`);
        } catch(e){ lastError=e; }
      }
      if(!data || data.error || !data.candidates) throw lastError || new Error('No AI response');
      const answer=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim() || 'Sorry, I could not generate a reply.';
      typing.remove(); addMsg(answer,'bot'); window.tmsAiLog?.('model', answer); history.push({role:'model',parts:[{text:answer}]});
    }catch(err){
      typing.remove(); addMsg('AI is temporarily unavailable. Please check that the Generative Language API is enabled for this Google Cloud project and that this API key is allowed to use it. Live Chat/WhatsApp is still available.','bot');
      console.error('TMS AI error:',err);
      history.pop();
    }
  }
  function open(){document.getElementById('tmsAiPanel')?.classList.add('active');document.getElementById('tmsAiInput')?.focus();}
  function close(){document.getElementById('tmsAiPanel')?.classList.remove('active');}
  window.tmsAiAsk=ask; window.tmsAiOpen=open; window.tmsAiClose=close;
  document.addEventListener('DOMContentLoaded',()=>{
    if(document.getElementById('tmsAiButton'))return;
    const existing=document.getElementById('tmsFloatAi');
    if(!existing){ const b=document.createElement('button');b.id='tmsAiButton';b.title='AI Assistant';b.setAttribute('aria-label','Open AI Assistant');b.innerHTML='<i class="fas fa-wand-magic-sparkles"></i>';b.onclick=open;document.body.appendChild(b); }
    const panel=document.createElement('section');panel.id='tmsAiPanel';panel.setAttribute('aria-label','Taj Medical AI Assistant');panel.innerHTML=`
      <div class="tms-ai-head"><div class="tms-ai-title"><i class="fas fa-wand-magic-sparkles"></i><div><strong>Taj AI Assistant</strong><span>Store information & general help</span></div></div><button class="tms-ai-close" onclick="tmsAiClose()" aria-label="Close"><i class="fas fa-times"></i></button></div>
      <div id="tmsAiMessages"><div class="tms-ai-msg bot">Assalam-o-Alaikum! I can help you find products, store information and guide you to Live Chat. What would you like to know?</div></div>
      <div class="tms-ai-quick"><button onclick="tmsAiAsk('What medicines are currently in stock?')">Current stock</button><button onclick="tmsAiAsk('What are the store rules for prescriptions?')">Prescription rules</button><button onclick="tmsAiAsk('How can I contact the store?')">Contact</button></div>
      <form class="tms-ai-form" onsubmit="event.preventDefault();const i=document.getElementById('tmsAiInput');tmsAiAsk(i.value);i.value='';"><textarea id="tmsAiInput" placeholder="Ask anything…" aria-label="Ask AI"></textarea><button type="submit" aria-label="Send"><i class="fas fa-paper-plane"></i></button></form>`;document.body.appendChild(panel);
  });
})();
