import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectTrack,pointAtElapsed,clockAt} from '../public/js/overlay.js';
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
  assert.match(clockAt(12,4,'2026-11-25'),/Nov 25, 4:00 PM CT/);
  assert.match(clockAt(23,2,'2026-12-31'),/Jan 1, 1:00 AM CT/);
});

test('time checkpoint labels are optional and no longer obscure the paths',()=>{
 const src=fs.readFileSync(new URL('../public/js/overlay.js',import.meta.url),'utf8');
 assert.match(src,/let showTimeDots=false/);
 assert.match(src,/if\(showTimeDots\)/);
 assert.doesNotMatch(src,/time-label-bg/);
 assert.doesNotMatch(src,/labelTime\(/);
});
