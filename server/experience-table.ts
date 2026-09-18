import { createGame, newPlayer } from '../shared/engine';
import type { Game } from '../shared/types';

/** A server-hosted table uses the original settings and normal game engine. */
export function createExperienceTable(source:Game, code:string, id:string, number:number, now:number):Game {
  if(!source.table || source.table.closed) throw Error('请选择一张现有正式桌');
  const room=createGame(code,id,source.rules);
  room.initialScore=source.initialScore;
  room.settlementBase=source.settlementBase;
  room.scoreDivisor=source.scoreDivisor;
  room.ownerId=source.table.creatorId;
  room.table={
    creatorId:source.table.creatorId,groupId:id,number,createdAt:now,
    settings:structuredClone(source.table.settings),
    experience:{sourceCode:source.code},
  };
  fillExperienceBots(room);
  return room;
}
export function fillExperienceBots(room:Game) {
  if(!room.table?.experience) return;
  for(const seat of [1,2,3] as const) {
    room.players[seat]=newPlayer(`experience-${room.id}-${seat}`,['','秦淮','钟山','莫愁'][seat],true,room.initialScore ?? 90);
    room.players[seat]!.ready=true;
  }
}
