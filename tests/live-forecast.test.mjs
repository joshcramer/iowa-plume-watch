import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {integrate,sourceWind,validateSnapshot} from '../assets/js/trajectory.js';

// Check against published numerical weather data, not solely synthetic fixtures.
test('published forecast generates visible trajectories from the plant',()=>{
  const snapshot=JSON.parse(fs.readFileSync(new URL('../data/forecast.json',import.meta.url),'utf8'));
  if(snapshot.status!=='forecast')return; // fresh cloned repo can contain the documented pending state.
  validateSnapshot(snapshot);
  let plotted=0;
  for(const [name,model] of Object.entries(snapshot.models)){
    for(const level of ['10m','80m','925hPa','850hPa']){
      if(!model.available_levels.includes(level))continue;
      const wind=sourceWind(model,level,12);
      if(!wind)continue;
      const path=integrate(model,level,12,8);
      assert.ok(Number.isFinite(wind.speedKmh),name+' '+level+' wind');
      assert.ok(path.points.length>=2,name+' '+level+' must draw at least a line');
      assert.ok(path.points.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)),name+' '+level+' finite coordinates');
      plotted++;
    }
  }
  assert.ok(plotted>=3,'At least 3 published wind trajectories must be plottable');
});
