import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin=process.env.APP_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
// CI boots from the dated weather fixture, not a live download for a future notice.
async function matchSeedScenario(page){
  if(process.env.PLUME_SEED_SCENARIO!=='1')return;
  const snapshot=await page.request.get(`${origin}/data/forecast.json`).then(r=>r.json());
  await page.route('**/data/official-status.json',route=>route.fulfill({json:{scenario_date:snapshot.event_date}}));
}

const page = await browser.newPage({viewport:{width:1280,height:950},deviceScaleFactor:1});
// Do not let JSON key order decide which weather model opens first.
await page.route('**/data/forecast.json', async route=>{
  const response=await route.fetch();
  const forecast=await response.json();
  forecast.models=Object.fromEntries(Object.entries(forecast.models).sort(([a],[b])=>a.localeCompare(b)));
  await route.fulfill({response,json:forecast});
});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await matchSeedScenario(page);
  await page.goto(`${origin}/`,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(
    () => document.querySelectorAll('.wind-path-svg .forecast-path').length >= 2,
    null,{timeout:25000}
  );
  assert.equal(await page.locator('.reference-route, .airport-marker, .davenport-marker, #route-distance').count(),0,
    'The public map must not render the personal itinerary, its endpoints, or route-distance readouts');
  assert.equal(await page.locator('img[src*="nov23-"]').count(),0,
    'Archived graphics containing the itinerary must not appear on the page');
  for(const name of ['nov23-transport-screening.png','nov23-wind-sensitivity.png']){
    const result=await page.request.head(`${origin}/assets/images/${name}?check=removed`);
    assert.equal(result.status(),404,'Retired graphics must not be served');
  }
  const reviewed=await page.request.get(`${origin}/data/official-updates.json`).then(r=>r.json());
  assert.ok(reviewed.entries.length>0,'Public update log should have reviewed notices');
  assert.equal(await page.locator('#official-update-log li').count(),reviewed.entries.length);
  assert.equal(await page.locator('#official-update-log li a').first().getAttribute('href'),reviewed.entries[0].source_url);
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
  assert.equal(await page.locator('.wind-path-svg .plant-marker').count(),1,'Detonation site marker visible on the SVG overlay');
  assert.ok(details.modelCount>=2,'Forecast models should be populated');
  assert.ok(details.dx<3&&details.dy<3&&details.widthDiff<3,'Overlay must align to map container');
  assert.match(details.status,/path/i,'Overlay status must report paths');
  await page.locator('#map').scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'Focus on Middletown'}).click();
  const centerError=await page.locator('.wind-path-svg .plant-marker').evaluate(marker=>{
    const svg=marker.ownerSVGElement;
    return Math.hypot(Number(marker.getAttribute('cx'))-svg.clientWidth/2,Number(marker.getAttribute('cy'))-svg.clientHeight/2);
  });
  assert.ok(centerError<3,'The local map view centers on the site marker');
  await page.getByRole('button',{name:'Show full tracks'}).click();

  // A two-hour map label and the scrubber must agree on elapsed time.
  assert.equal(await page.locator('.wind-path-svg .forecast-time-label').count(),0,'Clean default must omit boxed labels');
  assert.equal(await page.locator('.wind-path-svg .hour-tick').count(),0,'Time checkpoints off by default');
  await page.locator('#time-dots-toggle').check();
  assert.ok(await page.locator('.wind-path-svg .hour-tick').count()>0,'Optional time checkpoints appear');
  await page.locator('#time-dots-toggle').uncheck();
  assert.equal(await page.locator('#timeline-slider').inputValue(),'4');
  assert.match(await page.locator('#timeline-clock').textContent(),/\+4h.*Nov 25.*4:00 PM CT/);
  const markerBefore=await page.locator('.wind-path-svg .selected-time-marker').first().locator('circle').first().getAttribute('cx');
  await page.locator('#timeline-slider').fill('2');
  const markerAfter=await page.locator('.wind-path-svg .selected-time-marker').first().locator('circle').first().getAttribute('cx');
  assert.notEqual(markerBefore,markerAfter,'Scrubber must move selected time position on forecast lines');
  assert.match(await page.locator('#timeline-clock').textContent(),/\+2h.*2:00 PM CT/);
  await page.locator('#timeline-slider').fill('4');

  // Hover inspection at the mid-point of a visible active trajectory.
  const hoverPoint=await page.evaluate(()=>{
    const p=document.querySelector('.wind-path-svg .forecast-progress');
    const svg=document.querySelector('.wind-path-svg');
    const box=svg.getBoundingClientRect();
    const at=p.getPointAtLength(p.getTotalLength()*0.65);
    return {x:box.left+at.x,y:box.top+at.y};
  });
  await page.mouse.move(hoverPoint.x,hoverPoint.y);
  await page.waitForFunction(()=>document.querySelector('#track-inspect')?.hidden===false,null,{timeout:10000});
  const inspected=await page.locator('#track-inspect').textContent();
  assert.match(inspected,/modeled path|modeled air parcel/i,'Hover inspector must explain meaning');
  assert.match(inspected,/CT/,'Hover inspector must show event-local clock time');
  assert.match(inspected, /\+\d+h/,'Hover inspector must show elapsed time');
  await page.locator('#map').screenshot({path:'browser-hover-inspect.png'});
  await page.mouse.move(25,25);
  assert.equal(await page.locator('#altitude-compare').count(),0,'No secondary altitude maps');
  assert.equal(await page.locator('#model-select').inputValue(),'gfs','GFS defaults ahead of ECMWF regardless of JSON key order');
  const path80=page.locator('.forecast-path[data-level="80m"]');
  const level80=page.locator('#level-controls input[data-level="80m"]');
  assert.equal(await path80.count(),1,'GFS 80 m path is visible by default');
  await level80.uncheck();
  assert.equal(await path80.count(),0,'Turning off 80 m hides its path');
  await page.selectOption('#model-select','ecmwf');
  assert.ok(await level80.isDisabled(),'ECMWF does not provide 80 m');
  assert.match(await level80.locator('..').textContent(),/Not provided/);
  assert.equal(await path80.count(),0,'Do not substitute another model’s wind');
  await page.selectOption('#model-select','gfs');
  assert.ok(await level80.isEnabled());
  assert.equal(await path80.count(),0,'Switching back preserves the prior checkbox choice');
  await level80.check();
  assert.equal(await path80.count(),1);
  const fonts=await page.locator('select, option, #timeline-play, #map-view-toggle, .metric-value, .status-card h3').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).fontFamily));
  assert.ok(fonts.length && fonts.every(font=>font===fonts[0] && font.includes('system-ui')),'Controls and headings share the system sans family');
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
    assert.match(await page.locator('#timeline-clock').textContent(),/Nov 27.*12:00 PM CT/);
    const pCount=await page.locator('.wind-path-svg .forecast-path').count();
    assert.ok(pCount>=3,'Extended GFS must have multiple 48h paths');
    const warning=await page.locator('#long-range-warning').textContent();
    assert.match(warning,/0 of \d+ paths end before \+48h/,'Extended GFS should not be reported truncated');
    await page.locator('#map').screenshot({path:'browser-map-48h.png'});
  }
    const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  try{
    await matchSeedScenario(mobile);
    await mobile.goto(`${origin}/`,{waitUntil:'domcontentloaded'});
    await mobile.waitForFunction(()=>document.querySelector('.forecast-path'),null,{timeout:25000});
    const mobileLayout=await mobile.evaluate(()=>({top:document.querySelector('#map').getBoundingClientRect().top, width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth}));
    assert.ok(mobileLayout.top<440,'Map should start within the first phone viewport');
    assert.ok(mobileLayout.scroll<=mobileLayout.width,'Page should not scroll sideways');
    assert.equal(await mobile.locator('#altitude-compare').count(),0);
    assert.equal(await mobile.locator('.reference-route, #route-distance, img[src*="nov23-"]').count(),0);
    const labelFits=await mobile.locator('.map-reference-label').evaluate(label=>{
      const box=label.getBoundingClientRect(), map=label.ownerSVGElement.getBoundingClientRect();
      return box.left>=map.left && box.right<=map.right;
    });
    assert.ok(labelFits,'The site label should stay inside the mobile map');
    await mobile.setViewportSize({width:320,height:844});
    const narrowFits=await mobile.evaluate(()=>{
      const shell=document.querySelector('.header-content').getBoundingClientRect();
      return document.querySelector('.github-button').getBoundingClientRect().right<=shell.right+1 &&
        document.documentElement.scrollWidth<=document.documentElement.clientWidth;
    });
    assert.ok(narrowFits,'Wordmark and GitHub link should fit together at 320 px');
  }finally{await mobile.close();}
    assert.deepEqual(errors,[],'No uncaught JavaScript errors');
  console.log('PASS browser map overlay and controls:',details);
} finally {
  await browser.close();
}
