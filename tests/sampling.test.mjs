import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseReadings,readingCategory,formatReading,EVENT,STATION_QUERY} from '../public/js/sampling.js';

const time=Date.parse('2026-11-25T15:00:00Z');
const feature=(id,station,value,when=time,units='µg/m3')=>({
  attributes:{objectid:id,Air_Station_ID:station,Mon_Date_Time:when,Mon_Results:value,Mon_Units:units},
  geometry:{x:-91.4,y:40.7}
});
const payload=features=>({spatialReference:{wkid:4326},features});

test('queries the existing EPA results layer and pins the documented Central hour',()=>{
  assert.match(STATION_QUERY,/\/IAAAP_Xact_Data_Public_Viewer\/FeatureServer\/0\/query\?/);
  assert.equal(new URL(STATION_QUERY).searchParams.get('outSR'),'4326');
  assert.deepEqual([EVENT.date,EVENT.hour],['2026-11-25',9]);
});

test('keeps only the newest published value per station, without rounding away small numbers',()=>{
  const rows=parseReadings(payload([feature(2,'AS01',5,time-1),feature(5,'AS01',0),feature(1,'AS02',.002084),feature(4,'AS02',.003),feature(6,'AS03',31.999999)]));
  assert.deepEqual(rows.map(r=>[r.station,r.value,r.when]),[['AS01',0,time],['AS02',.003,time],['AS03',31.999999,time]]);
  assert.equal(formatReading(.002084),'0.002084');
  assert.equal(formatReading(31.999999),'31.999999');
  assert.equal(formatReading(0),'0');
});

test('reports unknown separately from zero and flags screening levels inclusively',()=>{
  const rows=parseReadings(payload([feature(1,'AS01',8,time-1),feature(2,'AS01',null),feature(3,'AS02',32),feature(4,'AS03',500,'2026-11-25T15:00Z'),feature(5,'AS04',45,time,'mg/m3')]));
  assert.deepEqual(rows.map(r=>[r.station,r.value]),[['AS01',null],['AS02',32],['AS04',null]]);
  assert.deepEqual([null,0,31.999999,32,50].map(readingCategory),['missing','below','below','at-or-above','at-or-above']);
});

test('rejects a service error, unsafe coordinates and an unexpected coordinate system',()=>{
  assert.throws(()=>parseReadings({error:{code:400}}));
  assert.throws(()=>parseReadings({spatialReference:{wkid:3857},features:[]}));
  assert.deepEqual(parseReadings(payload([])),[]);
  const broken={...feature(1,'AS01',4),geometry:{x:-200,y:'40'}};
  assert.throws(()=>parseReadings(payload([broken])));
});
