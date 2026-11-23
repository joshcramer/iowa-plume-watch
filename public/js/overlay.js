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

/** Model time labels are Chicago wall-clock hours. */
export function clockAt(releaseHour,elapsedHours,date){
  const day=Date.parse(`${date}T00:00:00Z`);
  if(!finite(releaseHour)||!finite(elapsedHours)||!finite(day))return 'Time unavailable';
  const timestamp=day+Math.round((releaseHour+elapsedHours)*60)*60000;
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(timestamp))+' CT';
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

export function createTransportOverlay(map,plant){
  const root=map.getContainer();
  const layer=svg('svg',{class:'wind-path-svg',role:'img','aria-label':'Iowa map showing the release site and modeled wind trajectories; not a lead hazard map'});
  root.appendChild(layer);
  let tracks=[];
  let elapsedHours=4;
  let releaseHour=12;
  let showTimeDots=false;
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
    // Draw complete possible trajectories faintly, then brighten only the
    // segment reached by the selected hypothetical elapsed time.
    // This is not a time-evolving plume, nor a physical cloud boundary.
    // Cleaner default: no permanent text labels covering the wind lines.
    // Optional checkpoint dots show elapsed time via hover tooltips.
    const selectedMarkers=[];
    let visibleTrackCount=0;
    for(const [index,track] of tracks.entries()){
      const coords=projectTrack(map,track);
      if(coords.length<2)continue;
      visibleTrackCount++;
      const d=lineD(coords);
      layer.append(
        svg('path',{class:'forecast-halo',d,fill:'none',stroke:'#081d2b','stroke-width':7,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.55}),
        svg('path',{class:'forecast-path','data-level':track.key,d,fill:'none',stroke:track.color||'#91dbd8','stroke-width':3.7,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.36,...(track.truncated?{'stroke-dasharray':'5 7'}:{})})
      );
      const points=pointsOf(track);
      const active=points.filter(p=>finite(p.h)&&p.h<=elapsedHours+1e-7);
      const cursor=pointAtElapsed(track,elapsedHours);
      if(cursor&&active.length && active.at(-1).h<cursor.h-1e-7)active.push(cursor);
      if(active.length>=2){
        const toPoint=p=>map.latLngToContainerPoint([p.lat,p.lon]);
        const activeCoords=active.map(toPoint).filter(p=>p&&finite(p.x)&&finite(p.y)).map(p=>[p.x,p.y]);
        layer.appendChild(svg('path',{class:'forecast-progress',d:lineD(activeCoords),fill:'none',stroke:track.color||'#91dbd8','stroke-width':4.8,'stroke-linecap':'round','stroke-linejoin':'round'}));
      }
      if(showTimeDots){
        const latest=points.at(-1).h;
        // For long-range tracking fewer checkpoints are easier to see.
        const spacing=elapsedHours>12?6:4;
        for(let hour=spacing;hour<=Math.floor(latest+1e-7);hour+=spacing){
          const p=pointAtElapsed(track,hour);
          if(!p)continue;
          const q=map.latLngToContainerPoint([p.lat,p.lon]);
          if(!q||!finite(q.x)||!finite(q.y))continue;
          const tick=svg('circle',{class:'hour-tick',cx:q.x,cy:q.y,r:3.2,fill:track.color||'#91dbd8',stroke:'#0b2635','stroke-width':1.4});
          const title=svg('title');title.textContent=(track.label||'Wind')+' +'+hour+'h — '+clockAt(releaseHour,hour,scenarioDate)+' (hypothetical)';
          tick.appendChild(title);layer.appendChild(tick);
        }
      }
      if(cursor){
        const q=map.latLngToContainerPoint([cursor.lat,cursor.lon]);
        if(q&&finite(q.x)&&finite(q.y))selectedMarkers.push({x:q.x,y:q.y,color:track.color||'#91dbd8',label:track.label||'Wind'});
      }
    }
    for(const mark of selectedMarkers){
      const g=svg('g',{class:'selected-time-marker'});
      const ring=svg('circle',{cx:mark.x,cy:mark.y,r:9.2,fill:'#ffffff',stroke:'#082535','stroke-width':3});
      const core=svg('circle',{cx:mark.x,cy:mark.y,r:5.8,fill:mark.color,stroke:'#ffffff','stroke-width':1.5});
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
    marker(plant,'Detonation site','#f6bb65','plant-marker',12,-12);
    layer.dataset.pathCount=String(visibleTrackCount);
    layer.dataset.elapsedHours=String(elapsedHours);
  }
  function setTracks(next,options={}){
    tracks=Array.isArray(next)?next:[];
    if(finite(options.elapsedHours))elapsedHours=Math.max(0,options.elapsedHours);
    if(finite(options.releaseHour))releaseHour=options.releaseHour;
    if(Object.hasOwn(options,'scenarioDate'))scenarioDate=options.scenarioDate;
    if(typeof options.showTimeDots==='boolean')showTimeDots=options.showTimeDots;
    draw();
  }
  function setElapsed(hours){if(finite(hours)){elapsedHours=Math.max(0,hours);draw();}}
  function setTimeDots(show){showTimeDots=Boolean(show);draw();}
  map.on('move zoom resize',draw);
  window.addEventListener('resize',draw);
  return {svg:layer,setTracks,setElapsed,setTimeDots,draw,getCount:()=>Number(layer.dataset.pathCount||0)};
}
