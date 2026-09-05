import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__polana?.snapshot().calls>0);
 const state=()=>page.evaluate(()=>window.__polana.snapshot());
 async function turnTo(angle){
  const before=await state();const positive=angle>before.heading;
  await page.keyboard.down(positive?'ArrowLeft':'ArrowRight');
  await page.waitForFunction(({angle,positive})=>positive?window.__polana.snapshot().heading>=angle-.015:window.__polana.snapshot().heading<=angle+.015,{angle,positive});
  await page.keyboard.up(positive?'ArrowLeft':'ArrowRight');
 }
 async function stop(){const s=await state();for(let i=0;i<s.gait;i++)await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>window.__polana.snapshot().speed<.04);}
 await turnTo(Math.PI*1.5);
 for(let i=0;i<3;i++)await page.keyboard.press('ArrowUp');
 await page.waitForFunction(()=>window.__polana.snapshot().x< -35.6);await stop();
 await turnTo(Math.PI);
 await page.screenshot({path:'artifacts/stable-exterior.png'});
 await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
 await page.waitForFunction(()=>window.__polana.snapshot().z<7.3);await stop();
 assert.equal(await page.locator('#location').textContent(),'Stajnia');
 await page.screenshot({path:'artifacts/stable-aisle-tpp.png'});
 await page.keyboard.press('KeyC');await page.screenshot({path:'artifacts/stable-aisle-fpp.png'});
 await turnTo(Math.PI/2);await page.keyboard.press('ArrowUp');
 await page.waitForFunction(()=>window.__polana.snapshot().x> -31.5);await stop();
 assert.equal(await page.locator('#location').textContent(),'Siodlarnia');
 await page.screenshot({path:'artifacts/stable-tack-room.png'});
 await turnTo(-Math.PI/2);await page.keyboard.press('ArrowUp');
 await page.waitForFunction(()=>window.__polana.snapshot().x< -37.3);await stop();
 await turnTo(-Math.PI);await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowUp');
 await page.waitForFunction(()=>window.__polana.snapshot().z< -17);await stop();
 assert.notEqual(await page.locator('#location').textContent(),'Stajnia');
 assert.deepEqual(errors,[]);console.log('Stable browser check passed: approach, entry TPP/FPP, tack-room entry and exit, rear exit, no page errors.');
}finally{await browser.close();}
