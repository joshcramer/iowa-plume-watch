import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1280,height:950},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(
    () => document.querySelectorAll('.wind-path-svg .forecast-path').length >= 2,
    null,{timeout:25000}
  );
  // Guard against CSS SRI failures: Leaflet JS can work while its CSS is
  // silently rejected, which makes OSM tiles flow outside the map.
  await page.waitForFunction(()=>document.querySelector('#map img.leaflet-tile'),null,{timeout:15000});
  const leafletCss=await page.evaluate(()=>{
    const tile=document.querySelector('#map img.leaflet-tile');
    const map=document.querySelector('#map');
    const pane=document.querySelector('#map .leaflet-tile-pane');
    return {
      tilePosition:getComputedStyle(tile).position,
      panePosition:getComputedStyle(pane).position,
      mapOverflow:getComputedStyle(map).overflow,
      cssLink:document.querySelector('link[href*="leaflet.css"]')?.integrity
    };
  });
  assert.equal(leafletCss.tilePosition,'absolute','Leaflet CSS must position image tiles absolutely; a wrong SRI hash causes jumbled tiles');
  assert.equal(leafletCss.panePosition,'absolute','Leaflet tile pane must be absolutely positioned');
  assert.equal(leafletCss.mapOverflow,'hidden','Map viewport must clip raster tiles');
  assert.equal(leafletCss.cssLink,'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=','Leaflet CSS must use upstream official SRI hash');
    const details=await page.evaluate(()=>{
    const map=document.querySelector('#map');
    const svg=document.querySelector('#map > svg.wind-path-svg');
    const a=map.getBoundingClientRect(), b=svg.getBoundingClientRect();
    return {
      paths:svg.querySelectorAll('path').length,
      counts:svg.dataset.pathCount,
      dx:Math.abs(a.left-b.left),dy:Math.abs(a.top-b.top),
      widthDiff:Math.abs(a.width-b.width),
      modelCount:document.querySelector('#model-select').options.length,
      status:document.querySelector('#overlay-status').textContent
    };
  });
  assert.ok(details.paths>=2,'Visible SVG path shapes must be present');
  // The route and plant marker must not disappear into Leaflet's Canvas layer.
  await page.waitForFunction(()=>document.querySelector('.wind-path-svg .reference-route') && document.querySelector('.wind-path-svg .plant-marker'),null,{timeout:10000});
  await page.waitForTimeout(2000);
  assert.equal(await page.locator('.wind-path-svg .reference-route').count(),1,'Airport route visible on the SVG overlay');
  assert.equal(await page.locator('.wind-path-svg .plant-marker').count(),1,'Detonation site marker visible on the SVG overlay');
  assert.equal(await page.locator('.wind-path-svg .airport-marker').count(),1,'Airport marker visible on the SVG overlay');
  assert.ok(details.modelCount>=2,'Forecast models should be populated');
  assert.ok(details.dx<3&&details.dy<3&&details.widthDiff<3,'Overlay must align to map container');
  assert.match(details.status,/path/i,'Overlay status must report paths');
  await page.locator('#map').scrollIntoViewIfNeeded();

  // A two-hour map label and the scrubber must agree on elapsed time.
  assert.equal(await page.locator('.wind-path-svg .forecast-time-label').count(),0,'Clean default must omit boxed labels');
  assert.equal(await page.locator('.wind-path-svg .hour-tick').count(),0,'Time checkpoints off by default');
  await page.locator('#time-dots-toggle').check();
  assert.ok(await page.locator('.wind-path-svg .hour-tick').count()>0,'Optional time checkpoints appear');
  await page.locator('#time-dots-toggle').uncheck();
  assert.equal(await page.locator('#timeline-slider').inputValue(),'4');
  assert.match(await page.locator('#timeline-clock').textContent(),/\+4h.*Nov 25.*4:00 PM CST/);
  const markerBefore=await page.locator('.wind-path-svg .selected-time-marker').first().locator('circle').first().getAttribute('cx');
  await page.locator('#timeline-slider').fill('2');
  const markerAfter=await page.locator('.wind-path-svg .selected-time-marker').first().locator('circle').first().getAttribute('cx');
  assert.notEqual(markerBefore,markerAfter,'Scrubber must move selected time position on forecast lines');
  assert.match(await page.locator('#timeline-clock').textContent(),/\+2h.*2:00 PM CST/);
  await page.locator('#timeline-slider').fill('4');

  await page.locator('#map').screenshot({path:'browser-map-default.png'});
  const first=await page.locator('.wind-path-svg .forecast-path').first().getAttribute('d');
  await page.selectOption('#release-select','15');
  await page.selectOption('#horizon-select','24');
  assert.equal(await page.locator('#timeline-slider').getAttribute('max'),'24');
  await page.locator('#timeline-slider').fill('4');
  const second=await page.locator('.wind-path-svg .forecast-path').first().getAttribute('d');
  assert.notEqual(first,second,'Changing release time or forecast horizon must update the rendered geometry');
  const before=await page.locator('.wind-path-svg .forecast-path').count();
  await page.locator('#level-controls input[data-level="10m"]').uncheck();
  const after=await page.locator('.wind-path-svg .forecast-path').count();
  assert.equal(after,before-1,'Unchecking one wind level removes its forecast path');
  await page.locator('#map').screenshot({path:'browser-map-after-controls.png'});
  // Extended horizon may be absent if the upstream regional provider failed.
  // When real 48h GFS paths are published, verify the browser can display them.
  const ext=await page.evaluate(async()=>{
    const [near,long]=await Promise.all([fetch('./data/forecast.json').then(r=>r.json()),fetch('./data/extended-tracks.json').then(r=>r.json())]);
    return {matched:long?.source_snapshot_utc===near?.fetched_at_utc,
            coverage:long?.paths?.gfs?.['12']?.['10m']?.hours_reached||0};
  });
  if(ext.matched && ext.coverage>=48){
    await page.selectOption('#model-select','gfs');
    await page.selectOption('#release-select','12');
    await page.selectOption('#horizon-select','48');
    assert.equal(await page.locator('#timeline-slider').getAttribute('max'),'48');
    assert.match(await page.locator('#timeline-clock').textContent(),/Nov 27.*12:00 PM CST/);
    const pCount=await page.locator('.wind-path-svg .forecast-path').count();
    assert.ok(pCount>=3,'Extended GFS must have multiple 48h paths');
    const warning=await page.locator('#long-range-warning').textContent();
    assert.match(warning,/0 of \d+ paths end before \+48h/,'Extended GFS should not be reported truncated');
    await page.locator('#map').screenshot({path:'browser-map-48h.png'});
  }
    assert.deepEqual(errors,[],'No uncaught JavaScript errors');
  console.log('PASS browser map overlay and controls:',details);
} finally {
  await browser.close();
}
