import unittest,tempfile,pathlib,os,json,subprocess,shutil
from unittest.mock import patch
from cortes_worker.runner import Processor
class MemoryStorage:
    def __init__(self):self.files={}
    def head_object(self,Bucket,Key):return {'ContentLength':len(self.files[Key])}
    def download_file(self,bucket,key,path):pathlib.Path(path).write_bytes(self.files[key])
    def upload_file(self,path,bucket,key):self.files[key]=pathlib.Path(path).read_bytes()
class PipelineTests(unittest.TestCase):
    def test_fixture_pipeline_keeps_full_master_and_preview(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);source=root/'source.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-threads','2',str(source)],check=True)
            storage=MemoryStorage();storage.files['quarantine/test/video']=source.read_bytes()
            env={'APP_ENV':'development','AI_PROVIDER':'fixture','MEDIA_EXECUTION':'local','SCAN_MODE':'disabled-development','MEDIA_TASK_ROOT':str(root/'tasks'),'TRANSCRIPT_FIXTURE':str(pathlib.Path('fixtures/transcript.json').resolve())}
            lease={'stage':'PROCESS','projectId':'test','maxBytes':5_000_000_000,'maxDurationMs':10_800_000,'outputPrefix':'projects/test/jobs/123/1/','payload':{'sourceKey':'quarantine/test/video','config':{'quantity':5,'durationMode':'UP_TO_1_MIN','features':['zoom','blur','cover']},'modality':'trial'}}
            with patch.dict(os.environ,env):result=Processor(storage,'test',root).run(lease)
            self.assertEqual(result['outcome'],'SUCCESS');self.assertEqual(len(result['clips']),1)
            kinds={x['kind'] for x in result['outputs']};self.assertTrue({'WORKING_MASTER','PREVIEW','COVER','TRANSCRIPT'}<=kinds)
            self.assertTrue(all(x['key'].startswith(lease['outputPrefix']) for x in result['outputs']))
            self.assertEqual(result['failedFeatures'],[])
if __name__=='__main__':unittest.main()
