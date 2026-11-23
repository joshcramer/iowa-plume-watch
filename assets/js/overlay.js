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
function lineD(coords){return coords.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');}
export function createTransportOverlay(map,reference={}){
  const root=map.getContainer();
  const layer=svg('svg',{class:'wind-path-svg',role:'img','aria-label':'Iowa map showing approximate airport route and modeled wind trajectories; not a lead hazard map'});
  root.appendChild(layer);
  let tracks=[];
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
    const route=(reference.route||[]).map(p=>map.latLngToContainerPoint([p.lat,p.lon])).filter(p=>p&&finite(p.x)&&finite(p.y)).map(p=>[p.x,p.y]);
    if(route.length>=2){
      const d=lineD(route);
      layer.append(svg('path',{class:'reference-halo',d,fill:'none',stroke:'#072636','stroke-width':8,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.92}),
        svg('path',{class:'reference-route',d,fill:'none',stroke:'#21cfcb','stroke-width':4,'stroke-dasharray':'9 5','stroke-linejoin':'round','stroke-linecap':'round'}));
    }
    for(const track of tracks){
      const coords=projectTrack(map,track);
      if(coords.length<2)continue;
      const d=lineD(coords);
      const halo=svg('path',{class:'forecast-halo',d,fill:'none',stroke:'#081d2b','stroke-width':8,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.96});
      const p=svg('path',{class:'forecast-path',d,fill:'none',stroke:track.color||'#91dbd8','stroke-width':4.5,'stroke-linecap':'round','stroke-linejoin':'round',...(track.truncated?{'stroke-dasharray':'5 7'}:{})});
      const title=svg('title');title.textContent=(track.label||'Forecast wind')+' trajectory: NOT a lead concentration or risk contour';
      p.appendChild(title);
      layer.append(halo,p);
      const last=coords.at(-1);
      layer.appendChild(svg('circle',{class:'forecast-end',cx:last[0],cy:last[1],r:5,fill:track.color||'#91dbd8',stroke:'#081d2b','stroke-width':2}));
    }
    function marker(p,label,fill,cls,dx=12,dy=-10){
      if(!p)return;
      const q=map.latLngToContainerPoint([p.lat,p.lon]);
      if(!q||!finite(q.x)||!finite(q.y))return;
      layer.appendChild(svg('circle',{class:cls,cx:q.x,cy:q.y,r:8,fill,stroke:'#071e30','stroke-width':3}));
      const t=svg('text',{class:'map-reference-label',x:q.x+dx,y:q.y+dy,'paint-order':'stroke',stroke:'#f4f7f5','stroke-width':3,fill:'#14303e','font-size':12,'font-weight':750});
      t.textContent=label;
      layer.appendChild(t);
    }
    const places=reference.places||{};
    marker(places.airport,'CID Airport','#20d0cb','airport-marker',12,-9);
    marker(places.davenport,'Davenport','#20d0cb','davenport-marker',12,20);
    marker(reference.plant,'Detonation site','#f6bb65','plant-marker',12,-12);
    layer.dataset.pathCount=String(tracks.filter(t=>pointsOf(t).length>=2).length);
  }
  function setTracks(next){tracks=Array.isArray(next)?next:[];draw();}
  map.on('move zoom resize',draw);
  window.addEventListener('resize',draw);
  return {svg:layer,setTracks,draw,getCount:()=>Number(layer.dataset.pathCount||0)};
}
