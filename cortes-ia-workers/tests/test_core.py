import unittest,os,tempfile,pathlib,subprocess,json,io
from unittest.mock import patch
from cortes_worker.models import validate_candidates,ProcessingError,Segment
from cortes_worker.security import validate_url,public_addresses
from cortes_worker.provider import redact,OllamaProvider,CompositeProvider
from cortes_worker import media,vision
class SecurityTests(unittest.TestCase):
 def test_url_restrictions(self):
  for u in ['http://youtube.com/watch?v=a','https://youtube.com.evil.test/a','https://user:pass@youtube.com/a','https://127.0.0.1/a','file:///etc/passwd','https://youtube.com:444/a']:
   with self.assertRaises(ProcessingError):validate_url(u)
 def test_private_dns(self):
  for address in ['127.0.0.1','169.254.169.254','10.0.0.1','::1','::ffff:127.0.0.1']:
   with patch('cortes_worker.security._original_resolve',return_value=[(2,1,6,'',(address,443))]):
    with self.assertRaises(ProcessingError):public_addresses('youtube.com')
 def test_redaction(self):self.assertNotIn('123.456.789-01',redact('CPF 123.456.789-01'))
 def test_invalid_timestamps(self):
  with self.assertRaises(ProcessingError):validate_candidates([dict(start_ms=-1,end_ms=50,title='x',reason='x')],100,1)
 def test_overlap(self):
  items=[dict(start_ms=0,end_ms=100,title='a',reason='a'),dict(start_ms=10,end_ms=90,title='b',reason='b')]
  self.assertEqual(len(validate_candidates(items,200,5)),1)
 def test_zero_candidates(self):self.assertEqual(validate_candidates([],100,5),[])
 def test_caption_override(self):self.assertNotIn('{',media.ass_escape(r'{\pos(0,0)}foo'))
 def test_vision_smoothing(self):
  points=[{'timeMs':0,'x':.2,'y':.4},{'timeMs':500,'x':.8,'y':.6},{'timeMs':1000,'x':.6,'y':.5}]
  smoothed=vision._smooth(points,alpha=.5)
  self.assertEqual(smoothed[0]['x'],.2)
  self.assertGreater(smoothed[1]['x'],.2);self.assertLess(smoothed[1]['x'],.8)
  self.assertTrue(all(0<=p['x']<=1 and 0<=p['y']<=1 for p in smoothed))
 def test_invalid_vision_crop(self):
  with self.assertRaises(ProcessingError):vision._crop_values({'x':.9,'y':0,'width':.2,'height':1})
 def test_segment_restores_nested_word_timings(self):
  segment=Segment(start_ms=0,end_ms=1000,text='teste aqui',words=[{'start_ms':0,'end_ms':400,'word':'teste'},{'start_ms':400,'end_ms':900,'word':'aqui'}])
  segment.validate(2000)
  self.assertEqual(segment.words[1].word,'aqui')
 def test_dynamic_caption_ass_uses_word_timing(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=pathlib.Path(tmp)/'dynamic.ass'
   media.subtitles(path,[{'startMs':0,'endMs':1000,'text':'Olá mundo','words':[{'startMs':0,'endMs':350,'word':'Olá'},{'startMs':350,'endMs':1000,'word':'mundo'}]}],1080,1920,'Viral',True)
   text=path.read_text()
   self.assertIn(r'{\kf35}Olá',text);self.assertIn(r'{\kf65}mundo',text)
 def test_dynamic_caption_fallback_alignment(self):
  words=media._word_items({'startMs':0,'endMs':1000,'text':'um teste simples'})
  self.assertEqual(words[0]['startMs'],0);self.assertEqual(words[-1]['endMs'],1000);self.assertEqual(len(words),3)
 def test_composite_routes_selection_and_review_independently(self):
  class FakeTranscriber:
   def transcribe(self,*args,**kwargs):return []
  class FakeSelector:
   def __init__(self,name):self.name=name;self.calls=0
   def select(self,*args,**kwargs):self.calls+=1;return [{'start_ms':0,'end_ms':1000,'title':self.name,'reason':'ok','score':1}]
  selector=FakeSelector('selector');reviewer=FakeSelector('reviewer')
  composite=CompositeProvider(FakeTranscriber(),selector,reviewer)
  self.assertEqual(composite.select([], 'trial',1,'AUTO')[0]['title'],'selector')
  self.assertEqual(composite.select([], 'trial',1,'AUTO',review=[])[0]['title'],'reviewer')
  self.assertEqual(selector.calls,1);self.assertEqual(reviewer.calls,1)
 def test_ollama_structured_candidates(self):
  payload={'message':{'content':json.dumps({'candidates':[{'start_ms':100,'end_ms':2000,'title':'Gancho','reason':'Autocontido','score':88}]})}}
  with patch.dict(os.environ,{'OLLAMA_MODEL':'qwen3:8b','OLLAMA_BASE_URL':'http://127.0.0.1:11434'}):
   with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(payload).encode())):
    result=OllamaProvider().select([type('S',(),{'start_ms':0,'end_ms':3000,'text':'teste'})()], 'trial',1,'UP_TO_1_MIN')
  self.assertEqual(result[0]['title'],'Gancho')
class MediaIntegration(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();cls.root=pathlib.Path(cls.tmp.name);cls.source=cls.root/'source.mp4'
  subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-threads','2',str(cls.source)],check=True)
 @classmethod
 def tearDownClass(cls):cls.tmp.cleanup()
 def test_probe(self):self.assertAlmostEqual(media.probe(self.source)['duration_ms'],5000,delta=150)
 def test_size_limit(self):
  with self.assertRaises(ProcessingError):media.probe(self.source,max_bytes=1)
 def test_fake_video(self):
  p=self.root/'bad.mp4';p.write_text('not video')
  with self.assertRaises(ProcessingError):media.probe(p)
 def test_full_master(self):
  p=self.root/'master.mp4';media.normalize(self.source,p,media.probe(self.source));self.assertAlmostEqual(media.probe(p)['duration_ms'],5000,delta=150)
 def test_render_blur_zoom_caption(self):
  p=self.root/'final.mp4';result=media.render(self.source,p,0,4000,[{'startMs':0,'endMs':3000,'text':'Cortes IA — teste'}],['zoom','blur'],'9:16',True)
  meta=media.probe(p);self.assertAlmostEqual(meta['width']/meta['height'],9/16,delta=.02);self.assertAlmostEqual(meta['duration_ms'],4000,delta=250)
 def test_render_multiple_segments_and_mood(self):
  p=self.root/'segments.mp4';result=media.render(self.source,p,0,4000,[{'startMs':0,'endMs':1800,'text':'Primeira parte'},{'startMs':1800,'endMs':3200,'text':'Segunda parte'}],['blur'],'9:16',True,'simple',[{'startMs':0,'endMs':1800},{'startMs':3000,'endMs':4400}],'Viral','Quente',{'x':0.05,'y':0.05,'width':0.9,'height':0.9})
  self.assertAlmostEqual(result['duration_ms'],3200,delta=10);self.assertAlmostEqual(media.probe(p)['duration_ms'],3200,delta=350)
 def test_render_dynamic_caption(self):
  p=self.root/'dynamic-caption.mp4'
  subtitles=[{'startMs':0,'endMs':3000,'text':'SliceFlow legenda dinâmica','words':[{'startMs':0,'endMs':700,'word':'SliceFlow'},{'startMs':700,'endMs':1600,'word':'legenda'},{'startMs':1600,'endMs':3000,'word':'dinâmica'}]}]
  result=media.render(self.source,p,0,3500,subtitles,['dynamic_captions'],'9:16',True,caption_preset='Viral')
  self.assertAlmostEqual(media.probe(p)['duration_ms'],3500,delta=300);self.assertEqual(result['duration_ms'],3500)
 def test_dynamic_tracking_crop(self):
  p=self.root/'tracking.mp4'
  plan=[{'timeMs':0,'x':.25,'y':.5},{'timeMs':1800,'x':.5,'y':.5},{'timeMs':3600,'x':.75,'y':.5}]
  result=media.render(self.source,p,0,4000,[{'startMs':0,'endMs':3500,'text':'Tracking'}],['tracking'],'9:16',True,tracking_plan=plan)
  meta=media.probe(p);self.assertAlmostEqual(meta['width']/meta['height'],9/16,delta=.02);self.assertAlmostEqual(result['duration_ms'],4000,delta=10)
 def test_invalid_manual_crop(self):
  with self.assertRaises(ProcessingError):media.render(self.source,self.root/'badcrop.mp4',0,3000,[],aspect='9:16',crop={'x':.8,'y':0,'width':.4,'height':1})
 def test_cover(self):p=self.root/'cover.jpg';media.cover(self.source,p,1000);self.assertGreater(p.stat().st_size,100)
if __name__=='__main__':unittest.main()
