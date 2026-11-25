// Public EPA Region 7 Xact layer, as referenced by the response dashboard.
const stationLayer='https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/IAAAP_Xact_Data_Public_Viewer/FeatureServer/0';
export const STATION_QUERY=`${stationLayer}/query?${new URLSearchParams({
  where:'1=1',outFields:'objectid,Air_Station_ID,Mon_Date_Time,Mon_Results,Mon_Units',
  orderByFields:'Mon_Date_Time DESC,objectid DESC',resultRecordCount:'120',outSR:'4326',f:'json'
})}`;
const locationLayer='https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Air_Sampling_and_Monitoring_Location/FeatureServer/0';
const LOCATION_QUERY=`${locationLayer}/query?${new URLSearchParams({
  where:'1=1',outFields:'Station_ID,Instrument_Type',outSR:'4326',f:'json'
})}`;
export const EVENT={date:'2026-11-25',hour:9};
const SCREENING_LEVEL=32; // µg/m³; short-term PAC-1 comparison in the EPA dashboard.
const COLORS={'below':'#127b89','at-or-above':'#c5263d','missing':'#657382'};
const validNumber=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
const stamp=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'2-digit',day:'2-digit',year:'2-digit',hour:'numeric',minute:'2-digit',timeZoneName:'short'});

export function parseReadings(payload){
  if(payload?.error||payload?.spatialReference?.wkid!==4326||!Array.isArray(payload.features))throw new Error('Unrecognized EPA response');
  const stations=new Map();
  for(const feature of payload.features){
    const a=feature?.attributes,{x:lon,y:lat}=feature?.geometry??{};
    if(!a||typeof a.Air_Station_ID!=='string'||!/^[A-Z0-9-]{1,20}$/.test(a.Air_Station_ID)||
       !Number.isSafeInteger(a.objectid)||!Number.isSafeInteger(a.Mon_Date_Time)||
       !validNumber(a.Mon_Date_Time,0,8.64e15)||!validNumber(lat,-90,90)||!validNumber(lon,-180,180))continue;
    const station=a.Air_Station_ID,when=a.Mon_Date_Time,id=a.objectid;
    const old=stations.get(station);
    if(old&&(old.when>when||(old.when===when&&old.id>=id)))continue;
    const value=['µg/m3','μg/m3','µg/m³','μg/m³'].includes(a.Mon_Units)&&Number.isFinite(a.Mon_Results)&&a.Mon_Results>=0?a.Mon_Results:null;
    stations.set(station,{station,when,id,value,lat,lon});
  }
  if(payload.features.length&&!stations.size)throw new Error('No usable station locations in EPA response');
  return [...stations.values()].sort((a,b)=>a.station.localeCompare(b.station));
}

export function readingCategory(value){
  return !Number.isFinite(value)||value<0?'missing':value>=SCREENING_LEVEL?'at-or-above':'below';
}
export const formatReading=value=>String(value);
const categoryText={below:'Below screening level','at-or-above':'At or above screening level',missing:'No comparable result'};

export function createSamplingView({map,plant,list,status,networkToggle,ringToggle,networkStatus,networkKey,ringKey}){
  const layer=map?L.featureGroup():null;
  const network=map?L.featureGroup():null;
  const rings=map?L.featureGroup():null;
  let shown=false,framed=false,refreshing=false,haveData=false,fetchedAt=0;
  let networkLoaded=false,loadingNetwork=false;
  const markers=new Map();
  const plantLocation=[plant.lat,plant.lon];
  if(map){
    // Keep reference marks under the actual station readings at every zoom.
    const pane=map.createPane('sampling-context');
    pane.style.zIndex='390';
    for(const miles of [20,10,5])L.circle(plantLocation,{
      radius:miles*1609.344,pane:'sampling-context',className:'sampling-distance-ring',
      color:'#4a5560',weight:1.5,opacity:.9,dashArray:'5 5',fill:false,interactive:false
    }).addTo(rings);
  }else{
    networkToggle.disabled=true;ringToggle.disabled=true;
  }
  function siteMarker(){
    return L.circleMarker(plantLocation,{radius:6,color:'#263444',weight:2,fillColor:'#ffd17b',fillOpacity:1,interactive:false,className:'sampling-site'});
  }
  function frame(){
    if(shown&&!framed&&map){
      map.invalidateSize({pan:false});
      const bounds=L.latLngBounds([plantLocation,plantLocation]);
      const groups=[layer,...(networkToggle.checked?[network]:[]),...(ringToggle.checked?[rings]:[])];
      for(const group of groups){const extent=group.getBounds();if(extent.isValid())bounds.extend(extent);}
      if(groups.some(group=>group.getLayers().some(item=>item.options.className!=='sampling-site'))){
        map.fitBounds(bounds,{padding:[30,32],maxZoom:11,animate:false});framed=true;
      }
      else map.setView(plantLocation,9,{animate:false});
    }
  }
  async function loadNetwork(){
    if(networkLoaded||loadingNetwork||!network)return;
    loadingNetwork=true;
    networkStatus.textContent='Loading EPA monitoring locations…';
    try{
      const response=await request(LOCATION_QUERY);
      const collection=await response.json();
      if(collection?.error||collection?.spatialReference?.wkid!==4326||!Array.isArray(collection.features)||collection.exceededTransferLimit)throw new Error('Unrecognized EPA location response');
      const ids=new Set();
      for(const feature of collection.features){
        const {Station_ID:id,Instrument_Type:instruments}=feature?.attributes??{};
        const {x:lon,y:lat}=feature?.geometry??{};
        if(typeof id!=='string'||!/^[A-Z0-9-]{1,20}$/.test(id)||ids.has(id)||!validNumber(lat,-90,90)||!validNumber(lon,-180,180))continue;
        ids.add(id);
        const popup=document.createElement('div');
        const title=document.createElement('strong');title.textContent=`EPA site ${id}`;
        popup.append(title,document.createElement('br'));
        if(typeof instruments==='string'&&instruments.trim())popup.append(instruments,document.createElement('br'));
        popup.append('Location only. No lead value in this layer.');
        L.circleMarker([lat,lon],{pane:'sampling-context',radius:5,color:'#3f505e',weight:1.5,fillColor:'#fff',fillOpacity:1,className:'epa-location'}).bindPopup(popup).addTo(network);
      }
      networkLoaded=true;
      networkStatus.textContent=ids.size?`${ids.size} EPA ${ids.size===1?'location':'locations'}. No lead values in this layer.`:'EPA has not posted locations in this layer.';
      if(networkToggle.checked&&shown){framed=false;frame();}
    }catch{
      networkStatus.textContent='EPA monitoring locations couldn’t load. Toggle to try again.';
    }finally{loadingNetwork=false;}
  }
  function updateContext(){
    if(!map)return;
    const showNetwork=shown&&networkToggle.checked,showRings=shown&&ringToggle.checked;
    for(const [group,visible] of [[network,showNetwork],[rings,showRings]]){
      if(visible)group.addTo(map);else group.remove();
    }
    networkStatus.hidden=networkKey.hidden=!showNetwork;
    ringKey.hidden=!showRings;
    if(showNetwork)loadNetwork();
    framed=false;frame();
  }
  for(const toggle of [networkToggle,ringToggle])toggle.addEventListener('change',updateContext);
  function render(rows){
    layer?.clearLayers();
    if(layer)siteMarker().addTo(layer);
    markers.clear();
    const items=rows.map(r=>{
      const category=readingCategory(r.value),label=`Xact station ${r.station}`;
      const result=r.value===null?'No comparable result':`${formatReading(r.value)} µg/m³`;
      const time=stamp.format(r.when);
      const item=document.createElement('li');
      const button=document.createElement('button');
      button.type='button';button.className='sampling-row';button.dataset.category=category;
      const heading=document.createElement('strong');heading.textContent=label;
      const value=document.createElement('b');value.textContent=result;
      const details=document.createElement('small');details.textContent=`${time} · ${categoryText[category]}`;
      button.append(heading,value,details);
      if(layer){
        const popup=document.createElement('div');
        const title=document.createElement('strong');title.textContent=label;
        popup.append(title,document.createElement('br'),`${result} · ${categoryText[category]}`,document.createElement('br'),time);
        const marker=L.circleMarker([r.lat,r.lon],{radius:category==='at-or-above'?10:8,color:'#fff',weight:2,fillColor:COLORS[category],fillOpacity:1,className:`sampling-station sampling-${category}`}).bindPopup(popup).addTo(layer);
        markers.set(r.station,marker);
        button.addEventListener('click',()=>{
          map.panInside(marker.getLatLng(),{padding:[36,36]});
          marker.openPopup();
        });
        item.append(button);
      }else{
        const row=document.createElement('div');row.className=button.className;row.dataset.category=category;row.append(...button.childNodes);item.append(row);
      }
      return item;
    });
    // A refresh must not drop focus from a selected station or close its popup.
    list.replaceChildren(...items);
    frame();
  }
  let previous='';
  async function refresh(){
    if(refreshing||!shown||Date.now()-fetchedAt<30000)return;
    refreshing=true;
    try{
      const response=await request(STATION_QUERY);
      const rows=parseReadings(await response.json());
      const signature=JSON.stringify(rows);
      if(signature!==previous){
        const focused=[...list.querySelectorAll('button')].indexOf(document.activeElement);
        const open=[...markers].find(([,marker])=>marker.isPopupOpen())?.[0];
        const station=list.children[focused]?.querySelector('strong')?.textContent;
        render(rows);previous=signature;
        if(station)[...list.querySelectorAll('button')].find(b=>b.querySelector('strong').textContent===station)?.focus({preventScroll:true});
        if(open&&shown)markers.get(open)?.openPopup();
      }
      haveData=rows.length>0;
      status.textContent=haveData?`${rows.length} Xact ${rows.length===1?'station':'stations'} with EPA records · Checked ${stamp.format(Date.now())}`:'The EPA feed has no station readings to show yet.';
    }catch{
      status.textContent=haveData?'Could not refresh EPA data. The last loaded readings are shown with their original times.':'EPA readings could not load. Open the EPA dashboard to check the source.';
    }finally{fetchedAt=Date.now();refreshing=false;}
  }
  return {refresh,show(active){
    shown=active;
    if(map){
      if(active)layer.addTo(map);
      else{map.closePopup();layer.remove();}
      updateContext();
    }
    if(active)refresh();
  }};
}

async function request(url){
  const response=await fetch(url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('EPA HTTP error');
  return response;
}
