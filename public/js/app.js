import {PLANT,LEVELS,integrate,sourceWind,toCompass,validateSnapshot,localHour} from './trajectory.js?v=ntnt-8';
import {createTransportOverlay,clockAt,usDate} from './overlay.js?v=ntnt-9';
import {inspectNearestTrack,formatElapsed} from './inspect.js';
import {createSamplingView,EVENT} from './sampling.js?v=1';

const el=id=>document.getElementById(id);
// Prefer GFS’s full set of wind levels, regardless of snapshot key order.
const MODEL_ORDER=['gfs','rrfs','ecmwf'];
const state={selectedDate:'',archiveOn:el('forecast').dataset.archiveOn||null,snapshot:null,model:'',release:EVENT.hour,duration:8,officialDuration:8,enabled:new Set(LEVELS.map(x=>x.key)),map:null,transportOverlay:null,displayTracks:[],elapsed:4,extended:null,viewKey:'',loadError:'',view:'sampling',get scenarioDate(){return this.selectedDate||EVENT.date;},get eventPinned(){return !this.selectedDate&&this.release===EVENT.hour;}};
const centralTimestamp=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'2-digit',day:'2-digit',year:'2-digit',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const formatDate=iso=>iso?centralTimestamp.format(new Date(iso)):'—';
const shortDate=date=>date?usDate.format(new Date(date+'T00:00:00Z')):'—';
const chicagoToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const activeSnapshot=()=>state.snapshot?.event_date===EVENT.date ? state.snapshot : null;
const modelHasWind=(model,date,hour)=>Boolean(date && model?.available_levels?.some(key=>sourceWind(model,key,hour,date)));

const escapeText=str=>String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const miles=km=>`${(km/1.609344).toFixed(1)} mi`;
const mph=kmh=>`${(kmh/1.609344).toFixed(1)} mph`;
let timelineTimer=null;
function horizonTrack(model,key){
  const near=integrate(model,key,state.release,state.duration,state.scenarioDate);
  if(state.duration<=8)return near;
  const extended=state.extended;
  if(extended?.status==='extended-trajectory' &&
     extended.event_date===state.scenarioDate && extended.source_snapshot_utc===state.snapshot?.fetched_at_utc){
    const candidate=extended.paths?.[state.model]?.[String(state.release)]?.[key];
    if(candidate?.points?.length>=2 && Number.isFinite(candidate.hours_reached)){
      return {...candidate,points:candidate.points.filter(p=>p.h<=state.duration+1e-7),
               truncated:candidate.hours_reached+1e-7<state.duration};
    }
  }
  return near;
}
function pauseTimeline(){
  if(timelineTimer!==null){clearInterval(timelineTimer);timelineTimer=null;}
  const play=el('timeline-play');
  if(play){play.textContent='▶ Play';play.setAttribute('aria-label','Play time progression');}
}
function updateTimeline(){
  state.elapsed=Math.max(0,Math.min(state.duration,state.elapsed));
  const control=el('timeline-slider');
  if(!control)return;
  control.max=String(state.duration);
  control.value=String(state.elapsed);
  control.setAttribute('aria-valuetext',`+${state.elapsed} hours; ${clockAt(state.release,state.elapsed,state.scenarioDate)}`);
  const value=state.elapsed===Math.round(state.elapsed)?state.elapsed.toFixed(0):state.elapsed.toFixed(2).replace(/0$/,'');
  el('timeline-clock').textContent=`+${value}h · ${clockAt(state.release,state.elapsed,state.scenarioDate)}`;
  const marks=[0];
  for(let i=2;i<state.duration;i+=2)marks.push(i);
  if(marks.at(-1)!==state.duration)marks.push(state.duration);
  const ticks=el('timeline-ticks');
  ticks.replaceChildren(...marks.map(hour=>{
    const span=document.createElement('span');span.textContent='+'+hour+'h';return span;
  }));
  state.transportOverlay?.setElapsed(state.elapsed);
  state.hoverInspector?.hide();
}
function installTimeline(){
  el('timeline-slider').addEventListener('input',event=>{
    pauseTimeline();
    state.elapsed=Number(event.target.value);
    updateTimeline();
  });
  el('timeline-play').addEventListener('click',()=>{
    if(timelineTimer!==null){pauseTimeline();return;}
    if(state.elapsed>=state.duration-1e-7)state.elapsed=0;
    updateTimeline();
    el('timeline-play').textContent='Ⅱ Pause';
    el('timeline-play').setAttribute('aria-label','Pause time progression');
    timelineTimer=setInterval(()=>{
      state.elapsed=Math.min(state.duration,state.elapsed+(state.duration>24?1:state.duration>8?.5:.25));
      updateTimeline();
      if(state.elapsed>=state.duration-1e-7)pauseTimeline();
    },400);
  });
  updateTimeline();
}


/** Hover uses nearest *modeled* air-parcel segment, never a contamination edge. */
function createHoverInspector(map){
  const root=map.getContainer();
  const panel=document.createElement('div');
  panel.id='track-inspect';
  panel.className='track-inspect';
  panel.hidden=true;
  panel.setAttribute('role','status');
  const pointer=document.createElement('div');
  pointer.className='track-inspect-pin';
  pointer.hidden=true;
  root.append(panel,pointer);
  function hide(){panel.hidden=true;pointer.hidden=true;}
  function examine(event){
    if(state.view!=='wind')return;
    if(event.pointerType==='touch'&&event.type==='pointermove')return;
    const box=root.getBoundingClientRect();
    const x=event.clientX-box.left,y=event.clientY-box.top;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>box.width||y>box.height){hide();return;}
    const hit=inspectNearestTrack(state.displayTracks,
      p=>map.latLngToContainerPoint([p.lat,p.lon]),x,y,18);
    if(!hit){hide();return;}
    const color=String(hit.color||'#a1e7df');
    const distance=miles(hit.pathDistanceKm),fromOrigin=miles(hit.directDistanceKm);
    const when=clockAt(state.release,hit.elapsedHours,state.scenarioDate);
    const future=hit.elapsedHours>state.elapsed+.05;
    panel.innerHTML=
      '<div class="inspect-heading"><span class="inspect-dot" ></span>'+
      escapeText(hit.label||hit.levelKey||'Wind trajectory')+
      '<span class="inspect-phase">'+(future?'Later forecast':'Up to selected time')+'</span></div>'+
      '<strong class="inspect-elapsed">'+formatElapsed(hit.elapsedHours)+'</strong>'+
      '<div class="inspect-clock">'+escapeText(when)+'</div>'+
      '<div class="inspect-metrics"><span>Along modeled path</span><b>'+distance+'</b>'+
      '<span>From release point</span><b>'+fromOrigin+'</b></div>'+
      '<p>Single modeled air parcel · not a plume or lead exposure estimate</p>';
    panel.hidden=false;
    pointer.hidden=false;
    pointer.style.left=hit.x+'px';
    pointer.style.top=hit.y+'px';
    pointer.style.borderColor=color;
    panel.querySelector('.inspect-dot').style.backgroundColor=color;
    const panelWidth=244,panelHeight=175;
    panel.style.left=Math.round(Math.max(8,Math.min(x+17,box.width-panelWidth-8)))+'px';
    panel.style.top=Math.round(y>box.height-panelHeight-15?Math.max(6,y-panelHeight-14):Math.max(6,y+15))+'px';
  }
  root.addEventListener('pointermove',examine);
  root.addEventListener('pointerleave',hide);
  root.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch'){
      // A tap near a line opens the same inspector on tablets/phones.
      examine(event);
    }
  });
  map.on('movestart zoomstart',hide);
  return {hide,element:panel};
}
function makeMap(){
  if(typeof L==='undefined'){el('map-fallback').hidden=false;return;}
  const map=L.map('map',{zoomControl:false,scrollWheelZoom:true,preferCanvas:false}).setView([PLANT.lat,PLANT.lon],8);
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
      el('map-fallback').textContent='OpenStreetMap basemap tiles could not load. Readings or wind paths may still be available.';
    }
  });
  baseTiles.addTo(map);
  state.map=map;
  state.transportOverlay=createTransportOverlay(map,PLANT);
  state.hoverInspector=createHoverInspector(map);
}
function installControls(){
  const levels=el('level-controls');
  for(const level of LEVELS){
    const item=document.createElement('label');item.className='level-check';
    item.innerHTML=`<input type="checkbox" data-level="${level.key}" checked><i class="color-marker" data-level="${level.key}"></i> <span>${escapeText(level.label)}<small class="level-unavailable" hidden></small></span>`;
    item.querySelector('input').addEventListener('change',e=>{
      if(e.target.checked)state.enabled.add(level.key);else state.enabled.delete(level.key);
      safeRender();
    });
    item.querySelector('.color-marker').style.backgroundColor=level.color;
    levels.appendChild(item);
  }
  el('date-select').addEventListener('change',e=>{
    pauseTimeline();state.selectedDate=e.target.value;
    state.duration=state.selectedDate?8:state.officialDuration;
    updateModelOptions();safeRender();
  });
  el('release-select').addEventListener('change',e=>{pauseTimeline();state.release=Number(e.target.value);updateModelOptions();safeRender();});
  el('reset-wind').addEventListener('click',()=>{
    pauseTimeline();state.release=EVENT.hour;state.selectedDate='';state.duration=state.officialDuration;
    el('release-select').value=String(EVENT.hour);updateDateOptions();updateModelOptions();safeRender();
  });
  el('horizon-select').addEventListener('change',e=>{
    pauseTimeline();
    state.duration=Number(e.target.value);
    state.officialDuration=state.duration;
    state.elapsed=state.duration;
    safeRender();
  });
  el('model-select').addEventListener('change',e=>{state.model=e.target.value;safeRender();});
}
function installMapViews(sampling){
  const tabs=[...document.querySelectorAll('.map-tabs [data-view]')];
  const panels=[...document.querySelectorAll('[data-map-view]')];
  function select(tab){
    pauseTimeline();state.hoverInspector?.hide();state.view=tab.dataset.view;
    const wind=state.view==='wind';
    for(const item of tabs){item.setAttribute('aria-selected',String(item===tab));item.tabIndex=item===tab?0:-1;}
    for(const panel of panels)panel.hidden=panel.dataset.mapView!==state.view;
    el('map-view').setAttribute('aria-labelledby',tab.id);
    el('map').setAttribute('aria-label',wind?'Map of modeled wind trajectories':'Map of EPA air monitoring stations');
    document.querySelector('.forecast-layout').dataset.activeView=state.view;
    sampling.show(!wind);
    if(wind){
      state.viewKey='';
      state.map?.setView([PLANT.lat,PLANT.lon],8,{animate:false});
      safeRender();
    }
  }
  for(const tab of tabs){
    tab.addEventListener('click',()=>{if(tab.dataset.view!==state.view)select(tab);});
    tab.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();
      const next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs.find(other=>other!==tab);
      if(tab!==next)select(next);
      next.focus();
    });
  }
  tabs[0].parentElement.hidden=false;
  select(tabs[0]);
}
function renderLevelControls(model){
  const supported=new Set(model?.available_levels??[]);
  for(const input of el('level-controls').querySelectorAll('input[data-level]')){
    const unavailable=!supported.has(input.dataset.level);
    input.disabled=unavailable;
    input.checked=!unavailable&&state.enabled.has(input.dataset.level);
    const note=input.closest('label').querySelector('.level-unavailable');
    note.hidden=!model||!unavailable;
    note.textContent=note.hidden?'':'Not provided';
  }
}
function scenarioArchived(){return Boolean(state.archiveOn && chicagoToday()>=state.archiveOn);}
function renderHeader(){
  const s=activeSnapshot();
  const fetched=s?.models?.[state.model]?.fetched_at_utc||s?.fetched_at_utc;
  const count=Object.values(s?.models||{}).filter(model=>modelHasWind(model,state.scenarioDate,state.release)).length;
  el('model-count').textContent=count?String(count):'0';
  el('updated-at').textContent=fetched?formatDate(fetched):'Pending';
  el('updated-foot').textContent=fetched?'Selected model download time, not model initialization':'Waiting for forecast data for this scenario';
  const day=shortDate(state.scenarioDate);
  el('event-date').textContent=day;
  el('release-date').textContent=state.scenarioDate?`${day} · CT`:'Central time';
  el('map-label').textContent=state.eventPinned?`${day} · ~9:00 a.m. CST`:`${clockAt(state.release,0,state.scenarioDate)} · Hypothetical start`;
  el('event-date-note').textContent=state.eventPinned?'Reported detonation date':'Hypothetical start date';
  el('timeline-start').textContent=state.eventPinned?'TIME AFTER REPORTED DETONATION':'TIME AFTER HYPOTHETICAL START';
  const stale=s?.status==='forecast'&&s.fetched_at_utc&&state.model&&!scenarioArchived()&&(Date.now()-new Date(fetched).getTime())/3600000>9;
  const issue=state.loadError || (!s && state.snapshot?'No wind forecast is available for the current scenario. Paths from the earlier date are not shown.':stale?'This model’s last download is more than nine hours old. Its paths may be outdated.':'');
  el('error-message').hidden=!issue;
  el('error-message').textContent=issue;
  el('horizon-select').value=String(state.duration);
  el('horizon-select').disabled=Boolean(state.selectedDate);
  el('horizon-help').textContent=state.selectedDate?'Alternate dates: local only':'longer = less certain';
}
function render(){
  renderHeader();
  const model=activeSnapshot()?.models?.[state.model];
  renderLevelControls(model);
  const overlayStatus=el('overlay-status');
  if(!model){
    state.displayTracks=[];
    state.hoverInspector?.hide();
    state.transportOverlay?.setTracks([],{scenarioDate:state.scenarioDate,elapsedHours:state.elapsed,releaseHour:state.release});
    el('spread-legend').hidden=true;
    updateTimeline();
    el('long-range-warning').hidden=true;
    overlayStatus.textContent=state.loadError ? `Overlay unavailable: ${state.loadError}` : 'No forecast wind paths are available for this date and time.';el('model-readout').textContent='No validated forecast is available for this date and time.';el('wind-rows').innerHTML='<div class="empty-winds">No verified numerical upper-air winds loaded yet.</div>';return;}
  const metrics=[];
  const winds=[];
  const displayPaths=[];
  const displayTracks=[];
  for(const level of LEVELS){
    const forecast=sourceWind(model,level.key,state.release,state.scenarioDate);
    const traj=horizonTrack(model,level.key);
    if(!forecast){winds.push(`<div class="wind-row"><div><strong>${escapeText(level.label)}</strong></div><div>${model.available_levels.includes(level.key)?'Unavailable at this time':'Not provided'}</div><div>—</div></div>`);continue;}
    const towards=(forecast.comingFrom+180)%360;
    winds.push(`<div class="wind-row"><div><strong><i class="color-marker" data-level="${level.key}"></i>${escapeText(level.label)}</strong><small>${escapeText(level.note)}</small></div><div class="wind-from"><span class="wind-arrow"  aria-hidden="true">${['↑','↗','→','↘','↓','↙','←','↖'][Math.round(towards/45)%8]}</span>${toCompass(forecast.comingFrom)} · ${mph(forecast.speedKmh)}</div><div class="wind-to">${toCompass(towards)} · ${Math.round(towards)}°</div></div>`);
    if(!state.enabled.has(level.key))continue;
    if(traj.points.length>=2){
      metrics.push({level,traj,wind:forecast});
      displayPaths.push(...traj.points.map(p=>[p.lat,p.lon]));
      displayTracks.push({key:level.key,points:traj.points,color:level.color,label:level.label,truncated:traj.truncated});
    }
  }
  state.displayTracks=displayTracks;
  state.hoverInspector?.hide();
  // Compare the same 10 m level, using only the local grid, even in the regional view.
  const spreadTracks=displayTracks.some(t=>t.key==='10m')?Object.entries(activeSnapshot().models).map(([id,member])=>({
    model:id,points:integrate(member,'10m',state.release,8,state.scenarioDate).points
  })).filter(track=>track.points.length>=2):[];
  state.transportOverlay?.setTracks(displayTracks,{scenarioDate:state.scenarioDate,elapsedHours:state.elapsed,releaseHour:state.release,spreadTracks});
  updateTimeline();
  el('wind-rows').innerHTML=winds.join('');
  if(metrics.length){
    // Reframe on scenario changes, not on every scrub or background refresh.
    const matchedExtended=state.duration>8&&state.extended?.event_date===state.scenarioDate&&state.extended?.source_snapshot_utc===state.snapshot.fetched_at_utc;
    const viewKey=[state.scenarioDate,state.model,state.release,state.duration,matchedExtended].join('|');
    if(state.map && viewKey!==state.viewKey && displayPaths.length){
      try {
        state.map.invalidateSize({pan:false});
        const band=state.transportOverlay.svg.querySelector('.model-spread-band');
        const sharedHours=Number(band?.dataset.hours||0);
        const spreadPositions=spreadTracks.flatMap(t=>t.points.filter(p=>p.h<=sharedHours).map(p=>[p.lat,p.lon]));
        state.map.fitBounds(L.latLngBounds([...displayPaths,...spreadPositions]),{padding:[30,34],maxZoom:10,animate:false});
        state.viewKey=viewKey;
      } catch(err){
        console.error('Could not frame wind trajectories',err);
      }
    }

    const incomplete=metrics.filter(m=>m.traj.truncated||m.traj.points.at(-1).h+1e-7<state.duration).length;
    const reached=Math.max(...metrics.map(m=>m.traj.points.at(-1).h));
    const longInfo=state.duration>8
      ?(state.extended?.source_snapshot_utc===state.snapshot?.fetched_at_utc
         ?' Extended paths use coarse (~2°) regional wind interpolation; uncertainty grows significantly after 8 hours.'
         :' Regional model data have not matched the current local forecast snapshot; paths end where known winds end.')
      :'';
    el('long-range-warning').textContent=state.duration>8
      ?(`${incomplete} of ${metrics.length} paths end before +${state.duration}h. Longest available track: +${reached}h.`+longInfo)
      :'';
    el('long-range-warning').hidden=state.duration<=8;

    overlayStatus.textContent=`${metrics.length} modeled air-parcel path${metrics.length===1?'':'s'} displayed for ${model.name} (+${state.duration}h selection).${incomplete?` ${incomplete} stop before the selected horizon.`:''} No lead concentrations or deposition estimates.`;
    const headline=metrics.map(m=>`${escapeText(m.level.short)}: ${toCompass(m.wind.headingTo)} at ${mph(m.wind.speedKmh)}`).join('<br>');
    el('model-readout').innerHTML=`<b>${escapeText(model.name)}</b><br>${headline}${incomplete?`<br><span class="readout-warning">${incomplete} path(s) truncated due to missing wind data or exiting the sampled grid.</span>`:''}`;
  }else{
    el('long-range-warning').hidden=true;
    overlayStatus.textContent='No trajectories for this selection. Check the available wind levels, time, and forecast timestamp.';
    el('model-readout').textContent='No wind levels selected, or trajectory data missing. Select one or more available levels.';
  }
  const band=state.transportOverlay?.svg.querySelector('.model-spread-band');
  el('spread-legend').hidden=!band;
  if(band){
    const models=band.dataset.models.split(',').map(key=>({gfs:'GFS',rrfs:'RRFS',ecmwf:'ECMWF'}[key]||activeSnapshot().models[key].name));
    el('spread-coverage').textContent=`${models.join(' / ')} · first ${band.dataset.hours} h`;
  }
}
async function loadForecast(){
  try{
    const r=await fetch('/data/forecast.json',{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const snapshot=await r.json();
    validateSnapshot(snapshot);
    state.snapshot=snapshot;
    state.loadError='';
    updateDateOptions();
    updateModelOptions();
    safeRender();
  }catch(err){
    state.loadError=`Forecast unavailable: ${err.message}.`;
    state.snapshot=null;
    state.viewKey='';
    updateDateOptions();
    updateModelOptions();
    safeRender();
  }
}
function updateDateOptions(){
  const snapshot=activeSnapshot();
  const today=chicagoToday(),dates=[];
  if(snapshot?.explore_through && !scenarioArchived()){
    for(let offset=0;offset<=5;offset++){
      const date=localHour(today,offset*24).slice(0,10);
      if(date>snapshot.explore_through || date===EVENT.date)continue;
      if(Object.values(snapshot.models).some(model=>[9,12,15].some(hour=>modelHasWind(model,date,hour))))dates.push(date);
    }
  }
  if(state.selectedDate && !dates.includes(state.selectedDate)){
    pauseTimeline();state.selectedDate='';state.duration=state.officialDuration;
  }
  const selector=el('date-select');
  const current=`${shortDate(EVENT.date)} · Detonation date`;
  selector.replaceChildren(new Option(current,''),...dates.map(date=>new Option(shortDate(date),date)));
  selector.value=state.selectedDate;
  selector.disabled=dates.length===0;
  el('date-help').textContent=dates.length?'What-if dates don’t change the Army schedule. Model coverage varies by date and time.':scenarioArchived()?'The forecast is archived. Only the previously reviewed date is shown.':'No alternate dates in this snapshot.';
}
function updateModelOptions(){
  const models=activeSnapshot()?.models??{};
  const names=[...MODEL_ORDER,...Object.keys(models).filter(key=>!MODEL_ORDER.includes(key))]
    .filter(key=>Object.hasOwn(models,key));
  const selection=el('model-select');
  const available=names.filter(key=>modelHasWind(models[key],state.scenarioDate,state.release));
  selection.disabled=available.length===0;
  selection.replaceChildren(...(available.length?[]:[new Option('No data for this time','')]),...names.map(key=>{
    const option=new Option(models[key].name+(available.includes(key)?'':' · Unavailable'),key);
    option.disabled=!available.includes(key);
    return option;
  }));
  if(!available.includes(state.model))state.model=available[0]||'';
  selection.value=state.model;
}
async function loadOfficial(){
  try{
    const r=await fetch('/data/official-status.json',{cache:'no-store'});
    if(!r.ok)throw Error(`HTTP ${r.status}`);
    const s=await r.json();
    const changed=state.archiveOn!==(s.archive_on||null);
    state.archiveOn=s.archive_on||null;
    el('official-heading').textContent=s.scenario_date?shortDate(s.scenario_date):(s.headline||'No verified date');
    el('official-text').textContent=s.summary||'No current schedule verified.';
    el('official-link').href=s.source_url||'https://www.army.mil/asc';
    el('official-reviewed').textContent=s.published_date?`Agency notice published ${shortDate(s.published_date)}${s.reviewed_at_utc?' · Reviewed '+formatDate(s.reviewed_at_utc):''}`:'No reviewed notice';
    if(changed){pauseTimeline();updateDateOptions();updateModelOptions();safeRender();}
  }catch{el('official-reviewed').textContent='Could not recheck the last reviewed notice';}
  try{
    const r=await fetch('/data/source-watch.json',{cache:'no-store'}),s=await r.json();
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
async function loadExtended(){
  try{
    const r=await fetch('/data/extended-tracks.json',{cache:'no-store'});
    if(!r.ok)throw Error('HTTP '+r.status);
    const snap=await r.json();
    state.extended=snap?.schema===1 && snap?.status==='extended-trajectory'?snap:null;
  }catch(err){state.extended=null;console.warn('Regional forecast paths unavailable:',err);}
  safeRender();
}
function safeRender(){
  if(state.view!=='wind')return;
  try { render(); }
  catch(err){
    console.error('Wind-path overlay rendering failed:',err);
    state.loadError=`Wind-path drawing failed: ${err?.message||'Unknown error'}`;
    renderHeader();
    el('overlay-status').textContent=state.loadError;
  }
}
makeMap();installControls();installTimeline();updateDateOptions();
const sampling=createSamplingView({map:state.map,plant:PLANT,list:el('sampling-list'),status:el('sampling-status')});
installMapViews(sampling);loadForecast();loadExtended();loadOfficial();
// A tab left open picks up newly published snapshots without a page reload.
setInterval(()=>{if(!document.hidden)sampling.refresh();},60*1000);
setInterval(()=>{loadForecast();loadExtended();loadOfficial();},5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){sampling.refresh();loadForecast();loadExtended();loadOfficial();}});
