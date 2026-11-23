import {EVENT_DATE,PLANT,PLACES,ROUTE,LEVELS,integrate,sourceWind,toCompass,closestToRoute,validateSnapshot} from './trajectory.js';
import {createTransportOverlay} from './overlay.js';

const el=id=>document.getElementById(id);
const state={snapshot:null,model:'',release:12,duration:8,enabled:new Set(LEVELS.map(x=>x.key)),layers:[],map:null,routeLayer:null,transportOverlay:null,viewKey:'',loadError:''};
const formatDate=(iso,withYear=false)=>iso?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric', ...(withYear?{year:'numeric'}:{}),hour:'numeric',minute:'2-digit'}).format(new Date(iso))+' CST':'—';
const escapeText=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const miles=km=>`${(km/1.609344).toFixed(1)} mi`;
const mph=kmh=>`${(kmh/1.609344).toFixed(1)} mph`;

function makeMap(){
  if(typeof L==='undefined'){el('map-fallback').hidden=false;return;}
  const map=L.map('map',{zoomControl:false,scrollWheelZoom:false,preferCanvas:false}).setView([41.30,-91.35],8);
  L.control.zoom({position:'bottomright'}).addTo(map);
  // OpenStreetMap Standard requires no API key. Only visible tiles are requested.
  const baseTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  });
  let consecutiveTileErrors=0;
  baseTiles.on('tileload',()=>{consecutiveTileErrors=0;el('map-fallback').hidden=true;});
  baseTiles.on('tileerror',()=>{
    if(++consecutiveTileErrors>=3){
      el('map-fallback').hidden=false;
      el('map-fallback').textContent='OpenStreetMap basemap tiles could not load. Check your network or content blocker. Trajectories remain modeled wind paths, not contamination or hazard boundaries.';
    }
  });
  baseTiles.addTo(map);
  // Travel route, site marker and forecast paths are all rendered in the SVG layer.
  state.map=map;
  state.transportOverlay=createTransportOverlay(map,{route:ROUTE,plant:PLANT,places:PLACES});
}
function installControls(){
  const levels=el('level-controls');
  for(const level of LEVELS){
    const item=document.createElement('label');item.className='level-check';
    item.innerHTML=`<input type="checkbox" data-level="${level.key}" checked><i class="color-marker" style="background:${level.color}"></i> ${escapeText(level.label)}`;
    item.querySelector('input').addEventListener('change',e=>{
      if(e.target.checked)state.enabled.add(level.key);else state.enabled.delete(level.key);
      safeRender();
    });
    levels.appendChild(item);
  }
  el('release-select').addEventListener('change',e=>{state.release=Number(e.target.value);safeRender();});
  el('duration-range').addEventListener('input',e=>{state.duration=Number(e.target.value);el('duration-label').textContent=`${state.duration} ${state.duration===1?'hour':'hours'}`;safeRender();});
  el('model-select').addEventListener('change',e=>{state.model=e.target.value;safeRender();});
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
  const issue=state.loadError || (kind==='stale'?'The last successful weather fetch is more than nine hours old. Treat paths as outdated until the forecast collector completes again.':'');
  el('error-message').hidden=!issue;
  el('error-message').textContent=issue;
}
function render(){
  renderHeader();
  for(const l of state.layers){try{state.map?.removeLayer(l);}catch{}}
  state.layers=[];
  const model=state.snapshot?.models?.[state.model];
  const overlayStatus=el('overlay-status');
  if(!model){
    state.transportOverlay?.setTracks([]);
    overlayStatus.textContent=state.loadError ? `Overlay unavailable: ${state.loadError}` : 'Awaiting live wind paths. No forecast overlay is displayed.';el('route-distance').textContent='Unavailable';el('model-readout').textContent='No live forecast from a validated model is available. The static reference diagrams below remain non-live, illustrative analyses.';el('wind-rows').innerHTML='<div class="empty-winds">No verified numerical upper-air winds loaded yet. Run the forecast workflow in GitHub Actions.</div>';return;}
  const metrics=[];
  const winds=[];
  const displayPaths=[];
  const displayTracks=[];
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
      displayPaths.push(...traj.points.map(p=>[p.lat,p.lon]));
      displayTracks.push({points:traj.points,color:level.color,label:level.label,truncated:traj.truncated});
    }
  }
  state.transportOverlay?.setTracks(displayTracks);
  el('wind-rows').innerHTML=winds.join('');
  if(metrics.length){
    // Center the viewport on the trajectories AND the airport corridor.
    // Previously the 8-hour paths could run off-screen at the fixed zoom.
    const viewKey=[state.snapshot?.fetched_at_utc,state.model,state.release,state.duration,[...state.enabled].sort().join(',')].join('|');
    if(state.map && viewKey!==state.viewKey && displayPaths.length){
      try {
        state.map.invalidateSize({pan:false});
        const locations=[...displayPaths, ...ROUTE.map(p=>[p.lat,p.lon]), [PLANT.lat,PLANT.lon]];
        state.map.fitBounds(L.latLngBounds(locations),{padding:[25,25],maxZoom:8,animate:false});
        state.viewKey=viewKey;
      } catch(err){
        console.error('Could not frame wind trajectories',err);
      }
    }
    const incomplete=metrics.filter(m=>m.traj.truncated).length;
    overlayStatus.textContent=`${metrics.length} forecast air-parcel path${metrics.length===1?'':'s'} plotted for ${model.name} (${state.release}:00 CST, ${state.duration}h).${incomplete?` ${incomplete} shortened due to missing/out-of-grid winds.`:''} Wind paths only — not a lead plume or deposition estimate.`;
    const min=Math.min(...metrics.map(m=>m.closest));
    el('route-distance').textContent=miles(min);
    const headline=metrics.map(m=>`${escapeText(m.level.short)}: ${toCompass(m.wind.headingTo)} at ${mph(m.wind.speedKmh)}`).join('<br>');
    el('model-readout').innerHTML=`<b>${escapeText(model.name)}</b><br>${headline}<br><br><b>${miles(min)}</b> minimum path-centerline distance to the approximate airport route.${incomplete?`<br><span style="color:#ffcc86">${incomplete} path(s) truncated due to missing wind data or exiting the sampled grid.</span>`:''}`;
  }else{
    overlayStatus.textContent='No trajectories for this selection. Check the available wind levels, time, and forecast timestamp.';
    el('route-distance').textContent='—';
    el('model-readout').textContent='No wind levels selected, or trajectory data missing. Select one or more available levels.';
  }
}
async function loadForecast(){
  try{
    const r=await fetch('./data/forecast.json',{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const snapshot=await r.json();
    validateSnapshot(snapshot);
    state.snapshot=snapshot;
    state.loadError='';
    const names=Object.keys(snapshot.models);
    const selection=el('model-select');
    selection.replaceChildren(...names.map(key=>{
      const opt=document.createElement('option');opt.value=key;opt.textContent=snapshot.models[key].name;return opt;
    }));
    state.model=names.includes(state.model)?state.model:names[0];
    selection.value=state.model;
    safeRender();
  }catch(err){
    state.loadError=`Forecast unavailable: ${err.message}. Check the published data/forecast.json, network connection, and developer console.`;
    state.snapshot=null;
    state.viewKey='';
    safeRender();
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
    const failures=Object.keys(s.fetch_errors||{});
    const notices=[];
    if(updated.length)notices.push(`Changed text detected in ${updated.join(', ')}. These changes are UNREVIEWED, not confirmed safety findings.`);
    else notices.push('No changes detected in the accessible source pages on this check. This is not an environmental all-clear.');
    if(failures.length)notices.push(`INCOMPLETE CHECK: ${failures.join(', ')} could not be accessed. Please use the official agency links directly.`);
    el('source-watch-text').textContent=notices.join(' ');
  }catch{el('source-watch-text').textContent='Source-page change watch unavailable; check primary agency links directly.';}
}
function safeRender(){
  try { render(); }
  catch(err){
    console.error('Wind-path overlay rendering failed:',err);
    state.loadError=`Wind-path drawing failed: ${err?.message||'Unknown error'}`;
    renderHeader();
    el('overlay-status').textContent=state.loadError;
  }
}
makeMap();installControls();safeRender();loadForecast();loadOfficial();
// A tab left open picks up newly published snapshots without a page reload.
setInterval(()=>{loadForecast();loadOfficial();},5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadForecast();loadOfficial();}});
