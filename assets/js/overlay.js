/**
 * Dedicated SVG forecast path renderer. It does not estimate plume width,
 * deposition, concentration, probability, exposure or an environmental all-clear.
 * Leaflet supplies lat/lon -> viewport positions, not the line-rendering engine.
 */
const SVG_NS='http://www.w3.org/2000/svg';
const isFiniteNumber=n=>typeof n==='number'&&Number.isFinite(n);
function validPoints(track){
  return (track.points||[]).filter(p=>isFiniteNumber(p.lat)&&isFiniteNumber(p.lon));
}
export function projectTrack(map,track){
  const points=[];
  for(const p of validPoints(track)){
    const q=map.latLngToContainerPoint([p.lat,p.lon]);
    if(q&&isFiniteNumber(q.x)&&isFiniteNumber(q.y))points.push([q.x,q.y]);
  }
  return points;
}
function createSvg(name,attrs){
  const el=document.createElementNS(SVG_NS,name);
  for(const [k,v] of Object.entries(attrs||{}))el.setAttribute(k,String(v));
  return el;
}
export function createTransportOverlay(map){
  const root=map.getContainer();
  const svg=createSvg('svg',{
    class:'wind-path-svg',role:'img',
    'aria-label':'Model wind trajectories at the selected levels. Not lead exposure or deposition.',
  });
  root.appendChild(svg);
  let tracks=[];
  function draw(){
    const size=map.getSize();
    if(!size||!size.x||!size.y)return;
    svg.setAttribute('viewBox','0 0 '+size.x+' '+size.y);
    svg.setAttribute('width',size.x);
    svg.setAttribute('height',size.y);
    svg.replaceChildren();
    for(const track of tracks){
      const coords=projectTrack(map,track);
      if(coords.length<2)continue;
      const d=coords.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' ');
      const outline=createSvg('path',{d,fill:'none',stroke:'#082536','stroke-width':8,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.94});
      const line=createSvg('path',{d,fill:'none',stroke:track.color||'#b9efff','stroke-width':4.5,'stroke-linecap':'round','stroke-linejoin':'round',opacity:1,...(track.truncated?{'stroke-dasharray':'5 7'}:{})});
      const title=createSvg('title');
      title.textContent=(track.label||'Wind')+' — modeled parcel centerline, NOT a lead concentration contour';
      line.appendChild(title);
      svg.append(outline,line);
      const last=coords[coords.length-1];
      svg.appendChild(createSvg('circle',{cx:last[0],cy:last[1],r:5,fill:track.color||'#b9efff',stroke:'#082536','stroke-width':2}));
    }
    svg.dataset.pathCount=String(tracks.filter(t=>validPoints(t).length>=2).length);
  }
  function setTracks(next){tracks=Array.isArray(next)?next:[];draw();}
  map.on('move zoom resize',draw);
  window.addEventListener('resize',draw);
  return {svg,setTracks,draw,getCount:()=>Number(svg.dataset.pathCount||0)};
}
