import os
from .security import validate_url,youtube_dns_guard,download_https
from .models import ProcessingError

def metadata(url):
    validate_url(url,('youtube.com','youtu.be'))
    if os.getenv('YOUTUBE_ENABLED','false')!='true':raise ProcessingError('YOUTUBE_NOT_ENABLED',outcome='SOURCE_RESTRICTED')
    import yt_dlp
    # No cookies/login, no playlist, no bypass; only direct HTTPS muxed MP4.
    with youtube_dns_guard():
        try:
            with yt_dlp.YoutubeDL({'quiet':True,'no_warnings':True,'noplaylist':True,'skip_download':True,'socket_timeout':20,'retries':0,'proxy':'','format':'best[protocol=https][ext=mp4][vcodec!=none][acodec!=none][height<=1080]'}) as y:
                info=y.extract_info(url,download=False)
        except Exception:raise ProcessingError('SOURCE_RESTRICTED',outcome='SOURCE_RESTRICTED')
    if not info or info.get('is_live') or info.get('age_limit',0)>0 or info.get('availability') not in (None,'public','unlisted'):
        raise ProcessingError('SOURCE_RESTRICTED',outcome='SOURCE_RESTRICTED')
    duration=int((info.get('duration') or 0)*1000)
    if not 0<duration<=10_800_000:raise ProcessingError('INVALID_DURATION')
    media=info.get('url','');validate_url(media)
    return {'duration_ms':duration,'url':media,'title':info.get('title','Vídeo')}
def download(url,path,max_bytes):
    info=metadata(url);download_https(info['url'],path,max_bytes);return info
