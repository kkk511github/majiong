from pathlib import Path
import av, numpy as np, json, hashlib, argparse, zipfile, io
from fractions import Fraction
parser=argparse.ArgumentParser(description='Import the user-provided lobby and table BGM archive')
parser.add_argument('archive',type=Path)
args=parser.parse_args()
project=Path(__file__).resolve().parents[2]
archive=zipfile.ZipFile(args.archive)
report=[]
for scene,cn in [('lobby','大厅'),('table','牌局')]:
 source=Path(f'微乐麻将_{cn}背景音乐.mp3')
 data=archive.read(str(source))
 c=av.open(io.BytesIO(data));resampler=av.AudioResampler(format='fltp',layout='stereo',rate=44100)
 frames=[]
 for f in c.decode(audio=0): frames.extend(resampler.resample(f))
 frames.extend(resampler.resample(None))
 samples=np.concatenate([f.to_ndarray() for f in frames],axis=1)
 peak=float(np.abs(samples).max());rms=float(np.sqrt(np.mean(samples*samples)))
 gain=min(.8/peak,.065/rms)
 samples*=gain
 fade=round(.03*44100)
 samples[:,:fade]*=np.linspace(0,1,fade)
 samples[:,-fade:]*=np.linspace(1,0,fade)
 target=project/f'public/audio/mahjong-{scene}.m4a'
 out=av.open(str(target),'w');stream=out.add_stream('aac',rate=44100);stream.layout='stereo';stream.bit_rate=128000
 for pos in range(0,samples.shape[1],1024):
  frame=av.AudioFrame.from_ndarray(np.ascontiguousarray(samples[:,pos:pos+1024]),format='fltp',layout='stereo')
  frame.sample_rate=44100;frame.pts=pos;frame.time_base=Fraction(1,44100)
  for packet in stream.encode(frame): out.mux(packet)
 for packet in stream.encode(None):out.mux(packet)
 out.close()
 report.append({'scene':scene,'source':source.name,'sourceSha256':hashlib.sha256(data).hexdigest(),'asset':str(target.relative_to(project)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'duration':samples.shape[1]/44100,'gain':gain,'edgeFadeMs':30,'peakBefore':peak,'rmsBefore':rms})
(project/'docs/bgm-import-0.6.11.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
