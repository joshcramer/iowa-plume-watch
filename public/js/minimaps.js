/**
 * Four synchronized light-weight mini-maps: same geographic projection/bounds,
 * no additional map tile requests, and a single level per panel.
 * These depict air-parcel tracks, NEVER a plume or lead-deposition contour.
 */
const NS='http://www.w3.org/2000/svg',rad=Math.PI/180;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const merc=p=>({x:p.lon*rad,y:Math.log(Math.tan(Math.PI/4+Math.max(-84,Math.min(84,p.lat))*rad/2))});
function node(name,attrs={}){
  const e=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attrs))e.setAttribute(key,String(value));
  return e;
}
const pathD=coords=>coords.map((v,i)=>(i?'L':'M')+v.x.toFixed(2)+' '+v.y.toFixed(2)).join(' ');
export function sharedProjection(tracks,route,plant,width=500,height=246){
  const geo=[plant,...(route||[])];
  for(const track of tracks||[])for(const p of track?.points||[])if(finite(p.lat)&&finite(p.lon))geo.push(p);
  const vectors=geo.filter(p=>p&&finite(p.lat)&&finite(p.lon)).map(merc);
  if(!vectors.length)return ()=>({x:width/2,y:height/2});
  let minX=Math.min(...vectors.map(p=>p.x)),maxX=Math.max(...vectors.map(p=>p.x));
  let minY=Math.min(...vectors.map(p=>p.y)),maxY=Math.max(...vectors.map(p=>p.y));
  let spanX=Math.max(0.006,maxX-minX),spanY=Math.max(0.006,maxY-minY);
  const padding=28;
  const scale=Math.min((width-2*padding)/spanX,(height-2*padding)/spanY);
  const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
  const project=p=>{
    const v=merc(p);
    return {x:width/2+(v.x-centerX)*scale,y:height/2-(v.y-centerY)*scale};
  };
  project.bounds={minX,maxX,minY,maxY,scale,width,height};
  return project;
}
export function atHour(points,elapsed){
  const valid=(points||[]).filter(p=>finite(p.h)&&finite(p.lat)&&finite(p.lon));
  if(!valid.length||!finite(elapsed)||elapsed<valid[0].h||elapsed>valid.at(-1).h+1e-8)return null;
  for(let i=1;i<valid.length;i++){
    if(elapsed<=valid[i].h+1e-8){
      const a=valid[i-1],b=valid[i],t=Math.max(0,Math.min(1,(elapsed-a.h)/(b.h-a.h||1)));
      return {lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t};
    }
  }
  return valid.at(-1);
}
const roundTime=h=>Number.isInteger(h)?String(h):h.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
function shape(svg,kind,attrs){
  const e=node(kind,attrs);svg.appendChild(e);return e;
}
function geoLabel(svg,p,txt,project,dx=8,dy=-6){
  if(!p)return;
  const q=project(p);
  const label=shape(svg,'text',{x:q.x+dx,y:q.y+dy,'font-size':10,'font-weight':700,fill:'#3c5b65',stroke:'#f5f9f8','stroke-width':2.4,'paint-order':'stroke'});
  label.textContent=txt;
}
export function createMiniMaps(root,levels,{route=[],plant,places={},onSelect=()=>{}}={}){
  const cards=new Map();
  const width=500,height=246;
  for(const level of levels){
    const card=document.createElement('button');
    card.type='button';card.className='mini-map-card';card.dataset.level=level.key;
    card.setAttribute('aria-label','Inspect '+level.label+' on main map');
    card.setAttribute('aria-pressed','false');
    const header=document.createElement('div');header.className='mini-map-header';
    const name=document.createElement('div');name.className='mini-map-name';
    const key=document.createElement('span');key.className='mini-level-dot';key.style.background=level.color;
    const title=document.createElement('span');title.textContent=level.short;
    name.append(key,title);
    const tag=document.createElement('span');tag.className='mini-map-coverage';tag.textContent='Awaiting data';
    header.append(name,tag);
    const graphic=document.createElement('div');graphic.className='mini-map-graphic';
    const svg=node('svg',{viewBox:'0 0 500 246','aria-hidden':'true',preserveAspectRatio:'xMidYMid meet'});
    graphic.append(svg);
    const foot=document.createElement('div');foot.className='mini-map-foot';
    const note=document.createElement('span');note.className='mini-map-note';note.textContent='Fixed-height wind trajectory';
    const state=document.createElement('span');state.className='mini-map-current';state.textContent='—';
    foot.append(note,state);card.append(header,graphic,foot);
    card.addEventListener('click',()=>onSelect(level.key));
    root.appendChild(card);
    cards.set(level.key,{card,svg,tag,note,state,level});
  }
  let data={tracks:[],elapsed:0,horizon:8,enabled:[],model:''};
  function render(){
    const trackByKey=new Map(data.tracks.map(t=>[t.key,t]));
    const all=[...trackByKey.values()];
    const project=sharedProjection(all,route,plant,width,height);
    const selected=new Set(data.enabled);
    for(const {card,svg,tag,note,state,level} of cards.values()){
      const track=trackByKey.get(level.key);
      const pts=track?.points||[];
      const reached=pts.length?pts.at(-1).h:0;
      const isolated=selected.size===1&&selected.has(level.key);
      card.dataset.selected=isolated?'true':'false';
      card.dataset.active=selected.has(level.key)?'true':'false';
      card.setAttribute('aria-pressed',String(isolated));
      svg.replaceChildren();
      // Geographical grid, common to all cards: non-tiled on purpose.
      const bg=shape(svg,'rect',{width,height,fill:'#edf3f1'});
      const gr=project.bounds;
      const span=(gr.maxX-gr.minX)/rad;
      const step=span>12?5:span>6?2:1;
      for(let lon=-120;lon<=-60;lon+=step){
        const a=project({lat:20,lon}),b=project({lat:60,lon});
        if(a.x<0||a.x>width)continue;
        shape(svg,'path',{d:'M'+a.x.toFixed(1)+' 0 L'+a.x.toFixed(1)+' '+height,stroke:'#a7bfc3','stroke-width':.7,opacity:.45,fill:'none'});
      }
      for(let lat=20;lat<=60;lat+=step){
        const a=project({lat,lon:-122}),b=project({lat,lon:-60});
        if(a.y<0||a.y>height)continue;
        shape(svg,'path',{d:'M0 '+a.y.toFixed(1)+' L'+width+' '+a.y.toFixed(1),stroke:'#a7bfc3','stroke-width':.7,opacity:.45,fill:'none'});
      }
      if(route.length>=2){
        shape(svg,'path',{d:pathD(route.map(project)),fill:'none',stroke:'#1ea9ad','stroke-width':2.2,'stroke-dasharray':'5 4',opacity:.62});
      }
      if(pts.length>=2){
        const coords=pts.map(project);
        shape(svg,'path',{class:'mini-forecast-line',d:pathD(coords),fill:'none',stroke:level.color,'stroke-width':5,'stroke-linejoin':'round','stroke-linecap':'round',opacity:.9});
        const past=pts.filter(p=>p.h<=data.elapsed+1e-7);
        const cursor=atHour(pts,data.elapsed);
        if(cursor&&past.length&&past.at(-1).h<data.elapsed)past.push(cursor);
        if(past.length>=2)shape(svg,'path',{class:'mini-progress-line',d:pathD(past.map(project)),fill:'none',stroke:'#0d3342','stroke-width':1.7,'stroke-linejoin':'round'});
        if(cursor){
          const q=project(cursor);
          shape(svg,'circle',{class:'mini-time-marker',cx:q.x,cy:q.y,r:7,fill:'#ffffff',stroke:'#0c2d3b','stroke-width':2.4});
          shape(svg,'circle',{cx:q.x,cy:q.y,r:4.2,fill:level.color});
        }
      }
      if(plant){
        const site=project(plant);
        shape(svg,'circle',{cx:site.x,cy:site.y,r:5.5,fill:'#d18a36',stroke:'#ffffff','stroke-width':2.2});
        geoLabel(svg,plant,'Plant',project,8,-7);
      }
      geoLabel(svg,places.airport,'CID',project,5,-7);
      geoLabel(svg,places.davenport,'Davenport',project,5,14);
      if(!track||pts.length<2){
        tag.textContent='No wind data';tag.dataset.state='missing';
        note.textContent='No calculated path';state.textContent='—';
      }else{
        const done=reached>=data.horizon-1e-7;
        tag.textContent=done?'Full '+roundTime(data.horizon)+'h':'Ends +'+roundTime(reached)+'h';
        tag.dataset.state=done?'complete':'truncated';
        note.textContent=track.note||'Fixed-level air parcel';
        state.textContent=data.elapsed<=reached+1e-7?'At +'+roundTime(data.elapsed)+'h':'Unavailable at +'+roundTime(data.elapsed)+'h';
      }
    }
  }
  function setData(next){data={...data,...next};render();}
  function setElapsed(elapsed){data.elapsed=elapsed;render();}
  return {setData,setElapsed,getCards:()=>cards};
}
