/**
 * Pure geometry for inspecting a modeled fixed-altitude AIR PARCEL trajectory.
 * Nothing here predicts lead concentration, deposition or a plume footprint.
 */
const rad=Math.PI/180;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export function distanceKm(a,b){
  if(!a||!b||![a.lat,a.lon,b.lat,b.lon].every(finite))return NaN;
  const dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
  const q=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
  return 6371.0088*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));
}
export function formatElapsed(hours){
  if(!finite(hours)||hours<0)return '—';
  const minutes=Math.round(hours*60);
  const h=Math.floor(minutes/60), m=minutes%60;
  return '+'+h+'h'+(m?' '+String(m).padStart(2,'0')+'m':'');
}
/** Projector takes [lat,lon] and returns {x,y} in map-local pixels. */
export function inspectNearestTrack(tracks, project, x, y, threshold=18){
  if(!finite(x)||!finite(y)||typeof project!=='function')return null;
  let best=null,bestPx=threshold;
  for(const track of tracks||[]){
    const pts=track?.points||[];
    if(pts.length<2)continue;
    let accumulated=0;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i];
      if(![a.lat,a.lon,b.lat,b.lon,a.h,b.h].every(finite))continue;
      const segKm=distanceKm(a,b);
      if(!finite(segKm))continue;
      const p=project(a),q=project(b);
      if(!p||!q||![p.x,p.y,q.x,q.y].every(finite)){accumulated+=segKm;continue;}
      const dx=q.x-p.x,dy=q.y-p.y,len=dx*dx+dy*dy;
      const t=len?Math.max(0,Math.min(1,((x-p.x)*dx+(y-p.y)*dy)/len)):0;
      const hx=p.x+dx*t,hy=p.y+dy*t;
      const dist=Math.hypot(x-hx,y-hy);
      if(dist<=bestPx){
        const here={lat:a.lat+(b.lat-a.lat)*t,lon:a.lon+(b.lon-a.lon)*t};
        bestPx=dist;
        best={levelKey:track.key,color:track.color,label:track.label,
          elapsedHours:a.h+(b.h-a.h)*t,
          lat:here.lat,lon:here.lon,x:hx,y:hy,
          pathDistanceKm:accumulated+segKm*t,
          directDistanceKm:distanceKm(pts[0],here),
          distancePx:dist};
      }
      accumulated+=segKm;
    }
  }
  return best;
}
