import {EVENT_DATE,PLANT,PLACES,ROUTE,LEVELS,integrate,sourceWind,toCompass,closestToRoute,validateSnapshot} from './trajectory.js';

const el=id=>document.getElementById(id);
const state={snapshot:null,model:'',release:12,duration:8,enabled:new Set(LEVELS.map(x=>x.key)),layers:[],map:null,routeLayer:null};
const formatDate=(iso,withYear=false)=>iso?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric', ...(withYear?{year:'numeric'}:{}),hour:'numeric',minute:'2-digit'}).format(new Date(iso))+' CST':'—';
const escapeText=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const miles=km=>`${(km/1.609344).toFixed(1)} mi`;
const mph=kmh=>`${(kmh/1.609344).toFixed(1)} mph`;

function makeMap(){
  if(typeof L==='undefined'){el('map-fallback').hidden=false;return;}
  const map=L.map('map',{zoomControl:false,scrollWheelZoom:false,preferCanvas:true}).setView([41.30,-91.35],8);
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
    maxZoom:17,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);
  L.polyline(ROUTE.map(p=>[p.lat,p.lon]),{color:'#041e2d',weight:11,opacity:.94}).addTo(map);
  L.polyline(ROUTE.map(p=>[p.lat,p.lon]),{color:'#57dcd7',weight:4.5,opacity:.95,dashArray:'7,4'}).bindPopup('<b>Approximate travel geography</b><br>CID → I-380 → I-80 → Davenport; NOT turn-by-turn road geometry').addTo(map);
  L.circleMarker([PLANT.lat,PLANT.lon],{radius:9,weight:3,color:'#fff4d4',fillColor:'#ffca75',fillOpacity:1})
    .bindPopup('<b>Iowa Army Ammunition Plant</b><br>Trajectory origin for hypothetical releases.').addTo(map);
  for(const key of ['airport','davenport','iowacity','cedar']){
    const p=PLACES[key];
    L.circleMarker([p.lat,p.lon],{radius:5,color:'#a9f6f0',weight:2,fillColor:'#4ecdc8',fillOpacity:.9})
      .bindTooltip(p.name,{permanent:key==='davenport',direction:'right',offset:[7,0]}).addTo(map);
  }
  state.map=map;
}
function installControls(){
  const levels=el('level-controls');
  for(const level of LEVELS){
    const item=document.createElement('label');item.className='level-check';
    item.innerHTML=`<input type="checkbox" data-level="${level.key}" checked><i class="color-marker" style="background:${level.color}"></i> ${escapeText(level.label)}`;
    item.querySelector('input').addEventListener('change',e=>{
      if(e.target.checked)state.enabled.add(level.key);else state.enabled.delete(level.key);
      render();
    });
    levels.appendChild(item);
  }
  el('release-select').addEventListener('change',e=>{state.release=Number(e.target.value);render();});
  el('duration-range').addEventListener('input',e=>{state.duration=Number(e.target.value);el('duration-label').textContent=`${state.duration} ${state.duration===1?'hour':'hours'}`;render();});
  el('model-select').addEventListener('change',e=>{state.model=e.target.value;render();});
}
function statusClass(snapshot){
  if(snapshot?.status!=='forecast'||!snapshot.fetched_at_utc)return ['Awaiting forecast','pending'];
  const age=(Date.now()-new Date(snapshot.fetched_at_utc).getTime())/3600000;
  if(age>9)return ['Stale forecast · check timestamp','stale'];
  return ['Forecast inputs available','live'];
}
function renderHeader(){
  const s=state.snapshot;
  const count=Object.keys(s?.models||{}).length;
  const [label,kind]=statusClass(s);
  el('forecast-badge').textContent=label;
  el('forecast-badge').dataset.kind=kind;
  el('model-count').textContent=count?String(count):'0';
  el('updated-at').textContent=s?.fetched_at_utc?formatDate(s.fetched_at_utc):'Pending';
  el('updated-foot').textContent=s?.fetched_at_utc?'Weather data fetched (not a verified model initialization cycle)':'GitHub Actions must run first';
  el('map-label').textContent=`Nov 25 · ${state.release===12?'Hypothetical noon':state.release<12?`${state.release}:00 a.m.`:`${state.release-12}:00 p.m.`} release`;
  if(kind==='stale'){el('error-message').hidden=false;el('error-message').textContent='The last successful weather fetch is more than nine hours old. Treat paths as outdated until the forecast collector completes again.';}
  else{el('error-message').hidden=true;}
}
function render(){
  renderHeader();
  for(const l of state.layers){try{state.map?.removeLayer(l);}catch{}}
  state.layers=[];
  const model=state.snapshot?.models?.[state.model];
  if(!model){el('route-distance').textContent='Unavailable';el('model-readout').textContent='No live forecast from a validated model is available. The static reference diagrams below remain non-live, illustrative analyses.';el('wind-rows').innerHTML='<div class="empty-winds">No verified numerical upper-air winds loaded yet. Run the forecast workflow in GitHub Actions.</div>';return;}
  const metrics=[];
  const winds=[];
  const endpoints=[];
  for(const level of LEVELS){
    const forecast=sourceWind(model,level.key,state.release);
    const traj=integrate(model,level.key,state.release,state.duration);
    if(!forecast){winds.push(`<div class="wind-row"><div><strong>${escapeText(level.label)}</strong></div><div>Unavailable</div><div>—</div></div>`);continue;}
    const towards=(forecast.comingFrom+180)%360;
    winds.push(`<div class="wind-row"><div><strong><i class="color-marker" style="background:${level.color};margin-right:8px"></i>${escapeText(level.label)}</strong><small>${escapeText(level.note)}</small></div><div class="wind-from"><span class="wind-arrow" style="transform:rotate(${towards}deg)">↑</span>${toCompass(forecast.comingFrom)} · ${mph(forecast.speedKmh)}</div><div class="wind-to">${toCompass(towards)} · ${Math.round(towards)}°</div></div>`);
    if(!state.enabled.has(level.key))continue;
    if(traj.points.length>=2){
      const closest=closestToRoute(traj.points);
      metrics.push({level,closest,traj,wind:forecast});
      endpoints.push(traj.points[traj.points.length-1]);
      if(state.map){
        const path=L.polyline(traj.points.map(p=>[p.lat,p.lon]),{color:level.color,weight:4,opacity:.91,dashArray:traj.truncated?'3,7':undefined}).addTo(state.map);
        const last=traj.points[traj.points.length-1];
        path.bindPopup(`<b>${escapeText(level.label)} idealized trajectory</b><br>Release: ${state.release}:00 CST<br>Simulated: ${last.h.toFixed(2)} h<br>Closest geometric approach to approximate driving route: ${miles(closest)}<br><em>Not a lead hazard boundary.</em>`);
        state.layers.push(path);
        const endmark=L.circleMarker([last.lat,last.lon],{radius:5,color:level.color,fillColor:level.color,fillOpacity:1}).addTo(state.map);
        endmark.bindTooltip(`${escapeText(level.short)} +${last.h.toFixed(1)}h${traj.truncated?' · incomplete':''}`);
        state.layers.push(endmark);
      }
    }
  }
  el('wind-rows').innerHTML=winds.join('');
  if(metrics.length){
    const min=Math.min(...metrics.map(m=>m.closest));
    el('route-distance').textContent=miles(min);
    const headline=metrics.map(m=>`${escapeText(m.level.short)}: ${toCompass(m.wind.headingTo)} at ${mph(m.wind.speedKmh)}`).join('<br>');
    const incomplete=metrics.filter(m=>m.traj.truncated).length;
    el('model-readout').innerHTML=`<b>${escapeText(model.name)}</b><br>${headline}<br><br><b>${miles(min)}</b> minimum path-centerline distance to the approximate airport route.${incomplete?`<br><span style="color:#ffcc86">${incomplete} path(s) truncated due to missing wind data or exiting the sampled grid.</span>`:''}`;
  }else{
    el('route-distance').textContent='—';
    el('model-readout').textContent='No wind levels selected, or trajectory data missing. Select one or more available levels.';
  }
}
async function loadForecast(){
  try{
    const r=await fetch('./data/forecast.json',{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const snapshot=await r.json();
    state.snapshot=snapshot;
    try{validateSnapshot(snapshot);}catch{state.snapshot=snapshot;render();return;}
    const names=Object.keys(snapshot.models);
    const selection=el('model-select');
    selection.replaceChildren(...names.map(key=>{
      const opt=document.createElement('option');opt.value=key;opt.textContent=snapshot.models[key].name;return opt;
    }));
    state.model=names.includes(state.model)?state.model:names[0];
    selection.value=state.model;
    render();
  }catch(err){
    el('error-message').hidden=false;
    el('error-message').textContent=`Forecast unavailable: ${err.message}. This page must be served over HTTP(S) (not file://) and needs the scheduled data file.`;
    render();
  }
}
async function loadOfficial(){
  try{
    const r=await fetch('./data/official-status.json',{cache:'no-store'}),s=await r.json();
    el('official-heading').textContent=s.scheduled_date?'Scheduled · '+s.scheduled_date:'Official update pending';
    el('official-text').textContent=s.headline||'No current status verified';
    el('official-link').href=s.source_url||'https://www.army.mil/asc';
    el('official-reviewed').textContent=s.last_verified_note||'Manual verification required';
  }catch{el('official-reviewed').textContent='Official status file could not be loaded';}
  try{
    const r=await fetch('./data/source-watch.json',{cache:'no-store'}),s=await r.json();
    const updated=Array.isArray(s.changed_on_this_check)?s.changed_on_this_check:[];
    el('sources-checked').textContent=s.checked_at_utc?formatDate(s.checked_at_utc):'Monitoring pending';
    el('source-watch-text').textContent=updated.length?`Changed text detected in ${updated.join(', ')}. These changes are UNREVIEWED and must not be interpreted as a safety finding.`:'No page text changes were detected in the last check, or the initial reference has not been established. This is not an environmental all-clear.';
  }catch{el('source-watch-text').textContent='Source-page change watch unavailable; check primary agency links directly.';}
}
makeMap();installControls();render();loadForecast();loadOfficial();
