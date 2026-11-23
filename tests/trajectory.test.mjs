import test from 'node:test';
import assert from 'node:assert/strict';
import {PLANT,fromWind,integrate,localHour,sampleWind,sourceWind,closestToRoute,toCompass} from '../assets/js/trajectory.js';
function fakeModel(speed=20,dir=45){
  const lats=[39,40,41,42,43],lons=[-94,-92,-90,-88],locations=[];
  const time=Array.from({length:48},(_,i)=>localHour('2026-11-25',i));
  for(const lat of lats)for(const lon of lons){
    const hourly={time};
    for(const level of ['10m','80m','925hPa','850hPa']){
      hourly[`wind_speed_${level}`]=time.map(()=>speed);
      hourly[`wind_direction_${level}`]=time.map(()=>dir);
    }
    locations.push({requested_lat:lat,requested_lon:lon,hourly});
  }
  return {grid:{lats,lons},locations};
}
test('meteorological wind FROM north transports south',()=>{
  const w=fromWind(25,0);assert.ok(Math.abs(w.eastKmh)<1e-10);assert.equal(w.northKmh,-25);
});
test('NE wind produces a SW 2-hour parcel displacement',()=>{
  const model=fakeModel(20,45);const output=integrate(model,'850hPa',12,2);
  assert.equal(output.truncated,false);assert.equal(output.points.length,9);
  const end=output.points.at(-1);assert.ok(end.lat<PLANT.lat&&end.lon<PLANT.lon);
  const approximate=Math.hypot((end.lat-PLANT.lat)*111,(end.lon-PLANT.lon)*85);
  assert.ok(approximate>35&&approximate<45);
});
test('sampled wind and heading never confuse from vs toward',()=>{
  const model=fakeModel(10,225);const wind=sourceWind(model,'10m',12);
  assert.ok(Math.abs(wind.comingFrom-225)<.001);assert.ok(Math.abs(wind.headingTo-45)<.001);
  assert.equal(toCompass(wind.headingTo),'NE');
});
test('missing forecast data does not create extrapolated tracks',()=>{
  const model=fakeModel();model.locations[0].hourly.wind_speed_850hPa.fill(null);
  assert.equal(sampleWind(model,38,0,'850hPa','2026-11-25T12:00'),null);
  assert.equal(closestToRoute([{lat:PLANT.lat,lon:PLANT.lon}])>0,true);
});
test('clock crosses from Nov 25 to Nov 26 without bad labels',()=>{
  assert.equal(localHour('2026-11-25',25),'2026-11-26T01:00');
});
