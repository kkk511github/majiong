from pathlib import Path
import av,numpy as np,wave,json,hashlib,sys
from tempo import stretch
import argparse,tempfile,zipfile
parser=argparse.ArgumentParser(description="Import the user-provided 南京话语音包 ZIP (PyAV + numpy required)")
parser.add_argument("archive",type=Path);args=parser.parse_args()
temporary=tempfile.TemporaryDirectory();root=Path(temporary.name)
with zipfile.ZipFile(args.archive) as z:
 for info in z.infolist():
  try:name=info.filename.encode('cp437').decode('gb18030')
  except (UnicodeError,LookupError):name=info.filename
  name=name.replace('\\','/')
  if '南京麻将_njyz/' not in name or not name.endswith('.mp3'):continue
  relative=Path(name.split('南京麻将_njyz/',1)[1])
  if '..' in relative.parts or relative.is_absolute():continue
  target=root/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(info))
p=Path(__file__).resolve().parents[2];rate=24000
report={'source':'用户提供的 南京话语音包.zip / 南京麻将_njyz','archiveSha256':hashlib.sha256(args.archive.read_bytes()).hexdigest(),'tempo':.9,'sampleRate':rate,'mappingNote':'按录音内容：33–41 为筒，17–25 为条；二万使用同一说话人的二、万音节，不使用双眼皮外号。','packs':{}}
# Both supplied voices have reversed 筒/条 filenames. This order follows AUDIO.
tiles=[(n+'万',i+1) for i,n in enumerate('一二三四五六七八九')]+[(n+'筒',i+33) for i,n in enumerate('一二三四五六七八九')]+[(n+'条',i+17) for i,n in enumerate('一二三四五六七八九')]+[(n,i+49) for i,n in enumerate('东南西北')]
def decode(file):
 chunks=[];resample=av.AudioResampler(format='s16',layout='mono',rate=rate)
 with av.open(str(file)) as media:
  for frame in media.decode(audio=0):
   chunks.extend(f.to_ndarray().flatten() for f in resample.resample(frame))
  chunks.extend(f.to_ndarray().flatten() for f in resample.resample(None))
 return np.concatenate(chunks).astype(float)/32768
for folder,gender in [('boy','male'),('girl','female')]:
 entries={};parts=[];cursor=0
 def append(file,key,spoken,tile_kind=None):
  global cursor
  provenance={'source':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
  if tile_kind==1:
   # Original card_2 says 双眼皮. Splice this SAME speaker's 二 + 万.
   # Times use original decoded MP3 seconds, before trimming and tempo change.
   er=next((root/folder).glob('card_34_*.mp3'));wan=next((root/folder).glob('card_1_*.mp3'))
   er_end,wan_start=(.445,.29) if gender=='male' else (.405,.39)
   a=decode(er)[:round(er_end*rate)].copy();b=decode(wan)[round(wan_start*rate):].copy()
   a[-120:]*=np.linspace(1,0,120);b[:120]*=np.linspace(0,1,120)
   x=np.r_[a,np.zeros(240),b]
   provenance={'source':'same-speaker 二 + 万','edits':[
    {'source':er.name,'sha256':hashlib.sha256(er.read_bytes()).hexdigest(),'start':0,'end':er_end,'spoken':'二'},
    {'source':wan.name,'sha256':hashlib.sha256(wan.read_bytes()).hexdigest(),'start':wan_start,'end':None,'spoken':'万'}],
    'joinSilenceMs':10,'joinFadeMs':5}
  else:x=decode(file)
  nz=np.flatnonzero(np.abs(x)>.007)
  if len(nz):x=x[max(0,nz[0]-700):min(len(x),nz[-1]+1200)]
  x*=min(1.5,.85/max(.001,np.abs(x).max()))
  fade=min(96,len(x)//2);x[:fade]*=np.linspace(0,1,fade);x[-fade:]*=np.linspace(1,0,fade)
  x=stretch(np.r_[x,np.zeros(2000)],.9,rate)
  x=np.r_[np.zeros(600),x,np.zeros(600)]
  pcm=np.rint(np.clip(x,-.98,.98)*32767).astype('<i2')
  entries[key]={'cue':[round(cursor/rate,6),round(len(x)/rate,6)],'spoken':spoken,**provenance,'pcmSha256':hashlib.sha256(pcm.tobytes()).hexdigest()}
  if tile_kind is not None:entries[key]['tileKind']=tile_kind
  parts.append(x);cursor+=len(x)
 for tile_kind,(spoken,code) in enumerate(tiles):
  append(next((root/folder).glob(f'card_{code}_*.mp3')),f'card_{code}',spoken,tile_kind)
 for event,label in [(2,'碰'),(3,'杠'),(4,'听'),(5,'胡了'),(6,'自摸'),(11,'补花')]:append(next((root/folder).glob(f'event_{event}_*.mp3')),label,label)
 cues=[entries[f'card_{code}']['cue'] for _,code in tiles]+[entries['补花']['cue']]*3
 actions={k:v['cue'] for k,v in entries.items() if not k.startswith('card_')};actions['暗杠']=actions['杠'];actions['补杠']=actions['杠']
 pack={'file':f'/audio/nanjing-{gender}.wav','cues':cues,'actions':actions}
 (p/f'src/nanjing-{gender}.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
 with wave.open(str(p/f'public/audio/nanjing-{gender}.wav'),'wb') as w:
  w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(np.rint(np.clip(np.concatenate(parts),-.98,.98)*32767).astype('<i2').tobytes())
 report['packs'][gender]=entries
(p/'docs/nanjing-voice-import.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('Built male/female sprites: canonical 万/筒/条 order, direct 二万, 6 actions')
