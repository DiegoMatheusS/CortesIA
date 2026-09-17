import unittest,os,tempfile,pathlib,subprocess,json
from unittest.mock import patch
from cortes_worker.models import validate_candidates,ProcessingError
from cortes_worker.security import validate_url,public_addresses
from cortes_worker.provider import redact
from cortes_worker import media
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
 def test_cover(self):p=self.root/'cover.jpg';media.cover(self.source,p,1000);self.assertGreater(p.stat().st_size,100)
if __name__=='__main__':unittest.main()
