import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarRange,placementConflict,persistGesture} from '../public/planning-gestures.js';

test('les gestes conservent les instants réels et refusent les plages invalides',()=>{
  assert.deepEqual(calendarRange(new Date('2026-11-09T09:15:00+01:00'),null,120),{starts_at:'2026-11-09T08:15:00.000Z',ends_at:'2026-11-09T10:15:00.000Z'});
  assert.deepEqual(calendarRange('2026-10-25T01:30:00+02:00','2026-10-25T03:30:00+01:00'),{starts_at:'2026-10-24T23:30:00.000Z',ends_at:'2026-10-25T02:30:00.000Z'});
  for(const [start,end] of [['invalid',null],['2026-11-09T12:00Z','2026-11-09T09:00Z'],['2026-11-09T09:00Z','2026-11-10T09:01Z']])assert.throws(()=>calendarRange(start,end));
});
test('le déplacement contrôle les collisions entre sites et les indisponibilités',()=>{
  const range=calendarRange('2026-11-09T08:00Z','2026-11-09T11:00Z');
  const data={people:[{id:'lea'},{id:'sami'}],shifts:[{id:'a',member_id:'lea',site_id:'other',...range}],availability:[]};
  assert.match(placementConflict(data,{member_id:'lea',...range}),/déjà affectée/);
  assert.equal(placementConflict(data,{id:'a',member_id:'lea',...range}),'');
  assert.equal(placementConflict(data,{member_id:'sami',...range}),'');
  data.availability.push({member_id:'sami',kind:'unavailable',...range});
  assert.match(placementConflict(data,{member_id:'sami',...range}),/indisponible/);
  assert.equal(placementConflict(data,{member_id:'lea',...calendarRange('2026-11-09T11:00Z',null,60)}),'');
});
test('un conflit serveur ou une panne rétablit visuellement le créneau',async()=>{
  for(const message of ['409 : affectation modifiée par une autre personne','Réseau indisponible']){
    const events=[];const result=await persistGesture({save:async()=>{throw new Error(message);},revert:()=>events.push('revert'),onError:value=>events.push(value)});
    assert.deepEqual(result,{ok:false});assert.deepEqual(events,['revert',message]);
  }
  let reverted=false;const result=await persistGesture({save:async()=>({id:'saved'}),revert:()=>{reverted=true;}});
  assert.equal(result.value.id,'saved');assert.equal(reverted,false);
});
