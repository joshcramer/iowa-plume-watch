import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectTrack,pointAtElapsed,clockAt,modelSpread} from '../public/js/overlay.js';
test('wind trajectory projection discards invalid values but preserves valid positions',()=>{
  const map={latLngToContainerPoint:([lat,lon])=>({x:lon*2,y:lat*2})};
  const result=projectTrack(map,{points:[{lat:40,lon:-90},{lat:41,lon:-91},{lat:NaN,lon:-92}]});
  assert.deepEqual(result,[[-180,80],[-182,82]]);
});
test('site uses a dedicated SVG overlay for forecast lines',()=>{
  const app=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/css/styles.css',import.meta.url),'utf8');
  assert.match(app,/createTransportOverlay\(map/);
  assert.match(app,/transportOverlay\?\.setTracks\(displayTracks,/);
  assert.doesNotMatch(app,/const path=L\.polyline\(traj\.points/);
  assert.match(css,/#map\{position:relative;isolation:isolate\}/);
});

test('elapsed time markers interpolate model positions and do not extrapolate',()=>{
  const track={points:[{lat:40,lon:-90,h:0},{lat:42,lon:-92,h:2}]};
  assert.deepEqual(pointAtElapsed(track,1),{lat:41,lon:-91,h:1});
  assert.equal(pointAtElapsed(track,3),null);
  assert.equal(pointAtElapsed(track,-1),null);
});
test('clock labels are relative to the hypothetical release and cross midnight',()=>{
  assert.match(clockAt(12,4,'2026-11-25'),/11\/25\/26, 4:00 PM CT/);
  assert.match(clockAt(23,2,'2026-12-31'),/01\/01\/27, 1:00 AM CT/);
});

test('wind spread needs distinct model tracks and stops at their shared data limit',()=>{
  const map={latLngToContainerPoint:([lat,lon])=>({x:lon,y:lat})};
  const point=(h,lat,lon)=>({h,lat,lon});
  const gfs={model:'gfs',points:[point(0,0,0),point(.25,2,1),point(.5,4,2),point(.75,6,3)]};
  const rrfs={model:'rrfs',points:[point(0,0,0),point(.25,-2,1),point(.5,-4,2)]};
  assert.equal(modelSpread(map,[gfs]).d,'');
  assert.equal(modelSpread(map,[gfs,gfs]).d,'');
  assert.equal(modelSpread(map,[gfs,{...gfs,model:'ecmwf'}]).d,'');
  const band=modelSpread(map,[gfs,rrfs]);
  assert.equal(band.hours,.5);
  assert.deepEqual(band.models,['gfs','rrfs']);
  assert.match(band.d,/2\.00 -4\.00/);
  assert.doesNotMatch(band.d,/3\.00 6\.00/);
});
