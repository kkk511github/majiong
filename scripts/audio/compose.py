from pathlib import Path
import json, random
w=Path(__file__).resolve().parent
rng=random.Random(20260914)
beat=60/72
# Original D-pentatonic melody. A sparse first verse, answering phrases, then a quiet cadence.
phrases=[
 [(0,74,1.4),(1.5,78,.7),(2.5,76,1.1)],
 [(0,74,1),(1.25,71,1),(2.5,69,1.25)],
 [(0,71,1.3),(1.5,74,.9),(3,78,.65)],
 [(0,76,1.4),(2,74,1.5)],
 [(0,74,.9),(1,78,.85),(2,81,1.5)],
 [(0,78,1.2),(1.5,76,.9),(3,74,.6)],
 [(0,71,1.3),(1.5,69,1),(3,66,.65)],
 [(0,69,1.2),(2,74,1.2)],
 [(0,81,1.3),(1.5,78,1),(3,76,.7)],
 [(0,78,.9),(1.25,76,.9),(2.5,74,1.2)],
 [(0,71,1.5),(2,74,1.25)],
 [(0,76,1.1),(1.5,74,.9),(3,71,.65)],
 [(0,69,.9),(1.25,71,.9),(2.5,74,1.2)],
 [(0,78,1.4),(2,76,1.25)],
 [(0,74,1.3),(1.75,69,1.2)],
 [(0,74,2.1)],
]
# D6/9, Bm7, Gmaj7 and A-sus: open voicings keep the melody gentle.
chords=[[50,57,62,66,69],[47,54,59,62,66],[43,50,55,59,62],[45,52,57,62,64]]
notes=[]
def add(bar,offset,pitch,length,velocity,part=0):
 notes.append(dict(time=max(0,(bar*4+offset)*beat),duration=length*beat,pitch=pitch,velocity=max(20,min(100,velocity+rng.randrange(-3,4))),part=part))
for bar in range(32):
 chord=chords[[0,1,2,3,0,3,1,2][bar%8]]
 if bar>=28: chord=chords[[2,3,0,0][bar-28]]
 # Piano left hand, softened and spaced to leave room for tile calls.
 add(bar,0,chord[0],2.8,43)
 for j,off in enumerate([.5,1.5,2.5,3.25]):
  if bar==31 and off>=2: continue
  add(bar,off,chord[2+j%3],1.1,35)
 if bar>=4 and bar<28:
  for j,off in enumerate([0,1,2.0,3]):
   add(bar,off+.035,chord[1+j%4],1.7,36,1)
 if 4<=bar<28:
  phrase=phrases[(bar-4)%16]
  for off,n,d in phrase: add(bar,off+.012,n,d,58 if bar<20 else 54)
 if bar in [11,15,23,27]:
  add(bar,0,phrases[(bar-4)%16][0][1]-12,2.8,40,2)
 if bar in [1,3]: add(bar,1,74 if bar==1 else 69,2,47)
 if bar>=28:
  for off,n,d in phrases[bar-16]: add(bar,off,n,d,48-(bar-28)*3)
# Keep the last second deliberately airy; soft fades make the loop join click-free.
score={'title':'秦淮晚风','bpm':72,'duration':32*4*beat,'notes':notes}
(w/'score.json').write_text(json.dumps(score,ensure_ascii=False,indent=2)+'\n')
print(len(notes),score['duration'])
