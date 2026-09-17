import pathlib,os,uuid,json,time,shutil
from .models import ProcessingError
from .media_runner import execute

def call(source,operation,destination=None,**settings):
    root=pathlib.Path(os.getenv('MEDIA_TASK_ROOT','/work/tasks'));task=root/str(uuid.uuid4());task.mkdir(parents=True)
    try:
        shutil.copyfile(source,task/'input');(task/'request.json').write_text(json.dumps({'operation':operation,**settings}))
        if os.getenv('MEDIA_EXECUTION')=='local':
            if os.getenv('APP_ENV')!='development':raise ProcessingError('LOCAL_MEDIA_FORBIDDEN')
            result={'ok':True,'data':execute(task)}
        else:
            (task/'ready').touch();deadline=time.monotonic()+7500
            while not (task/'result.json').exists():
                if time.monotonic()>deadline:raise ProcessingError('MEDIA_RUNNER_TIMEOUT',True)
                time.sleep(.3)
            result=json.loads((task/'result.json').read_text())
        if not result['ok']:raise ProcessingError(result['code'],result.get('retryable',False))
        if destination:
            filename={'audio':'output.wav','cover':'output.jpg'}.get(operation,'output.mp4');shutil.copyfile(task/filename,destination)
        return result['data']
    finally:
        # Offline runner may still be writing on timeout; janitor handles stale tasks.
        if (task/'result.json').exists() or os.getenv('MEDIA_EXECUTION')=='local':shutil.rmtree(task,ignore_errors=True)
