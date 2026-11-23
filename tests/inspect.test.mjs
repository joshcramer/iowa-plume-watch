import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNearestTrack,distanceKm,formatElapsed} from '../public/js/inspect.js';
test('hover inspection interpolates exact elapsed time and traveled distance',()=>{
 const track={key:'850hPa',label:'850 hPa',color:'#d9a2ff',
   points:[{lat:40,lon:-91,h:0},{lat:41,lon:-91,h:2},{lat:42,lon:-91,h:4}]};
 const project=p=>({x:p.lon*10,y:p.lat*10});
 const match=inspectNearestTrack([track],project,-909.7,410,12);
 assert.ok(match);
 assert.equal(match.levelKey,'850hPa');
 assert.ok(Math.abs(match.elapsedHours-2)<.05);
 assert.ok(match.pathDistanceKm>100&&match.pathDistanceKm<120);
 assert.ok(match.directDistanceKm>100&&match.directDistanceKm<120);
 assert.equal(inspectNearestTrack([track],project,-1000,500,12),null);
 assert.equal(formatElapsed(3.25),'+3h 15m');
});
