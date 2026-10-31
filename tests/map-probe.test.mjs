import test from 'node:test';
import assert from 'node:assert/strict';
import {mapProbe} from '../src/ui/map-probe.js';

const world={width:4,height:2,layers:{ownership:new Uint16Array([1,1,0,0,0,0,0,0]),population:new Float64Array([1200,800,0,0,0,0,0,0]),economicOutput:new Float64Array([12000000,8000000]),productivity:new Float32Array([10000,10000]),tradeAccess:new Float32Array([.6,.4]),elevation:new Float32Array([100,200,-30,-60,100,100,100,100]),annualTemperature:new Float32Array([20,21,10,11,0,0,0,0]),temperature:new Float32Array(96).fill(5),annualPrecipitation:new Float32Array(8).fill(1200),precipitation:new Float32Array(96).fill(75)},meta:{civilization:{nations:[{id:1,name:'Valoria',population:2000,economicOutput:20000000,gdpPerCapita:10000,technology:.7}]}}};
test('middle-click statistics distinguish cell values from national totals',()=>{
 const local=mapProbe(world,'economy',0),national=mapProbe(world,'economy-nations',1);assert.equal(local.heading,'Valoria');assert.ok(local.rows.some(([key,value])=>key==='Annual cell output'&&value==='12,000,000 WU'));assert.ok(national.rows.some(([key,value])=>key==='Annual national output'&&value==='20,000,000 WU'));assert.equal(national.kind,'nation');assert.equal(national.id,1);assert.ok(mapProbe(world,'technology',0).rows.some(([key,value])=>key==='Technology'&&value==='70 / 100'));
});
test('map probes use selected month and gracefully handle oceans and worlds without civilizations',()=>{
 assert.ok(mapProbe(world,'temperature',0,0).rows[0][1].startsWith('5'));assert.ok(mapProbe(world,'precipitation',0,0).rows[0][1].startsWith('75'));assert.ok(mapProbe(world,'population',2).rows.every(([,value])=>!String(value).includes('NaN')));const physical={...world,meta:{},layers:{...world.layers,ownership:undefined}};assert.equal(mapProbe(physical,'elevation',0).kind,null);assert.ok(mapProbe(physical,'elevation',0).rows.some(([key,value])=>key==='Elevation'&&value==='100 m'));
});
