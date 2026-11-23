/**
 * Transparent 2-D atmospheric TRANSPORT SCREENING, not dispersion or lead deposition.
 *
 * Winds: Open-Meteo's hourly NOAA forecast winds, sampled at 7x7 locations.
 * Wind direction is the meteorological direction FROM which air arrives.
 * Sampling: bilinear spatial interpolation and linear time interpolation of u/v.
 * Integrator: midpoint / RK2, 15-minute steps, at a fixed nominal wind level.
 * Omissions: plume rise, vertical motion/shear coupling, turbulent mixing, chemical
 * releases, particle sizes, gravitational settling, wet/dry deposition, terrain,
 * near-field blast dynamics, measurement assimilation and forecast skill.
 */
export const EVENT_DATE = '2026-11-25';
export const PLANT = { lat: 40.825518, lon: -91.266502, name: 'Iowa Army Ammunition Plant' };
export const LEVELS = [
  { key: '10m', label: '10 m above ground', short: '10 m', color: '#62dee2', note: 'Near-surface wind' },
  { key: '80m', label: '80 m above ground', short: '80 m', color: '#91e5a7', note: 'Low-altitude wind' },
  { key: '925hPa', label: '925 hPa pressure', short: '925 hPa', color: '#f6be70', note: 'Roughly 0.8 km above sea level, not ground' },
  { key: '850hPa', label: '850 hPa pressure', short: '850 hPa', color: '#dd99fa', note: 'Roughly 1.5 km above sea level, not ground' },
];
export const PLACES = {
  airport: { lat: 41.8847, lon: -91.7108, name: 'CID · Eastern Iowa Airport' },
  davenport: { lat: 41.5236, lon: -90.5776, name: 'Davenport' },
  cedar: { lat: 41.9779, lon: -91.6656, name: 'Cedar Rapids' },
  iowacity: { lat: 41.6608, lon: -91.5302, name: 'Iowa City' },
  burlington: { lat: 40.8077, lon: -91.1228, name: 'Burlington' },
  fortmadison: { lat: 40.6298, lon: -91.3152, name: 'Fort Madison' },
};
// Approximate waypoints, NOT GPS routing or a formal buffer/hazard corridor.
export const ROUTE = [
  { lat: 41.8847, lon: -91.7108 },
  { lat: 41.6979, lon: -91.6152 },
  { lat: 41.6740, lon: -91.3480 },
  { lat: 41.6200, lon: -91.0250 },
  { lat: 41.6200, lon: -90.7700 },
  { lat: 41.5236, lon: -90.5776 },
];
const DEG_TO_RAD = Math.PI / 180;

export function fromWind(speedKmh, meteorologicalFromDegrees) {
  if (!Number.isFinite(speedKmh) || !Number.isFinite(meteorologicalFromDegrees)) return null;
  const r = meteorologicalFromDegrees * DEG_TO_RAD;
  return { eastKmh: -speedKmh * Math.sin(r), northKmh: -speedKmh * Math.cos(r) };
}
export function toCompass(deg) {
  if (!Number.isFinite(deg)) return '—';
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
export function headingTo(speedKmh, from) {
  return Number.isFinite(from) ? (from + 180) % 360 : null;
}
function bounds(sorted, n) {
  if (n < sorted[0] || n > sorted[sorted.length - 1]) return null;
  if (n === sorted[sorted.length - 1]) return [sorted.length - 2, 1];
  for (let i=0;i<sorted.length-1;i++) if (n >= sorted[i] && n <= sorted[i+1]) {
    return [i, (n - sorted[i]) / (sorted[i+1] - sorted[i])];
  }
  return null;
}
function lerp(a,b,f) { return a+(b-a)*f; }
function getAt(location, levelKey, hourIndex, fraction) {
  const h = location.hourly;
  if (!h) return null;
  const s = h[`wind_speed_${levelKey}`], d = h[`wind_direction_${levelKey}`];
  if (!s || !d || hourIndex+1 >= s.length) return null;
  const v0 = fromWind(s[hourIndex],d[hourIndex]), v1 = fromWind(s[hourIndex+1],d[hourIndex+1]);
  if (!v0 || !v1) return null;
  return { eastKmh:lerp(v0.eastKmh,v1.eastKmh,fraction), northKmh:lerp(v0.northKmh,v1.northKmh,fraction) };
}

/** Return interpolated forecast winds in km/h, or null (never extrapolate). */
export function sampleWind(model, lat, lon, levelKey, localTime, fractionalHour=0) {
  if (!model?.locations?.length || !model.grid) return null;
  const la = bounds(model.grid.lats,lat), lo=bounds(model.grid.lons,lon);
  if (!la || !lo) return null;
  const columns = model.grid.lons.length;
  const idx = model.locations[0].hourly?.time?.indexOf(localTime) ?? -1;
  if (idx < 0) return null;
  const [i,fy]=la,[j,fx]=lo;
  const a=getAt(model.locations[i*columns+j],levelKey,idx,fractionalHour),
    b=getAt(model.locations[i*columns+j+1],levelKey,idx,fractionalHour),
    c=getAt(model.locations[(i+1)*columns+j],levelKey,idx,fractionalHour),
    d=getAt(model.locations[(i+1)*columns+j+1],levelKey,idx,fractionalHour);
  if (!a||!b||!c||!d) return null;
  return { eastKmh: lerp(lerp(a.eastKmh,b.eastKmh,fx),lerp(c.eastKmh,d.eastKmh,fx),fy),
           northKmh:lerp(lerp(a.northKmh,b.northKmh,fx),lerp(c.northKmh,d.northKmh,fx),fy) };
}
export function sourceWind(model, levelKey, releaseHour, date=EVENT_DATE) {
  const sample = sampleWind(model, PLANT.lat, PLANT.lon,levelKey,`${date}T${String(releaseHour).padStart(2,'0')}:00`,0);
  if (!sample) return null;
  const speedKmh = Math.hypot(sample.eastKmh,sample.northKmh);
  const comingFrom = (Math.atan2(-sample.eastKmh,-sample.northKmh) / DEG_TO_RAD +360)%360;
  return { speedKmh, comingFrom, headingTo:(comingFrom+180)%360 };
}
function offset(p,wind,hours) {
  const lat = p.lat + wind.northKmh*hours/111.195;
  const lon = p.lon + wind.eastKmh*hours/(111.195*Math.cos(p.lat*DEG_TO_RAD));
  return {lat,lon};
}
/**
 * Track one non-dispersing, non-settling air parcel at a fixed nominal wind level.
 * Every step uses spatial and temporal interpolation; returns truncated flag if
 * winds become unavailable, time exits series, or parcel exits the sample grid.
 */
export function integrate(model, levelKey, releaseHour=12, durationHours=8, date=EVENT_DATE) {
  const pts=[{lat:PLANT.lat,lon:PLANT.lon,h:0}], dt=0.25;
  let position={lat:PLANT.lat,lon:PLANT.lon};
  for (let step=0; step<Math.round(durationHours/dt);step++) {
    const elapsed=step*dt;
    const t0=releaseHour+elapsed;
    const hr0=Math.floor(t0),frac0=t0-hr0;
    const date0=localHour(date,hr0);
    const wind0=sampleWind(model,position.lat,position.lon,levelKey,date0,frac0);
    if (!wind0) return {points:pts, truncated:true, reason:`Missing forecast or outside sampled grid at +${elapsed.toFixed(2)} h`};
    const mid=offset(position,wind0,dt/2);
    const tm=releaseHour+elapsed+dt/2, hrm=Math.floor(tm),fracm=tm-hrm;
    const windMid=sampleWind(model,mid.lat,mid.lon,levelKey,localHour(date,hrm),fracm);
    if (!windMid) return {points:pts,truncated:true,reason:'Parcel left sampled grid or wind was missing'};
    position=offset(position,windMid,dt);
    pts.push({...position,h:elapsed+dt});
  }
  return {points:pts,truncated:false,reason:null};
}
export function localHour(date, hour) {
  // Date arithmetic in UTC only to form wall-clock date labels; no instant conversion.
  const d = new Date(`${date}T00:00:00Z`);d.setUTCHours(d.getUTCHours()+hour);
  return `${d.toISOString().slice(0,10)}T${d.toISOString().slice(11,13)}:00`;
}
export function distanceKm(p,q) {
  const dy=(p.lat-q.lat)*111.195;
  const dx=(p.lon-q.lon)*111.195*Math.cos((p.lat+q.lat)/2*DEG_TO_RAD);
  return Math.hypot(dx,dy);
}
// Line segment distance in a local approximate plane: a geographic screening
// metric, NOT route safety, exposure probability, or predicted deposition.
export function closestToRoute(path, route=ROUTE) {
  if (!path?.length) return null;
  const origin=PLANT,cos=Math.cos(origin.lat*DEG_TO_RAD);
  const xy=p=>[(p.lon-origin.lon)*111.195*cos,(p.lat-origin.lat)*111.195];
  let best=Infinity;
  for (const p of path) {
    const [x,y]=xy(p);
    for(let i=0;i<route.length-1;i++) {
      const [ax,ay]=xy(route[i]),[bx,by]=xy(route[i+1]);
      const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
      const t=Math.max(0,Math.min(1,den?((x-ax)*dx+(y-ay)*dy)/den:0));
      best=Math.min(best,Math.hypot(x-(ax+t*dx),y-(ay+t*dy)));
    }
  }
  return best;
}
export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== 1 || typeof snapshot.models !== 'object') throw Error('Unrecognized forecast data format');
  const models=Object.values(snapshot.models).filter(m=>m?.locations?.length && m?.grid?.lats?.length>=2 && m?.grid?.lons?.length>=2);
  if (!models.length) throw Error('Snapshot has no usable forecast fields');
  return snapshot;
}
