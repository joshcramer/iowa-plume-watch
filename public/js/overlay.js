/**
 * Geographic reference and wind transport are projected as a dedicated SVG
 * above Leaflet. This works even when external basemap tiles are unavailable.
 * Forecast paths are AIR-PARCEL CENTERLINES, not lead plume/deposition fields.
 */
const NS='http://www.w3.org/2000/svg';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const pointsOf=track=>(track.points||[]).filter(p=>finite(p.lat)&&finite(p.lon));
export function projectTrack(map,track){
  const out=[];
  for(const p of pointsOf(track)){
    const q=map.latLngToContainerPoint([p.lat,p.lon]);
    if(q&&finite(q.x)&&finite(q.y))out.push([q.x,q.y]);
  }
  return out;
}
function svg(name,attrs={}){
  const e=document.createElementNS(NS,name);
  for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));
  return e;
}

export const usDate=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'2-digit',day:'2-digit',year:'2-digit'});
const clockLabel=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',hour:'numeric',minute:'2-digit',hour12:true});
/** Model time labels are Chicago wall-clock hours. */
export function clockAt(releaseHour,elapsedHours,date){
  const day=Date.parse(`${date}T00:00:00Z`);
  if(!finite(releaseHour)||!finite(elapsedHours)||!finite(day))return 'Time unavailable';
  const timestamp=new Date(day+Math.round((releaseHour+elapsedHours)*60)*60000);
  return `${usDate.format(timestamp)}, ${clockLabel.format(timestamp)} CT`;
}
/** Interpolate a 15-minute model trajectory at an arbitrary elapsed hour. */
export function pointAtElapsed(track,h){
  if(!finite(h)||h<0)return null;
  const pts=pointsOf(track).filter(p=>finite(p.h));
  if(!pts.length||h<pts[0].h-1e-7||h>pts.at(-1).h+1e-7)return null;
  if(Math.abs(h-pts[0].h)<1e-7)return {...pts[0]};
  for(let i=1;i<pts.length;i++){
    if(h<=pts[i].h+1e-7){
      const a=pts[i-1],b=pts[i],fraction=(h-a.h)/Math.max(1e-8,b.h-a.h);
      return {lat:a.lat+(b.lat-a.lat)*fraction,lon:a.lon+(b.lon-a.lon)*fraction,h};
    }
  }
  return {...pts.at(-1)};
}

function lineD(coords){return coords.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');}

function hull(coords){
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const sorted=coords.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  function half(points){
    const edge=[];
    for(const p of points){
      while(edge.length>=2 && cross(edge.at(-2),edge.at(-1),p)<=0)edge.pop();
      edge.push(p);
    }
    return edge.slice(0,-1);
  }
  return [...half(sorted),...half(sorted.reverse())];
}

/** Observed spread of same-time weather-model positions, not a probability field. */
export function modelSpread(map,tracks){
  const members=[...new Map(tracks.filter(t=>t.model&&t.points?.length>=2).map(t=>[t.model,t])).values()];
  if(members.length<2)return {d:'',hours:0,models:[]};
  const polygons=[];
  let previous=null,hours=0;
  for(let i=0;i<=32;i++){
    const points=members.map(t=>t.points[i]);
    if(points.some(p=>!p||!finite(p.lat)||!finite(p.lon)||Math.abs(p.h-i/4)>1e-7||!finite(p.h)))break;
    const current=points.map(p=>map.latLngToContainerPoint([p.lat,p.lon]));
    if(current.some(q=>!q||!finite(q.x)||!finite(q.y)))break;
    const coords=current.map(q=>[q.x,q.y]);
    if(previous){
      const ring=hull([...previous,...coords]);
      if(ring.length>=3)polygons.push(lineD(ring)+'Z');
    }
    previous=coords;hours=i/4;
  }
  return {d:polygons.join(' '),hours,models:members.map(t=>t.model)};
}

const hourLabel=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',hour:'numeric',hour12:true});
function drawTimeLabels(layer,map,track,site,size,release,date){
  const start=Date.parse(`${date}T00:00:00Z`);
  if(!track||!finite(start))return;
  const end=track.points.at(-1)?.h??0,spacing=end>26?12:end>10?6:2;
  const siteBox=site?[site.x-126,site.y-30,site.x+126,site.y+8]:null;
  const occupied=siteBox?[siteBox]:[];
  const intersects=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
  for(let hour=spacing;hour<=end;hour+=spacing){
    const p=pointAtElapsed(track,hour);
    if(!p)continue;
    const q=map.latLngToContainerPoint([p.lat,p.lon]);
    if(!q||q.x<26||q.x>size.x-26||q.y<22||q.y>size.y-32)continue;
    const y=q.y-10,box=[q.x-26,y-13,q.x+26,y+9];
    if(occupied.some(other=>intersects(box,other)))continue;
    if(q.x>size.x-56&&q.y>size.y-115)continue; // Leaflet zoom buttons.
    occupied.push(box);
    const clock=hourLabel.format(new Date(start+(release+hour)*3600000));
    const label=svg('text',{class:'forecast-time-label',x:q.x,y,'text-anchor':'middle','aria-hidden':'true'});
    label.textContent=clock;
    layer.append(svg('circle',{class:'forecast-time-anchor',cx:q.x,cy:q.y,r:2.8,fill:track.color}),label);
  }
}

export function createTransportOverlay(map,plant){
  const root=map.getContainer();
  const layer=svg('svg',{class:'wind-path-svg',role:'img','aria-label':'Iowa map showing the release site and modeled wind trajectories; not a lead hazard map'});
  root.appendChild(layer);
  let tracks=[];
  let elapsedHours=4;
  let releaseHour=12;
  let spreadTracks=[];
  let scenarioDate=null;
  function draw(){
    const size=map.getSize();
    if(!size?.x||!size?.y)return;
    layer.setAttribute('viewBox','0 0 '+size.x+' '+size.y);
    layer.setAttribute('width',size.x);
    layer.setAttribute('height',size.y);
    layer.replaceChildren();
    const bounds=map.getBounds?.();
    if(bounds){
      // Pale geographic grid persists when external OSM image tiles fail.
      const south=bounds.getSouth(),north=bounds.getNorth(),west=bounds.getWest(),east=bounds.getEast();
      for(let lat=Math.ceil(south);lat<=north;lat+=1){
        const a=map.latLngToContainerPoint([lat,west]),b=map.latLngToContainerPoint([lat,east]);
        if(a&&b)layer.appendChild(svg('path',{d:lineD([[a.x,a.y],[b.x,b.y]]),stroke:'#496d7a','stroke-width':.7,opacity:.24,fill:'none'}));
      }
      for(let lon=Math.ceil(west);lon<=east;lon+=1){
        const a=map.latLngToContainerPoint([south,lon]),b=map.latLngToContainerPoint([north,lon]);
        if(a&&b)layer.appendChild(svg('path',{d:lineD([[a.x,a.y],[b.x,b.y]]),stroke:'#496d7a','stroke-width':.7,opacity:.24,fill:'none'}));
      }
    }
    const spread=modelSpread(map,spreadTracks);
    if(spread.d)layer.appendChild(svg('path',{class:'model-spread-band',d:spread.d,'data-hours':spread.hours,'data-models':spread.models.join(',')}));
    // Muted full centerlines with a stronger stroke up to the time cursor.
    const selectedMarkers=[];
    let visibleTrackCount=0;
    for(const track of tracks){
      const coords=projectTrack(map,track);
      if(coords.length<2)continue;
      visibleTrackCount++;
      const d=lineD(coords);
      layer.append(
        svg('path',{class:'forecast-halo',d,fill:'none',stroke:'#183846','stroke-width':5.5,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.62}),
        svg('path',{class:'forecast-path','data-level':track.key,d,fill:'none',stroke:track.color||'#91dbd8','stroke-width':2.8,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.64,...(track.truncated?{'stroke-dasharray':'5 6'}:{})})
      );
      const points=pointsOf(track);
      const active=points.filter(p=>finite(p.h)&&p.h<=elapsedHours+1e-7);
      const cursor=pointAtElapsed(track,elapsedHours);
      if(cursor&&active.length && active.at(-1).h<cursor.h-1e-7)active.push(cursor);
      if(active.length>=2){
        const toPoint=p=>map.latLngToContainerPoint([p.lat,p.lon]);
        const activeCoords=active.map(toPoint).filter(p=>p&&finite(p.x)&&finite(p.y)).map(p=>[p.x,p.y]);
        layer.appendChild(svg('path',{class:'forecast-progress',d:lineD(activeCoords),fill:'none',stroke:track.color||'#91dbd8','stroke-width':3.7,'stroke-linecap':'round','stroke-linejoin':'round'}));
      }
      if(cursor){
        const q=map.latLngToContainerPoint([cursor.lat,cursor.lon]);
        if(q&&finite(q.x)&&finite(q.y))selectedMarkers.push({x:q.x,y:q.y,color:track.color||'#91dbd8',label:track.label||'Wind'});
      }
    }
    for(const mark of selectedMarkers){
      const g=svg('g',{class:'selected-time-marker'});
      const ring=svg('circle',{cx:mark.x,cy:mark.y,r:6.5,fill:'#ffffff',stroke:'#082535','stroke-width':2});
      const core=svg('circle',{cx:mark.x,cy:mark.y,r:4.1,fill:mark.color});
      const title=svg('title');title.textContent=mark.label+' selected at +'+elapsedHours+'h ('+clockAt(releaseHour,elapsedHours,scenarioDate)+')';
      g.append(ring,core,title);layer.appendChild(g);
    }
    function marker(p,label,fill,cls,dx=12,dy=-10){
      if(!p)return;
      const q=map.latLngToContainerPoint([p.lat,p.lon]);
      if(!q||!finite(q.x)||!finite(q.y))return;
      layer.appendChild(svg('circle',{class:cls,cx:q.x,cy:q.y,r:8,fill,stroke:'#071e30','stroke-width':3}));
      // Lay the label inward when the site is close to the map's right edge.
      const flip=q.x>size.x-125;
      const t=svg('text',{class:'map-reference-label',x:q.x+(flip?-dx:dx),y:q.y+dy,'text-anchor':flip?'end':'start','paint-order':'stroke',stroke:'#f4f7f5','stroke-width':3,fill:'#14303e','font-size':12,'font-weight':750});
      t.textContent=label;
      layer.appendChild(t);
    }
    drawTimeLabels(layer,map,tracks.find(track=>track.key==='10m')||tracks[0],map.latLngToContainerPoint([plant.lat,plant.lon]),size,releaseHour,scenarioDate);
    marker(plant,'Detonation site','#f6bb65','plant-marker',12,-12);
    layer.dataset.pathCount=String(visibleTrackCount);
    layer.dataset.elapsedHours=String(elapsedHours);
  }
  function setTracks(next,options={}){
    tracks=Array.isArray(next)?next:[];
    if(finite(options.elapsedHours))elapsedHours=Math.max(0,options.elapsedHours);
    if(finite(options.releaseHour))releaseHour=options.releaseHour;
    if(Object.hasOwn(options,'scenarioDate'))scenarioDate=options.scenarioDate;
    spreadTracks=options.spreadTracks||[];
    draw();
  }
  function setElapsed(hours){if(finite(hours)){elapsedHours=Math.max(0,hours);draw();}}

  map.on('move zoom resize',draw);
  window.addEventListener('resize',draw);
  return {svg:layer,setTracks,setElapsed,draw,getCount:()=>Number(layer.dataset.pathCount||0)};
}
