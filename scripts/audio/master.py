from pathlib import Path
import wave,json
import numpy as np
w=Path(__file__).resolve().parent
with wave.open(str(w/'pcm.wav')) as f:
 rate=f.getframerate(); channels=f.getnchannels(); data=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,channels).astype(np.float64)/32768
assert channels==2 and rate==44100
# Gentle, quiet room reflections, no generated noise and no hard transients.
for seconds,level in [(0.083,0.09),(0.137,0.065),(0.223,0.035)]:
 delay=int(seconds*rate);data[delay:]+=level*data[:-delay,::-1].copy()
peak=float(np.max(np.abs(data)));rms=float(np.sqrt(np.mean(data**2)));assert peak>.005 and rms>.001,(peak,rms)
data*=min(.72/peak,.105/rms)
fade=int(.07*rate);data[:fade]*=np.sin(np.linspace(0,np.pi/2,fade))[:,None]**2
fade=int(2.0*rate);data[-fade:]*=np.cos(np.linspace(0,np.pi/2,fade))[:,None]**2
out=(data*32767).round().astype('<i2')
def save(path,samples):
 with wave.open(str(path),'w')as f:f.setnchannels(channels);f.setsampwidth(2);f.setframerate(rate);f.writeframes(samples.tobytes())
save(w/'qinhuai-evening.wav',out)
preview=out[int(14*rate):int(42*rate)].copy().astype(np.float64)
f=int(.5*rate);preview[:f]*=np.linspace(0,1,f)[:,None];preview[-f:]*=np.linspace(1,0,f)[:,None]
save(w/'preview.wav',preview.astype('<i2'))
report={'title':'秦淮晚风','durationSeconds':len(data)/rate,'sampleRate':rate,'channels':channels,'peak':float(np.max(np.abs(data))),'rms':float(np.sqrt(np.mean(data**2))),'clippedSamples':int(np.sum(np.abs(out)>=32767)),'loopBoundaryJump':float(np.max(np.abs(data[0]-data[-1])))}
(w/'analysis.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
