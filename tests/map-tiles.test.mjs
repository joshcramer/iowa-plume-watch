import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../assets/js/app.js', import.meta.url),'utf8');
test('Leaflet basemap uses no-key OpenStreetMap Standard tiles with attribution',()=>{
  assert.match(app,/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.doesNotMatch(app,/basemaps\.cartocdn\.com/);
  assert.match(app,/openstreetmap\.org\/copyright/);
});
