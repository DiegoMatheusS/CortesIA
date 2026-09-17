import json, subprocess, os, resource, pathlib, math
from .models import ProcessingError

def _limits():
    resource.setrlimit(resource.RLIMIT_NOFILE,(256,256))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    resource.setrlimit(resource.RLIMIT_FSIZE,(12_000_000_000,12_000_000_000))
def command(args,timeout=7200):
    try:
        p=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=False,preexec_fn=_limits)
    except subprocess.TimeoutExpired:raise ProcessingError('MEDIA_TIMEOUT',True)
    if p.returncode:raise ProcessingError('MEDIA_COMMAND_FAILED')
    return p.stdout

def probe(source,max_bytes=5_000_000_000,max_duration_ms=10_800_000):
    source=pathlib.Path(source)
    if source.stat().st_size>max_bytes:raise ProcessingError('FILE_TOO_LARGE')
    raw=command(['ffprobe','-v','error','-protocol_whitelist','file,pipe','-show_streams','-show_format','-of','json',str(source)],30)
    try:
        data=json.loads(raw);video=next(s for s in data['streams'] if s['codec_type']=='video')
        duration=int(float(data['format']['duration'])*1000)
    except (KeyError,ValueError,StopIteration):raise ProcessingError('INVALID_MEDIA')
    formats=set(data['format'].get('format_name','').split(','))
    if not formats.intersection({'mov','mp4','matroska','webm'}):raise ProcessingError('UNSUPPORTED_CONTAINER')
    if video.get('codec_name') not in {'h264','hevc','vp8','vp9','av1','mpeg4','prores'}:raise ProcessingError('UNSUPPORTED_CODEC')
    if not 0<duration<=max_duration_ms:raise ProcessingError('INVALID_DURATION')
    width,height=int(video['width']),int(video['height'])
    if max(width,height)>4096 or min(width,height)>2160:raise ProcessingError('RESOLUTION_LIMIT')
    return {'duration_ms':duration,'width':width,'height':height,'audio':any(s['codec_type']=='audio' for s in data['streams'])}

def normalize(source,target,meta):
    # Full-length working master. Never discard it when removing ORIGINAL.
    command(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-i',str(source),'-map','0:v:0','-map','0:a:0?','-vf',"scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-preset','fast','-crf','20','-c:a','aac','-b:a','160k','-movflags','+faststart','-threads','2',str(target)])
def audio(source,target):
    command(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-i',str(source),'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',str(target)])
def ass_escape(text):
    # ASS overrides disabled for user content.
    return str(text).replace('\\','/').replace('{','(').replace('}',')').replace('\r','').replace('\n','\\N')
def ass_time(ms):
    cs=max(0,int(ms)//10);h,cs=divmod(cs,360000);m,cs=divmod(cs,6000);s,cs=divmod(cs,100);return f'{h}:{m:02}:{s:02}.{cs:02}'
def subtitles(path,segments,width,height):
    header=f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{max(18,int(height*.032))},&H00FFFFFF,&H0000FFFF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,2,1,2,{int(width*.08)},{int(width*.08)},{int(height*.13)},1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines=[]
    for s in segments:
        start=s.get('startMs',s.get('start_ms'));end=s.get('endMs',s.get('end_ms'))
        if start is None or end is None or end<=start:raise ProcessingError('INVALID_SUBTITLE')
        lines.append(f'Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{ass_escape(s["text"])}')
    pathlib.Path(path).write_text(header+'\n'.join(lines)+'\n',encoding='utf-8')
def render(source,target,start_ms,end_ms,segments,features=(),aspect='9:16',preview=False,style='simple'):
    meta=probe(source,max_bytes=12_000_000_000)
    if not 0<=start_ms<end_ms<=meta['duration_ms']:raise ProcessingError('INVALID_TIMESTAMP')
    sizes={'9:16':(1080,1920),'4:5':(1080,1350),'1:1':(1080,1080),'16:9':(1920,1080),'original':(meta['width'],meta['height'])}
    if aspect not in sizes:raise ProcessingError('INVALID_ASPECT')
    w,h=sizes[aspect]
    # Respect source resolution; no native-quality claim from upscaling.
    factor=min(1,meta['width']/w,meta['height']/h) if 'blur' not in features else min(1,max(meta['width'],meta['height'])/max(w,h))
    if preview:factor=min(factor,720/max(w,h))
    w=max(2,int(w*factor)//2*2);h=max(2,int(h*factor)//2*2)
    duration=(end_ms-start_ms)/1000
    work=pathlib.Path(target).parent;ass=work/'captions.ass';subtitles(ass,segments,w,h)
    # Path controlled by UUID task, sanitized; script text never enters filter expression.
    safe_ass=str(ass).replace('\\','/').replace(':',r'\:').replace("'",r"\'")
    if 'blur' in features:
        graph=f'[0:v]split=2[bg][fg];[bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=20:2[b];[fg]scale={w}:{h}:force_original_aspect_ratio=decrease[f];[b][f]overlay=(W-w)/2:(H-h)/2,setsar=1[v0]'
    else:graph=f'[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1[v0]'
    current='v0'
    if 'zoom' in features:
        graph+=f";[{current}]zoompan=z='1.03+0.03*sin(on/50)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={w}x{h}:fps=30[v1]";current='v1'
    if style!='none':graph+=f";[{current}]ass='{safe_ass}'[v2]";current='v2'
    command(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-ss',str(start_ms/1000),'-i',str(source),'-t',str(duration),'-filter_complex',graph,'-map',f'[{current}]','-map','0:a:0?','-c:v','libx264','-preset','fast','-crf','26' if preview else '20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-threads','2',str(target)])
    return {'width':w,'height':h,'duration_ms':end_ms-start_ms}
def cover(source,target,at_ms=0):
    command(['ffmpeg','-nostdin','-v','error','-y','-protocol_whitelist','file,pipe','-ss',str(at_ms/1000),'-i',str(source),'-frames:v','1','-q:v','2',str(target)],120)
