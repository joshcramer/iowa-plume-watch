import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { STATION_QUERY } from '../public/js/sampling.js';

const origin=process.env.APP_URL || 'http://127.0.0.1:8080';
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
// CI boots from the dated weather fixture, not a live download for a future notice.
async function matchSeedScenario(page){
  if(process.env.PLUME_SEED_SCENARIO!=='1')return;
  const snapshot=await page.request.get(`${origin}/data/forecast.json`).then(r=>r.json());
  await page.clock.setFixedTime(new Date(`${snapshot.event_date}T16:00:00Z`));
  await page.route('**/data/official-status.json',route=>route.fulfill({json:{scenario_date:snapshot.event_date}}));
}

const page = await browser.newPage({viewport:{width:1280,height:950},deviceScaleFactor:1});
const stationReading=(id,amount,x,y)=>({geometry:{x,y},attributes:{objectid:id,Air_Station_ID:`AS0${id}`,Mon_Date_Time:1795621200000,Mon_Results:amount,Mon_Units:'µg/m3'}});
const sampleFixture={spatialReference:{wkid:4326},features:[stationReading(1,0,-91.3,40.79),stationReading(2,32,-91.43,40.7),stationReading(3,null,-91.6,40.65)]};
await page.route(url=>url.href===STATION_QUERY,route=>route.fulfill({json:sampleFixture,headers:{'access-control-allow-origin':'*'}}));
// Do not let JSON key order decide which weather model opens first.
await page.route('**/data/forecast.json', async route=>{
  const response=await route.fetch();
  const forecast=await response.json();
  if(process.env.PLUME_SEED_SCENARIO==='1')forecast.explore_through='2026-11-26';
  forecast.models=Object.fromEntries(Object.entries(forecast.models).sort(([a],[b])=>a.localeCompare(b)));
  await route.fulfill({response,json:forecast});
});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function checkForecastIntro(page){
  const forecast=page.locator('#forecast');
  assert.equal(await forecast.locator('#forecast-badge').count(),0,'Forecast intro does not show a status badge');
  assert.equal(await forecast.getByText('Wind paths, not an exposure map.',{exact:true}).count(),0,'Forecast intro does not show the standalone warning card');
  assert.equal(await forecast.locator('#updated-at').isVisible(),true,'Keep the forecast fetch timestamp');
}
try {
  await matchSeedScenario(page);
  await page.goto(`${origin}/`,{waitUntil:'domcontentloaded',timeout:30000});
  const credit=page.locator('footer .footer-credit');
  assert.equal(await credit.textContent(),'Designed by Larri and powered by ntnt.');
  assert.equal(await credit.getByRole('link',{name:'Larri',exact:true}).getAttribute('href'),'https://larri.design/');
  assert.equal(await credit.getByRole('link',{name:'ntnt',exact:true}).getAttribute('href'),'https://ntnt-lang.org/');
  const sampling=page.getByRole('tab',{name:'EPA sampling'}), wind=page.getByRole('tab',{name:'Wind forecast'});
  assert.equal(await sampling.getAttribute('aria-selected'),'true');
  await page.locator('.sampling-station').first().waitFor({timeout:12000});
  assert.equal(await page.locator('.sampling-station').count(),3);
  assert.equal(await page.locator('.sampling-station.sampling-at-or-above').getAttribute('fill'),'#c5263d');
  assert.equal(await page.locator('.sampling-station.sampling-missing').count(),1);
  assert.equal(await page.locator('.forecast-path:visible').count(),0);
  assert.equal(await page.locator('#horizon-select').isVisible(),false);
  assert.match(await page.locator('#sampling-list').textContent(),/0 µg\/m³.*11\/25\/26.*9:40 AM CST/);
  await page.getByRole('button',{name:/Xact station AS02/}).click();
  assert.match(await page.locator('.leaflet-popup-content').textContent(),/32 µg\/m³.*At or above screening level/);
  const network=page.getByRole('checkbox',{name:'EPA monitoring locations'});
  const rings=page.getByRole('checkbox',{name:'Distance rings'});
  await page.route('**/Air_Sampling_and_Monitoring_Location/FeatureServer/0/query?*',route=>route.fulfill({
    headers:{'access-control-allow-origin':'*'},json:{spatialReference:{wkid:4326},features:[
      {geometry:{x:-91.9,y:40.49},attributes:{Station_ID:'AS-41',Instrument_Type:'Air Cassette, Summa Cannister'}},
      {geometry:{x:-91.6,y:40.79},attributes:{Station_ID:'AS-42',Instrument_Type:'Dust Trak, AreaRAE, Air Cassette, Summa Cannister'}}
    ]}
  }));
  assert.equal(await page.locator('.epa-location, .sampling-distance-ring').count(),0);
  await network.check();
  await page.locator('.epa-location').first().waitFor({timeout:12000});
  assert.equal(await page.locator('.epa-location').count(),2);
  assert.equal(await page.locator('.sampling-station').count(),3,'Locations do not become lead readings');
  assert.match(await page.locator('#network-status').textContent(),/2 EPA locations.*No lead values/);
  await rings.check();
  assert.equal(await page.locator('.sampling-distance-ring[fill="none"]').count(),3);
  assert.match(await page.locator('#ring-key').textContent(),/5, 10 and 20 miles.*Distance only/);
  await sampling.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await wind.getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('.sampling-station').count(),0);
  assert.equal(await page.locator('.epa-location, .sampling-distance-ring').count(),0);
  assert.match(await page.locator('#event-anchor').textContent(),/11\/25\/26.*9:00 a.m. CST/);
  await page.waitForFunction(
    () => document.querySelectorAll('.wind-path-svg .forecast-path').length >= 2,
    null,{timeout:25000}
  );
  await checkForecastIntro(page);
  const postEvent=page.locator('#post-detonation');
  assert.equal(await postEvent.getByRole('heading',{name:'Controlled detonation reported in Middletown'}).count(),1);
  const footage=postEvent.locator('iframe');
  assert.equal(await footage.count(),1);
  const embed=new URL(await footage.getAttribute('src'));
  assert.equal(embed.origin+embed.pathname,'https://www.facebook.com/plugins/video.php');
  assert.equal(embed.searchParams.get('href'),'https://www.facebook.com/reel/2334713503734323/');
  assert.equal(await postEvent.getByRole('link',{name:'EPA air monitoring and sampling dashboard'}).count(),1);
  assert.match(await page.locator('.official-layout .schedule-label').textContent(),/Pre-detonation/);
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
  const log=page.locator('#official-update-log'), rows=log.locator('li:visible');
  const notable=log.getByRole('button',{name:'Notable events',exact:true}), all=log.getByRole('button',{name:'All events',exact:true});
  await notable.waitFor({state:'visible',timeout:3000});
  const ordered=reviewed.entries.slice().sort((a,b)=>b.published_date.localeCompare(a.published_date));
  const batch=6, older=log.getByRole('button',{name:'Show older events',exact:true});
  const highlights=ordered.filter(entry=>entry.notable===true);
  const dates=()=>rows.locator('time').evaluateAll(nodes=>nodes.map(node=>[node.getAttribute('datetime'),node.textContent.trim()]));
  const datesFor=entries=>entries.map(({published_date:iso})=>[iso,`${iso.slice(5,7)}/${iso.slice(8,10)}/${iso.slice(2,4)}`]);
  assert.equal(await notable.getAttribute('aria-pressed'),'true');
  assert.deepEqual(await dates(),datesFor(highlights.slice(0,batch)));
  const scheduleBefore=await page.locator('#official-heading').textContent();
  const releaseBefore=await page.locator('#release-select').inputValue();
  await all.click();
  assert.equal(await all.getAttribute('aria-pressed'),'true');
  assert.deepEqual(await dates(),datesFor(ordered.slice(0,batch)));
  for(let offset=batch;offset<ordered.length;offset+=batch){
    await older.click();
    const nextHeading=rows.nth(offset).locator('h4');
    assert.equal(await nextHeading.evaluate(heading=>heading===document.activeElement),true);
    assert.deepEqual(await dates(),datesFor(ordered.slice(0,offset+batch)));
  }
  assert.equal(await older.isVisible(),false);
  assert.deepEqual(await rows.locator('a').evaluateAll(links=>links.map(link=>link.getAttribute('href'))),ordered.map(entry=>entry.source_url));
  assert.equal(await page.locator('#official-heading').textContent(),scheduleBefore);
  assert.equal(await page.locator('#release-select').inputValue(),releaseBefore);
  await notable.focus();
  await page.keyboard.press('Enter');
  assert.equal(await notable.getAttribute('aria-pressed'),'true');
  assert.deepEqual(await dates(),datesFor(highlights.slice(0,batch)));
  await all.click();
  assert.deepEqual(await dates(),datesFor(ordered.slice(0,batch)),'Switching filters returns to the latest entries');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  for(const text of ['How the maps are made','Data Origins','Review the source code']){
    assert.equal(await page.getByRole('heading',{name:text,exact:true}).count(),1);
  }
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
  assert.equal(await page.locator('#map-view-toggle, #time-dots-toggle').count(),0,'Removed map controls must not render');
  assert.equal(await page.locator('.model-spread-band').count(),1,'Show a band where the 10 m weather models differ');
  assert.match(await page.locator('#spread-legend').textContent(),/Not a probability or lead exposure area/);
  const bandModels=await page.locator('.model-spread-band').getAttribute('data-models');
  assert.ok(new Set(bandModels.split(',')).size>=2,'The band compares distinct models, not altitudes');
  assert.ok(await page.locator('.forecast-time-label').count()>0,'Show readable time labels on one track');
  const beforeZoom=await page.locator('.forecast-path').first().getAttribute('d');
  const mapBox=await page.locator('#map').boundingBox();
  await page.mouse.move(mapBox.x+mapBox.width/2,mapBox.y+mapBox.height/2);
  await page.mouse.wheel(0,-120);
  await page.waitForFunction(d=>document.querySelector('.forecast-path')?.getAttribute('d')!==d,beforeZoom);
  await page.mouse.wheel(0,120);
  await page.waitForFunction(d=>document.querySelector('.forecast-path')?.getAttribute('d')===d,beforeZoom);
  assert.equal(await page.locator('#timeline-slider').inputValue(),'4');
  assert.match(await page.locator('#timeline-clock').textContent(),/\+4h.*11\/25\/26.*1:00 PM CT/);
  const markerBefore=await page.locator('.wind-path-svg .selected-time-marker').first().locator('circle').first().getAttribute('cx');
  await page.locator('#timeline-slider').fill('2');
  const markerAfter=await page.locator('.wind-path-svg .selected-time-marker').first().locator('circle').first().getAttribute('cx');
  assert.notEqual(markerBefore,markerAfter,'Scrubber must move selected time position on forecast lines');
  assert.match(await page.locator('#timeline-clock').textContent(),/\+2h.*11:00 AM CT/);
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
  await page.getByText('Explore a different start',{exact:true}).click();
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
  assert.equal(await page.locator('.model-spread-band').count(),0,'Hiding 10 m also hides its model spread');
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
    assert.match(await page.locator('#timeline-clock').textContent(),/11\/27\/26.*12:00 PM CT/);
    const pCount=await page.locator('.wind-path-svg .forecast-path').count();
    assert.ok(pCount>=3,'Extended GFS must have multiple 48h paths');
    const warning=await page.locator('#long-range-warning').textContent();
    assert.match(warning,/0 of \d+ paths end before \+48h/,'Extended GFS should not be reported truncated');
    await page.locator('#map').screenshot({path:'browser-map-48h.png'});
  }
    const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  try{
    await matchSeedScenario(mobile);
    await mobile.route(url=>url.href===STATION_QUERY,route=>route.abort());
    await mobile.goto(`${origin}/`,{waitUntil:'domcontentloaded'});
    assert.equal(await mobile.getByRole('tab',{name:'EPA sampling'}).getAttribute('aria-selected'),'true');
    await mobile.getByText('EPA readings could not load.',{exact:false}).waitFor({timeout:12000});
    assert.equal(await mobile.locator('.sampling-station').count(),0);
    await mobile.getByRole('tab',{name:'Wind forecast'}).click();
    await mobile.waitForFunction(()=>document.querySelector('.forecast-path'),null,{timeout:25000});
    await checkForecastIntro(mobile);
    const clipBox=await mobile.locator('#post-detonation iframe').boundingBox();
    assert.ok(clipBox && clipBox.x>=0 && clipBox.x+clipBox.width<=390,'Post-detonation video fits a phone');
    const mobileLayout=await mobile.evaluate(()=>({top:document.querySelector('#map').getBoundingClientRect().top, width:document.documentElement.clientWidth, scroll:document.documentElement.scrollWidth}));
    assert.ok(mobileLayout.top<440,'Map should start within the first phone viewport');
    assert.ok(mobileLayout.scroll<=mobileLayout.width,'Page should not scroll sideways');
    assert.ok(await mobile.locator('footer .footer-credit').isVisible(),'Footer credit is visible on phones');
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
    if(process.env.PLUME_SEED_SCENARIO==='1'){
      const date=page.getByLabel('Hypothetical release date');
      const official=await page.locator('#official-heading').textContent();
      await page.selectOption('#release-select','15');
      await date.selectOption('2026-11-26');
      assert.equal(await page.locator('#release-select').inputValue(),'15','Changing day must not change the release time');
      assert.equal(await page.locator('#horizon-select').inputValue(),'8','Alternate dates offer the local 8-hour view');
      assert.equal(await page.locator('#horizon-select').isDisabled(),true);
      assert.match(await page.locator('#timeline-clock').textContent(),/11\/26\/26.*CT/);
      assert.ok(await page.locator('.wind-path-svg .forecast-path').count()>0,'Alternate day draws its own tracks');
      assert.equal(await page.locator('#official-heading').textContent(),official,'Changing day must not change the Army notice');
      await page.selectOption('#release-select','9');
      assert.equal(await date.inputValue(),'2026-11-26','Changing time must not change the release day');
      await date.selectOption('');
      assert.equal(await page.locator('#horizon-select').isEnabled(),true);
      assert.equal(await page.locator('#release-select').inputValue(),'9');
    }
    await page.locator('#reset-wind').click();
    assert.match(await page.locator('#timeline-start').textContent(),/REPORTED DETONATION/);
    await sampling.click();
    assert.equal(await page.locator('.sampling-station').count(),3);
    assert.equal(await page.locator('.epa-location').count(),2);
    assert.equal(await page.locator('.sampling-distance-ring').count(),3);
    await network.uncheck();
    await rings.uncheck();
    assert.equal(await page.locator('.epa-location, .sampling-distance-ring').count(),0);
    assert.equal(await page.locator('.forecast-path:visible').count(),0);
    assert.deepEqual(errors,[],'No uncaught JavaScript errors');
  console.log('PASS browser map overlay and controls:',details);
} finally {
  await browser.close();
}
