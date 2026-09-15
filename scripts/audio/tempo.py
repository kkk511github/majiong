from fractions import Fraction
import av
import numpy as np

def stretch(x,tempo=.85,rate=24000):
    graph=av.filter.Graph()
    source=graph.add_abuffer(sample_rate=rate,format='s16',layout='mono',time_base=Fraction(1,rate))
    pace=graph.add('atempo',str(tempo));sink=graph.add('abuffersink')
    source.link_to(pace);pace.link_to(sink);graph.configure()
    data=np.rint(np.clip(x,-1,1)*32767).astype(np.int16)[None,:]
    frame=av.AudioFrame.from_ndarray(data,format='s16',layout='mono')
    frame.sample_rate=rate;frame.pts=0;frame.time_base=Fraction(1,rate)
    graph.push(frame);graph.push(None)
    parts=[]
    while True:
        try: parts.append(graph.pull().to_ndarray().reshape(-1))
        except (av.error.EOFError,av.error.BlockingIOError): break
    return np.concatenate(parts).astype(float)/32768
