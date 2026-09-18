import ipaddress, socket, urllib.parse, ssl, http.client, os, struct
from contextlib import contextmanager
from .models import ProcessingError
YOUTUBE_HOSTS=("youtube.com","youtu.be","youtubei.googleapis.com","googlevideo.com","ytimg.com","google.com")
def allowed_host(host,domains=YOUTUBE_HOSTS):
    host=host.lower().rstrip('.')
    return any(host==d or host.endswith('.'+d) for d in domains)
def validate_url(url,domains=YOUTUBE_HOSTS):
    p=urllib.parse.urlsplit(url)
    try: port=p.port
    except ValueError: raise ProcessingError("SOURCE_RESTRICTED",outcome="SOURCE_RESTRICTED")
    if p.scheme!='https' or not p.hostname or not allowed_host(p.hostname,domains) or p.username or p.password or port not in (None,443):
        raise ProcessingError("SOURCE_RESTRICTED",outcome="SOURCE_RESTRICTED")
    return p
_original_resolve=socket.getaddrinfo
def public_addresses(host,port=443):
    if not allowed_host(host):raise ProcessingError("SSRF_BLOCKED",outcome="SOURCE_RESTRICTED")
    answers=_original_resolve(host,port,type=socket.SOCK_STREAM)
    for a in answers:
        ip=ipaddress.ip_address(a[4][0]);ip=ip.ipv4_mapped if getattr(ip,'ipv4_mapped',None) else ip
        if not ip.is_global:raise ProcessingError("SSRF_BLOCKED",outcome="SOURCE_RESTRICTED")
    if not answers:raise ProcessingError("DNS_EMPTY",True)
    return answers
class PinnedHTTPS(http.client.HTTPSConnection):
    def connect(self):
        answers=public_addresses(self.host,self.port)
        last=None
        for af,kind,proto,_,address in answers:
            try:
                raw=socket.socket(af,kind,proto);raw.settimeout(self.timeout);raw.connect(address)
                self.sock=self._context.wrap_socket(raw,server_hostname=self.host);return
            except OSError as ex:
                last=ex;raw.close()
        raise last or ProcessingError("CONNECT_FAILED",True)
def download_https(url,path,max_bytes,redirects=3):
    timeout=int(os.getenv('DOWNLOAD_SOCKET_TIMEOUT_SECONDS','60'))
    for _ in range(redirects+1):
        p=validate_url(url);conn=PinnedHTTPS(p.hostname,timeout=timeout,context=ssl.create_default_context())
        try:
            conn.request('GET',urllib.parse.urlunsplit(('', '', p.path or '/',p.query,'')),headers={'User-Agent':'SliceFlow/0.5'})
            response=conn.getresponse()
            if response.status in (301,302,303,307,308):url=urllib.parse.urljoin(url,response.getheader('Location',''));validate_url(url);continue
            if response.status!=200:raise ProcessingError("SOURCE_RESTRICTED",outcome="SOURCE_RESTRICTED")
            length=response.getheader('Content-Length')
            if length and int(length)>max_bytes:raise ProcessingError("FILE_TOO_LARGE")
            size=0
            with open(path,'wb') as f:
                while block:=response.read(1024*1024):
                    size+=len(block)
                    if size>max_bytes:raise ProcessingError("FILE_TOO_LARGE")
                    f.write(block)
            return size
        except (OSError,TimeoutError,ssl.SSLError,http.client.HTTPException) as exc:
            raise ProcessingError("DOWNLOAD_FAILED",True) from exc
        finally:conn.close()
    raise ProcessingError("REDIRECT_LIMIT",outcome="SOURCE_RESTRICTED")
@contextmanager
def youtube_dns_guard():
    # Used in a dedicated, single-job process; no concurrent AWS/provider request here.
    previous=socket.getaddrinfo
    def guarded(host,port,*args,**kwargs):
        if isinstance(host,bytes):host=host.decode('ascii')
        if not allowed_host(host):raise ProcessingError("SSRF_BLOCKED",outcome="SOURCE_RESTRICTED")
        answers=previous(host,port,*args,**kwargs)
        for a in answers:
            ip=ipaddress.ip_address(a[4][0]);ip=getattr(ip,'ipv4_mapped',None) or ip
            if not ip.is_global:raise ProcessingError("SSRF_BLOCKED",outcome="SOURCE_RESTRICTED")
        return answers
    socket.getaddrinfo=guarded
    try:yield
    finally:socket.getaddrinfo=previous

def antivirus(path):
    if os.getenv('SCAN_MODE','required')=='disabled-development':
        if os.getenv('APP_ENV')!='development':raise ProcessingError('SCAN_REQUIRED')
        return
    host=os.getenv('CLAMAV_HOST','clamav')
    try:
        with socket.create_connection((host,3310),timeout=60) as s:
            s.sendall(b'zINSTREAM\0')
            with open(path,'rb') as f:
                while chunk:=f.read(1024*1024):s.sendall(struct.pack('!I',len(chunk))+chunk)
            s.sendall(struct.pack('!I',0));result=s.recv(4096)
            if b'OK' not in result:raise ProcessingError('MALWARE_OR_SCAN_LIMIT')
    except OSError:raise ProcessingError('ANTIVIRUS_UNAVAILABLE',True)
