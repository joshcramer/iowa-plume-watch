import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectTrack} from '../assets/js/overlay.js';
test('wind trajectory projection discards invalid values but preserves valid positions',()=>{
  const map={latLngToContainerPoint:([lat,lon])=>({x:lon*2,y:lat*2})};
  const result=projectTrack(map,{points:[{lat:40,lon:-90},{lat:41,lon:-91},{lat:NaN,lon:-92}]});
  assert.deepEqual(result,[[-180,80],[-182,82]]);
});
test('site uses a dedicated SVG overlay for forecast lines',()=>{
  const app=fs.readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../assets/css/style.css',import.meta.url),'utf8');
  assert.match(app,/createTransportOverlay\(map\)/);
  assert.match(app,/transportOverlay\?\.setTracks\(displayTracks\)/);
  assert.doesNotMatch(app,/const path=L\.polyline\(traj\.points/);
  assert.match(css,/#map\{position:relative;isolation:isolate\}/);
});
