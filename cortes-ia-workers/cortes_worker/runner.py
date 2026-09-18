import os,json,pathlib,tempfile,threading,time,uuid,urllib.request,urllib.error,dataclasses
from .models import ProcessingError,validate_candidates,Segment
from . import media_client,youtube
from .provider import provider
from .security import antivirus
from .vision import track_faces

def internal(path,body):
    data=json.dumps(body).encode();request=urllib.request.Request(os.getenv('INTERNAL_API','http://api:8080')+'/internal/v1/'+path,data=data,headers={'Content-Type':'application/json','X-Worker-Token':os.environ['WORKER_TOKEN']})
    try:
        with urllib.request.urlopen(request,timeout=20) as r:
            content=r.read();return json.loads(content) if content else {}
    except urllib.error.HTTPError as e:raise ProcessingError('INTERNAL_API_'+str(e.code),e.code==429 or e.code>=500)

def _relative_subtitle(segment, clip_start, clip_end):
    start=max(0,segment.start_ms-clip_start)
    end=min(clip_end,segment.end_ms)-clip_start
    words=[]
    for word in getattr(segment,'words',[]) or []:
        if word.end_ms<=clip_start or word.start_ms>=clip_end:
            continue
        word_start=max(clip_start,word.start_ms)-clip_start
        word_end=min(clip_end,word.end_ms)-clip_start
        if word_end>word_start:
            words.append({'startMs':word_start,'endMs':word_end,'word':word.word})
    return {'startMs':start,'endMs':end,'text':segment.text,'words':words}


class Processor:
    def __init__(self,s3,bucket,work,report=None):
        self.s3=s3;self.bucket=bucket;self.work=pathlib.Path(work);self.outputs=[]
        self.report=report or (lambda phase,progress:None)

    def progress(self,phase,percent):
        self.report(str(phase),max(0,min(100,int(percent))))

    def upload(self,path,kind,lease):
        suffix=pathlib.Path(path).suffix;key=lease['outputPrefix']+str(uuid.uuid4())+suffix
        self.s3.upload_file(str(path),self.bucket,key)
        self.outputs.append({'key':key,'kind':kind,'size':pathlib.Path(path).stat().st_size});return key

    def source(self,lease):
        payload=lease['payload'];source=self.work/'source'
        self.progress('DOWNLOADING_SOURCE',5)
        if payload.get('sourceKey'):
            key=payload['sourceKey']
            if not key.startswith(('quarantine/'+lease['projectId']+'/', 'projects/'+lease['projectId']+'/')):raise ProcessingError('INVALID_SOURCE_KEY')
            head=self.s3.head_object(Bucket=self.bucket,Key=key)
            if head['ContentLength']>(12_000_000_000 if key.startswith('projects/') else lease['maxBytes']):raise ProcessingError('FILE_TOO_LARGE')
            self.s3.download_file(self.bucket,key,str(source))
        elif payload.get('url'):
            self.progress('DOWNLOADING_LINK',5)
            youtube.download(payload['url'],source,lease['maxBytes'],lease['maxDurationMs'])
        else:raise ProcessingError('SOURCE_MISSING')
        self.progress('SCANNING_SOURCE',10)
        antivirus(source)
        return source

    def run(self,lease):
        stage=lease['stage'];payload=lease['payload'];limits={'max_bytes':lease['maxBytes'],'max_duration_ms':lease['maxDurationMs']}

        if stage=='LINK_METADATA':
            self.progress('READING_LINK',20)
            info=youtube.metadata(payload['url'],lease['maxBytes'],lease['maxDurationMs'])
            self.progress('VALIDATING_SOURCE',95)
            return {'durationMs':info['duration_ms'],'outputs':[],'clips':[]}

        if stage=='BUNDLE':
            import zipfile
            self.progress('BUILDING_BUNDLE',10)
            archive=self.work/'cortes.zip';exports=payload['exports']
            with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
                for index,item in enumerate(exports):
                    key=item['key']
                    if not key.startswith('projects/'+lease['projectId']+'/'):raise ProcessingError('INVALID_EXPORT')
                    local=self.work/(str(uuid.UUID(item['id']))+'.mp4')
                    self.s3.download_file(self.bucket,key,str(local));z.write(local,local.name);local.unlink()
                    self.progress('BUILDING_BUNDLE',10+int(70*(index+1)/max(1,len(exports))))
            self.progress('UPLOADING_OUTPUT',90)
            self.upload(archive,'BUNDLE',lease);return {'outputs':self.outputs,'clips':[]}

        source=self.source(lease)

        if stage=='COVER':
            at_ms=int(payload.get('atMs',-1))
            if at_ms<0:
                raise ProcessingError('INVALID_COVER_TIME')
            self.progress('GENERATING_COVER',45)
            image=self.work/'cover.jpg'
            media_client.call(source,'cover',image,at_ms=at_ms)
            self.progress('UPLOADING_OUTPUT',90)
            self.upload(image,'COVER',lease)
            self.progress('FINALIZING',98)
            return {'outputs':self.outputs,'clips':[]}

        if stage=='INGEST':
            self.progress('VALIDATING_MEDIA',45)
            meta=media_client.call(source,'probe',**limits)
            self.progress('SOURCE_READY',95)
            return {'durationMs':meta['duration_ms'],'outputs':[],'clips':[]}

        if stage in {'RENDER','PREVIEW'}:
            c=payload['clip'];features=payload.get('features',[])
            is_preview=stage=='PREVIEW';output=self.work/('preview.mp4' if is_preview else 'final.mp4')
            source_segments=c.get('segments') or [{'startMs':c['startMs'],'endMs':c['endMs']}]
            tracking_plan=[]
            if 'tracking' in features:
                self.progress('TRACKING_SUBJECT',22)
                try:
                    tracking_plan=track_faces(
                        source,
                        source_segments,
                        crop=c.get('crop'),
                        fps=float(os.getenv('VISION_SAMPLE_FPS','2')),
                    )
                except ProcessingError:
                    tracking_plan=[]
            self.progress('RENDERING_PREVIEW' if is_preview else 'RENDERING_EXPORT',30)
            media_client.call(source,'render',output,settings={
                'start_ms':c['startMs'],'end_ms':c['endMs'],
                'source_segments':source_segments,
                'segments':c['subtitles'],'features':features,
                'aspect':payload['format'],'style':c['style'],
                'caption_preset':c.get('captionPreset','Clean'),
                'visual_style':c.get('visualStyle','Cinema'),
                'crop':c.get('crop'),'preview':is_preview,
                'tracking_plan':tracking_plan
            })
            self.progress('UPLOADING_OUTPUT',90)
            self.upload(output,'PREVIEW' if is_preview else 'FINAL_EXPORT',lease)
            self.progress('FINALIZING',98)
            return {'outputs':self.outputs,'clips':[]}

        if stage not in {'PROCESS','ALTERNATIVES'}:raise ProcessingError('UNKNOWN_STAGE')

        config=payload['config']
        features=config.get('features') or []
        self.progress('PREPARING_AI',15)
        ai=provider()

        if stage=='ALTERNATIVES':
            self.progress('LOADING_TRANSCRIPT',22)
            master=source;meta=media_client.call(source,'probe',**{**limits,'max_bytes':12_000_000_000})
            key=payload['transcriptKey']
            if not key.startswith('projects/'+lease['projectId']+'/'):raise ProcessingError('INVALID_TRANSCRIPT_KEY')
            data=self.s3.get_object(Bucket=self.bucket,Key=key)
            if data['ContentLength']>20_000_000:raise ProcessingError('TRANSCRIPT_TOO_LARGE')
            segments=[Segment(**x) for x in json.loads(data['Body'].read())]
            self.progress('TRANSCRIPT_READY',50)
        else:
            self.progress('NORMALIZING_MEDIA',18)
            master=self.work/'master.mp4';meta=media_client.call(source,'normalize',master,**limits)
            self.progress('SAVING_MASTER',24)
            self.upload(master,'WORKING_MASTER',lease)
            self.progress('EXTRACTING_AUDIO',28)
            audio=self.work/'audio.wav';media_client.call(master,'audio',audio)
            self.progress('TRANSCRIBING',32)
            segments=ai.transcribe(audio,word_timestamps='dynamic_captions' in features)
            self.progress('TRANSCRIPT_READY',52)

        for s in segments:s.validate(meta['duration_ms'])
        transcript=self.work/'transcript.json'
        transcript.write_text(json.dumps([dataclasses.asdict(s) for s in segments],ensure_ascii=False))
        self.upload(transcript,'TRANSCRIPT',lease)

        quantity=config.get('quantity',5);mode=config.get('durationMode','UP_TO_1_MIN')
        ranges={'UP_TO_1_MIN':(0,60000),'ONE_TO_TWO_MIN':(60000,120000),'TWO_TO_THREE_MIN':(120000,180000),'AUTO':(0,180000)}
        low,high=ranges[mode];raw=[]
        window_ms=max(300000,int(os.getenv('AI_LONGFORM_WINDOW_MS','900000')))
        overlap_ms=max(0,min(window_ms//2,int(os.getenv('AI_LONGFORM_OVERLAP_MS','90000'))))
        offsets=list(range(0,meta['duration_ms'],window_ms))
        per_window=max(3,min(8,quantity))
        for index,offset in enumerate(offsets):
            window=[s for s in segments if s.end_ms>offset and s.start_ms<offset+window_ms+overlap_ms]
            if window:raw.extend(ai.select(window,payload['modality'],per_window,mode))
            self.progress('SELECTING_CLIPS',55+int(15*(index+1)/max(1,len(offsets))))

        raw.sort(key=lambda item:float(item.get('score',0) or 0),reverse=True)
        candidates=validate_candidates(raw,meta['duration_ms'],min(max(quantity*4,20),120),low,high)
        context=[s for s in segments if any(s.end_ms>c.start_ms-5000 and s.start_ms<c.end_ms+5000 for c in candidates)]
        self.progress('REVIEWING_CLIPS',73)
        reviewed=ai.select(context,payload['modality'],quantity,mode,review=[dataclasses.asdict(c) for c in candidates]) if candidates else []
        selected=validate_candidates(reviewed,meta['duration_ms'],quantity,low,high,[(x['startMs'],x['endMs']) for x in payload.get('rejected',[])])

        clips=[]
        failed=[]
        tracking_requested='tracking' in features
        tracking_delivered=False
        for index,candidate in enumerate(selected):
            self.progress('GENERATING_PREVIEWS',78+int(18*(index)/max(1,len(selected))))
            relative=[_relative_subtitle(s,candidate.start_ms,candidate.end_ms) for s in segments if s.end_ms>candidate.start_ms and s.start_ms<candidate.end_ms]
            tracking_plan=[]
            if tracking_requested:
                self.progress('TRACKING_SUBJECT',78+int(12*(index+1)/max(1,len(selected))))
                try:
                    tracking_plan=track_faces(
                        master,
                        [{'startMs':candidate.start_ms,'endMs':candidate.end_ms}],
                        fps=float(os.getenv('VISION_SAMPLE_FPS','2')),
                    )
                except ProcessingError:
                    tracking_plan=[]
                tracking_delivered=tracking_delivered or bool(tracking_plan)
            preview=self.work/f'preview-{index}.mp4'
            media_client.call(master,'render',preview,settings={'start_ms':candidate.start_ms,'end_ms':candidate.end_ms,'segments':relative,'features':features,'aspect':'9:16','preview':True,'tracking_plan':tracking_plan})
            key=self.upload(preview,'PREVIEW',lease);cover_key=None
            if 'cover' in features:
                image=self.work/f'cover-{index}.jpg';media_client.call(master,'cover',image,at_ms=candidate.start_ms);cover_key=self.upload(image,'COVER',lease)
            clips.append({'title':candidate.title,'reason':candidate.reason,'startMs':candidate.start_ms,'endMs':candidate.end_ms,'previewKey':key,'coverKey':cover_key,'subtitles':relative})

        if tracking_requested and selected and not tracking_delivered:
            failed.append('tracking')

        self.progress('FINALIZING',98)
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

            stop=threading.Event();lost=threading.Event();progress_lock=threading.Lock()
            progress_state={'phase':'STARTING','progress':1}

            def send_progress():
                with progress_lock:body={'fence':lease['fence'],'phase':progress_state['phase'],'progress':progress_state['progress']}
                internal(f'jobs/{job}/heartbeat',body)
                sqs.change_message_visibility(QueueUrl=queue,ReceiptHandle=receipt,VisibilityTimeout=120)

            def report(phase,progress):
                with progress_lock:
                    progress_state['phase']=phase;progress_state['progress']=progress
                try:send_progress()
                except Exception:
                    lost.set();raise ProcessingError('LEASE_LOST')

            def heartbeat():
                while not stop.wait(30):
                    try:send_progress()
                    except Exception:lost.set();return

            thread=threading.Thread(target=heartbeat,daemon=True);thread.start()
            event={'eventId':str(uuid.uuid4()),'jobId':job,'fence':lease['fence'],'kind':'succeeded','error':None,'retryable':False,'durationMs':0,'outputs':[],'clips':[],'failedFeatures':[],'outcome':None}
            try:
                report('STARTING',1)
                with tempfile.TemporaryDirectory(prefix='cortes-') as work:event.update(Processor(s3,bucket,work,report).run(lease))
            except ProcessingError as e:event.update(kind='failed',error=e.code,retryable=e.retryable,outcome=e.outcome)
            except Exception:event.update(kind='failed',error='WORKER_FAILURE',retryable=True,outcome='SYSTEM_FAILURE')
            finally:stop.set();thread.join(timeout=2)

            if lost.is_set():continue
            event_key=lease['outputPrefix']+'event.json';s3.put_object(Bucket=bucket,Key=event_key,Body=json.dumps(event).encode(),ContentType='application/json')
            sqs.send_message(QueueUrl=events,MessageBody=json.dumps({'schemaVersion':1,'jobId':job,'fence':lease['fence'],'manifestKey':event_key}))
            sqs.delete_message(QueueUrl=queue,ReceiptHandle=receipt)

if __name__=='__main__':main()
