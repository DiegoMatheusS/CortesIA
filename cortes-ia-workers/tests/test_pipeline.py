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
            lease={'stage':'PROCESS','projectId':'test','maxBytes':30_000_000_000,'maxDurationMs':25_200_000,'outputPrefix':'projects/test/jobs/123/1/','payload':{'sourceKey':'quarantine/test/video','config':{'quantity':5,'durationMode':'UP_TO_1_MIN','features':['zoom','blur','cover']},'modality':'trial'}}
            progress=[]
            with patch.dict(os.environ,env):result=Processor(storage,'test',root,lambda phase,percent:progress.append((phase,percent))).run(lease)
            self.assertEqual(result['outcome'],'SUCCESS');self.assertEqual(len(result['clips']),1)
            phases={phase for phase,_ in progress}
            self.assertTrue({'NORMALIZING_MEDIA','TRANSCRIBING','SELECTING_CLIPS','REVIEWING_CLIPS','GENERATING_PREVIEWS','FINALIZING'}<=phases)
            self.assertTrue(all(0<=percent<=100 for _,percent in progress))
            kinds={x['kind'] for x in result['outputs']};self.assertTrue({'WORKING_MASTER','PREVIEW','COVER','TRANSCRIPT'}<=kinds)
            self.assertTrue(all(x['key'].startswith(lease['outputPrefix']) for x in result['outputs']))
            self.assertEqual(result['failedFeatures'],[])

    def test_editor_preview_renders_saved_revision_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);source=root/'source.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-threads','2',str(source)],check=True)
            storage=MemoryStorage();storage.files['projects/test/master.mp4']=source.read_bytes()
            env={'APP_ENV':'development','MEDIA_EXECUTION':'local','SCAN_MODE':'disabled-development','MEDIA_TASK_ROOT':str(root/'tasks')}
            lease={
                'stage':'PREVIEW','projectId':'test','maxBytes':30_000_000_000,'maxDurationMs':25_200_000,
                'outputPrefix':'projects/test/jobs/preview/1/',
                'payload':{
                    'sourceKey':'projects/test/master.mp4','format':'9:16','features':['blur'],
                    'clip':{
                        'id':'00000000-0000-0000-0000-000000000001','revision':3,
                        'startMs':0,'endMs':4000,'title':'Preview',
                        'segments':[{'startMs':0,'endMs':1500},{'startMs':2500,'endMs':4000}],
                        'subtitles':[{'startMs':0,'endMs':1200,'text':'Primeiro trecho'},{'startMs':1500,'endMs':2700,'text':'Segundo trecho'}],
                        'style':'simple','captionPreset':'Viral','visualStyle':'Quente',
                        'aspect':'9:16','crop':{'x':0.05,'y':0.05,'width':0.9,'height':0.9}
                    }
                }
            }
            with patch.dict(os.environ,env):result=Processor(storage,'test',root).run(lease)
            self.assertEqual([x['kind'] for x in result['outputs']],['PREVIEW'])
            key=result['outputs'][0]['key'];self.assertIn(key,storage.files);self.assertGreater(len(storage.files[key]),1000)

    def test_cover_job_extracts_selected_master_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);source=root/'source.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=550:sample_rate=16000','-t','5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-threads','2',str(source)],check=True)
            storage=MemoryStorage();storage.files['projects/test/master.mp4']=source.read_bytes()
            env={'APP_ENV':'development','MEDIA_EXECUTION':'local','SCAN_MODE':'disabled-development','MEDIA_TASK_ROOT':str(root/'tasks')}
            lease={
                'stage':'COVER','projectId':'test','maxBytes':30_000_000_000,'maxDurationMs':25_200_000,
                'outputPrefix':'projects/test/jobs/cover/1/',
                'payload':{
                    'sourceKey':'projects/test/master.mp4',
                    'clip':{'id':'00000000-0000-0000-0000-000000000001','revision':4},
                    'atMs':2200
                }
            }
            progress=[]
            with patch.dict(os.environ,env):result=Processor(storage,'test',root,lambda phase,percent:progress.append((phase,percent))).run(lease)
            self.assertEqual([x['kind'] for x in result['outputs']],['COVER'])
            key=result['outputs'][0]['key'];self.assertIn(key,storage.files);self.assertGreater(len(storage.files[key]),1000)
            self.assertIn('GENERATING_COVER',{phase for phase,_ in progress})

if __name__=='__main__':unittest.main()
