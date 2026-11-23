import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNearestTrack,distanceKm,formatElapsed} from '../public/js/inspect.js';
import {sharedProjection,atHour} from '../public/js/minimaps.js';
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
test('mini-map interpolation never extrapolates past valid data',()=>{
 const pts=[{lat:40,lon:-91,h:0},{lat:42,lon:-93,h:4}];
 assert.deepEqual(atHour(pts,2),{lat:41,lon:-92});
 assert.equal(atHour(pts,6),null);
});
test('mini-map geographic projection remains shared across multiple altitudes',()=>{
 const plant={lat:40.8,lon:-91.2};
 const a={key:'10m',points:[{lat:40.8,lon:-91.2,h:0},{lat:37,lon:-88,h:48}]};
 const b={key:'850hPa',points:[{lat:40.8,lon:-91.2,h:0},{lat:32,lon:-79,h:48}]};
 const project=sharedProjection([a,b],[{lat:41.5,lon:-90.5}],plant);
 const origin=project(plant),p1=project(a.points.at(-1)),p2=project(b.points.at(-1));
 assert.ok([origin,p1,p2].every(p=>p.x>=0&&p.x<=500&&p.y>=0&&p.y<=246));
 assert.notDeepEqual(p1,p2);
 assert.ok(Number.isFinite(distanceKm(plant,a.points.at(-1))));
});
