"""Offline container: no network, no cloud/provider credentials, bounded resources."""
import pathlib,json,os,time,uuid
from . import media
from .models import ProcessingError
ROOT=pathlib.Path(os.getenv('MEDIA_TASK_ROOT','/work/tasks'))
def execute(task):
    plan=json.loads((task/'request.json').read_text());op=plan['operation']
    source=task/'input';out=task/'output.mp4'
    if op=='probe':return media.probe(source,plan['max_bytes'],plan['max_duration_ms'])
    if op=='normalize':meta=media.probe(source,plan['max_bytes'],plan['max_duration_ms']);media.normalize(source,out,meta);return meta
    if op=='audio':media.audio(source,task/'output.wav');return {}
    if op=='render':return media.render(source,out,**plan['settings'])
    if op=='cover':media.cover(source,task/'output.jpg',plan.get('at_ms',0),aspect=plan.get('aspect','original'),crop=plan.get('crop'),visual_style=plan.get('visual_style','Cinema'));return {}
    raise ProcessingError('UNKNOWN_MEDIA_OPERATION')
def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    while True:
        for ready in ROOT.glob('*/ready'):
            task=ready.parent
            try:uuid.UUID(task.name)
            except ValueError:continue
            if task.is_symlink() or (task/'input').is_symlink():continue
            try:
                ready.rename(task/'running')
                result={'ok':True,'data':execute(task)}
            except ProcessingError as e:result={'ok':False,'code':e.code,'retryable':e.retryable}
            except Exception:result={'ok':False,'code':'MEDIA_FAILURE','retryable':False}
            tmp=task/'result.tmp';tmp.write_text(json.dumps(result));tmp.replace(task/'result.json')
        time.sleep(.2)
if __name__=='__main__':main()
