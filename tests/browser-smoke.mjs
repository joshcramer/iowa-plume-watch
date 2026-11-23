import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1280,height:950},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(
    () => document.querySelectorAll('.wind-path-svg path').length >= 2,
    null,{timeout:25000}
  );
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
  await page.waitForFunction(()=>document.querySelectorAll('.leaflet-overlay-pane svg path').length>=3,null,{timeout:10000});
  await page.waitForTimeout(1800);
  const referenceCount=await page.locator('.leaflet-overlay-pane svg path').count();
  assert.ok(referenceCount>=3,'Reference route and site markers must render as SVG');
  assert.ok(details.modelCount>=2,'Forecast models should be populated');
  assert.ok(details.dx<3&&details.dy<3&&details.widthDiff<3,'Overlay must align to map container');
  assert.match(details.status,/path/i,'Overlay status must report paths');
  await page.locator('#map').scrollIntoViewIfNeeded();
  await page.locator('#map').screenshot({path:'browser-map-default.png'});
  const first=await page.locator('.wind-path-svg path').nth(1).getAttribute('d');
  await page.selectOption('#release-select','15');
  await page.locator('#duration-range').fill('4');
  const second=await page.locator('.wind-path-svg path').nth(1).getAttribute('d');
  assert.notEqual(first,second,'Changing release time or duration must change the rendered geometry');
  const before=await page.locator('.wind-path-svg path').count();
  await page.locator('#level-controls input[data-level="10m"]').uncheck();
  const after=await page.locator('.wind-path-svg path').count();
  assert.equal(after,before-2,'Unchecking one wind level removes its halo and line');
  await page.locator('#map').screenshot({path:'browser-map-after-controls.png'});
  assert.deepEqual(errors,[],'No uncaught JavaScript errors');
  console.log('PASS browser map overlay and controls:',details);
} finally {
  await browser.close();
}
