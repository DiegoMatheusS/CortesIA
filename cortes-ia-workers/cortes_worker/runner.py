import os,json,pathlib,tempfile,threading,time,uuid,urllib.request,urllib.error,dataclasses
from .models import ProcessingError,validate_candidates,Segment
from . import media_client,youtube
from .provider import provider
from .security import antivirus

def internal(path,body):
    data=json.dumps(body).encode();request=urllib.request.Request(os.getenv('INTERNAL_API','http://api:8080')+'/internal/v1/'+path,data=data,headers={'Content-Type':'application/json','X-Worker-Token':os.environ['WORKER_TOKEN']})
    try:
        with urllib.request.urlopen(request,timeout=20) as r:
            content=r.read();return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:raise ProcessingError('INTERNAL_API_'+str(e.code),e.code>=500)
class Processor:
    def __init__(self,s3,bucket,work):self.s3=s3;self.bucket=bucket;self.work=pathlib.Path(work);self.outputs=[]
    def upload(self,path,kind,lease):
        suffix=pathlib.Path(path).suffix;key=lease['outputPrefix']+str(uuid.uuid4())+suffix
        self.s3.upload_file(str(path),self.bucket,key)
        self.outputs.append({'key':key,'kind':kind,'size':pathlib.Path(path).stat().st_size});return key
    def source(self,lease):
        payload=lease['payload'];source=self.work/'source'
        if payload.get('sourceKey'):
            key=payload['sourceKey']
            if not key.startswith(('quarantine/'+lease['projectId']+'/', 'projects/'+lease['projectId']+'/')):raise ProcessingError('INVALID_SOURCE_KEY')
            head=self.s3.head_object(Bucket=self.bucket,Key=key)
            if head['ContentLength']>(12_000_000_000 if key.startswith('projects/') else lease['maxBytes']):raise ProcessingError('FILE_TOO_LARGE')
            self.s3.download_file(self.bucket,key,str(source))
        elif payload.get('url'):youtube.download(payload['url'],source,lease['maxBytes'])
        else:raise ProcessingError('SOURCE_MISSING')
        antivirus(source)
        return source
    def run(self,lease):
        stage=lease['stage'];payload=lease['payload'];limits={'max_bytes':lease['maxBytes'],'max_duration_ms':lease['maxDurationMs']}
        if stage=='LINK_METADATA':
            info=youtube.metadata(payload['url']);return {'durationMs':info['duration_ms'],'outputs':[],'clips':[]}
        if stage=='BUNDLE':
            import zipfile
            archive=self.work/'cortes.zip'
            with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
                for item in payload['exports']:
                    key=item['key']
                    if not key.startswith('projects/'+lease['projectId']+'/'):raise ProcessingError('INVALID_EXPORT')
                    local=self.work/(str(uuid.UUID(item['id']))+'.mp4')
                    self.s3.download_file(self.bucket,key,str(local));z.write(local,local.name);local.unlink()
            self.upload(archive,'BUNDLE',lease);return {'outputs':self.outputs,'clips':[]}
        source=self.source(lease)
        if stage=='INGEST':
            # Validation only. No paid normalization/AI before confirmation.
            meta=media_client.call(source,'probe',**limits);return {'durationMs':meta['duration_ms'],'outputs':[],'clips':[]}
        if stage=='RENDER':
            c=payload['clip'];features=payload.get('features',[]);output=self.work/'final.mp4'
            media_client.call(source,'render',output,settings={
                'start_ms':c['startMs'],'end_ms':c['endMs'],
                'source_segments':c.get('segments'),
                'segments':c['subtitles'],'features':features,
                'aspect':payload['format'],'style':c['style'],
                'caption_preset':c.get('captionPreset','Clean'),
                'visual_style':c.get('visualStyle','Cinema'),
                'crop':c.get('crop')
            })
            self.upload(output,'FINAL_EXPORT',lease);return {'outputs':self.outputs,'clips':[]}
        if stage not in {'PROCESS','ALTERNATIVES'}:raise ProcessingError('UNKNOWN_STAGE')
        ai=provider()
        if stage=='ALTERNATIVES':
            master=source;meta=media_client.call(source,'probe',**{**limits,'max_bytes':12_000_000_000})
            key=payload['transcriptKey']
            if not key.startswith('projects/'+lease['projectId']+'/'):raise ProcessingError('INVALID_TRANSCRIPT_KEY')
            data=self.s3.get_object(Bucket=self.bucket,Key=key)
            if data['ContentLength']>20_000_000:raise ProcessingError('TRANSCRIPT_TOO_LARGE')
            segments=[Segment(**x) for x in json.loads(data['Body'].read())]
        else:
            master=self.work/'master.mp4';meta=media_client.call(source,'normalize',master,**limits)
            self.upload(master,'WORKING_MASTER',lease)
            audio=self.work/'audio.wav';media_client.call(master,'audio',audio)
            segments=ai.transcribe(audio)
        for s in segments:s.validate(meta['duration_ms'])
        transcript=self.work/'transcript.json';transcript.write_text(json.dumps([dataclasses.asdict(s) for s in segments],ensure_ascii=False));self.upload(transcript,'TRANSCRIPT',lease)
        config=payload['config'];quantity=config.get('quantity',5);mode=config.get('durationMode','UP_TO_1_MIN')
        ranges={'UP_TO_1_MIN':(0,60000),'ONE_TO_TWO_MIN':(60000,120000),'TWO_TO_THREE_MIN':(120000,180000),'AUTO':(0,180000)}
        low,high=ranges[mode];raw=[]
        # Bounded context windows, full-video coverage; final review sees candidate context.
        for offset in range(0,meta['duration_ms'],600000):
            window=[s for s in segments if s.end_ms>offset and s.start_ms<offset+660000]
            if window:raw.extend(ai.select(window,payload['modality'],quantity,mode))
        candidates=validate_candidates(raw,meta['duration_ms'],min(quantity*3,100),low,high)
        context=[s for s in segments if any(s.end_ms>c.start_ms-5000 and s.start_ms<c.end_ms+5000 for c in candidates)]
        reviewed=ai.select(context,payload['modality'],quantity,mode,review=[dataclasses.asdict(c) for c in candidates]) if candidates else []
        selected=validate_candidates(reviewed,meta['duration_ms'],quantity,low,high,[(x['startMs'],x['endMs']) for x in payload.get('rejected',[])])
        clips=[];features=config.get('features') or []
        # Never pretend unsupported effects were delivered. Refund corresponding quote item.
        failed=[f for f in features if f in {'dynamic_captions','tracking'}]
        for index,c in enumerate(selected):
            relative=[{'startMs':max(0,s.start_ms-c.start_ms),'endMs':min(c.end_ms,s.end_ms)-c.start_ms,'text':s.text} for s in segments if s.end_ms>c.start_ms and s.start_ms<c.end_ms]
            preview=self.work/f'preview-{index}.mp4'
            media_client.call(master,'render',preview,settings={'start_ms':c.start_ms,'end_ms':c.end_ms,'segments':relative,'features':features,'aspect':'9:16','preview':True})
            key=self.upload(preview,'PREVIEW',lease);cover_key=None
            if 'cover' in features:
                image=self.work/f'cover-{index}.jpg';media_client.call(master,'cover',image,at_ms=c.start_ms);cover_key=self.upload(image,'COVER',lease)
            clips.append({'title':c.title,'reason':c.reason,'startMs':c.start_ms,'endMs':c.end_ms,'previewKey':key,'coverKey':cover_key,'subtitles':relative})
        return {'durationMs':meta['duration_ms'],'outputs':self.outputs,'clips':clips,'failedFeatures':failed,'outcome':'SUCCESS' if clips else 'NO_SUITABLE_CLIPS'}
def main():
    import boto3
    endpoint=os.getenv('AWS_ENDPOINT_URL');region=os.getenv('AWS_DEFAULT_REGION','us-east-1')
    sqs=boto3.client('sqs',endpoint_url=endpoint,region_name=region);s3=boto3.client('s3',endpoint_url=endpoint,region_name=region)
    queue=os.environ['JOBS_QUEUE_URL'];events=os.environ['EVENTS_QUEUE_URL'];bucket=os.environ['MEDIA_BUCKET']
    while True:
        response=sqs.receive_message(QueueUrl=queue,MaxNumberOfMessages=1,WaitTimeSeconds=20,VisibilityTimeout=120)
        for message in response.get('Messages',[]):
            receipt=message['ReceiptHandle'];job=json.loads(message['Body'])['jobId']
            try:lease=internal(f'jobs/{job}/lease',{})
            except ProcessingError:continue
            if lease['disposition']=='DONE':sqs.delete_message(QueueUrl=queue,ReceiptHandle=receipt);continue
            if lease['disposition']=='BUSY':continue
            stop=threading.Event();lost=threading.Event()
            def heartbeat():
                while not stop.wait(30):
                    try:
                        internal(f'jobs/{job}/heartbeat',{'fence':lease['fence']})
                        sqs.change_message_visibility(QueueUrl=queue,ReceiptHandle=receipt,VisibilityTimeout=120)
                    except Exception:lost.set();return
            thread=threading.Thread(target=heartbeat,daemon=True);thread.start()
            event={'eventId':str(uuid.uuid4()),'jobId':job,'fence':lease['fence'],'kind':'succeeded','error':None,'retryable':False,'durationMs':0,'outputs':[],'clips':[],'failedFeatures':[],'outcome':None}
            try:
                with tempfile.TemporaryDirectory(prefix='cortes-') as work:event.update(Processor(s3,bucket,work).run(lease))
            except ProcessingError as e:event.update(kind='failed',error=e.code,retryable=e.retryable,outcome=e.outcome)
            except Exception as e:event.update(kind='failed',error='WORKER_FAILURE',retryable=True,outcome='SYSTEM_FAILURE')
            finally:stop.set();thread.join(timeout=2)
            if lost.is_set():continue
            # Large result stored as private manifest, not SQS payload.
            event_key=lease['outputPrefix']+'event.json';s3.put_object(Bucket=bucket,Key=event_key,Body=json.dumps(event).encode(),ContentType='application/json')
            sqs.send_message(QueueUrl=events,MessageBody=json.dumps({'schemaVersion':1,'jobId':job,'fence':lease['fence'],'manifestKey':event_key}))
            sqs.delete_message(QueueUrl=queue,ReceiptHandle=receipt)
if __name__=='__main__':main()
