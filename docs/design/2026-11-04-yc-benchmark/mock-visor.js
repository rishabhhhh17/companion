// Visor orb: glass sphere, dark visor band, lights carry state.
function visor(size, state, opts={}){
  const id='v'+Math.random().toString(36).slice(2,7);
  const light = {idle:'#7FB2FF',working:'#7FB2FF',needs:'#FFB547',proven:'#5BE3A1',error:'#FF6B5E',asleep:'#7FB2FF'}[state];
  let lights='';
  if(state==='idle') lights=`<rect x="38" y="47" width="7" height="7" rx="3.5" fill="${light}"/><rect x="55" y="47" width="7" height="7" rx="3.5" fill="${light}"/>`;
  if(state==='working') lights=`<rect x="24" y="48.5" width="52" height="3" rx="1.5" fill="${light}" opacity=".18"/><rect x="44" y="47" width="16" height="6" rx="3" fill="${light}"/><rect x="36" y="48.5" width="6" height="3" rx="1.5" fill="${light}" opacity=".5"/>`;
  if(state==='needs') lights=`<rect x="38" y="46" width="7" height="8" rx="3.5" fill="${light}"/><rect x="55" y="46" width="7" height="8" rx="3.5" fill="${light}"/><circle cx="70" cy="50" r="2" fill="${light}"/>`;
  if(state==='proven') lights=`<path d="M37 47 Q50 57 63 47" stroke="${light}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  if(state==='error') lights=`<rect x="36" y="48.5" width="28" height="4" rx="2" fill="${light}"/>`;
  if(state==='asleep') lights=`<rect x="37" y="50" width="9" height="2.4" rx="1.2" fill="${light}" opacity=".35"/><rect x="54" y="50" width="9" height="2.4" rx="1.2" fill="${light}" opacity=".35"/>`;
  const glow = state==='asleep'?0:.55;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" style="display:block;overflow:visible">
  <defs>
   <radialGradient id="${id}g" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#E4E8EF"/><stop offset=".85" stop-color="#B9C1CE"/><stop offset="1" stop-color="#9AA4B4"/></radialGradient>
   <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2230"/><stop offset="1" stop-color="#0B0F17"/></linearGradient>
   <filter id="${id}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
   <radialGradient id="${id}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  ${opts.shadow!==false?`<ellipse cx="50" cy="96" rx="30" ry="4" fill="url(#${id}s)"/>`:''}
  <circle cx="50" cy="50" r="44" fill="url(#${id}g)"/>
  <circle cx="50" cy="50" r="43.5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1"/>
  <path d="M10 42 Q50 34 90 42 L90 58 Q50 66 10 58 Z" fill="url(#${id}b)"/>
  <g filter="url(#${id}f)" opacity="${glow}">${lights}</g>
  <g>${lights}</g>
  <path d="M14 43.5 Q50 36 86 43.5" stroke="#fff" stroke-opacity=".18" stroke-width="1" fill="none"/>
  <ellipse cx="36" cy="22" rx="12" ry="6" fill="#fff" opacity=".75" transform="rotate(-20 36 22)"/>
  </svg>`;
}
document.querySelectorAll('[data-visor]').forEach(el=>{el.innerHTML=visor(+el.dataset.size||48, el.dataset.visor, {shadow:el.dataset.shadow!=='no'})});
