using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
namespace Cortes;
public record UploadDto(string Filename,long Size,string Title);
public record PartDto(int PartNumber);
public record CompletedPart(int PartNumber,string ETag);
public record CompleteDto(CompletedPart[] Parts);
public record LinkDto(string Url,string Title);
public record QuoteDto(string Modality,VideoConfig Configuration);
public record StartDto(Guid QuoteId,bool RightsAccepted);
public record EditDto(string Title,long StartMs,long EndMs,string Selection,SubtitleDto[] Subtitles,string Style="simple");
public record SubtitleDto(long StartMs,long EndMs,string Text);
public record ManualClipDto(string Title,RevisionSegment[] Segments,string Aspect="9:16",string CaptionPreset="Clean",string VisualStyle="Cinema");
public record ClipRevisionDto(string Title,string Selection,RevisionSegment[] Segments,SubtitleDto[] Subtitles,bool CaptionsEnabled=true,string CaptionPreset="Clean",string VisualStyle="Cinema",string Aspect="9:16",CropSpec? Crop=null);
public record ExportDto(Guid ClipId,string Format);
public record TicketDto(string Subject,string Message,Guid? ProjectId);
public static class ProjectEndpoints {
 public static void Map(WebApplication app){var g=app.MapGroup("/api/v1").RequireAuthorization();
  g.MapGet("/catalog",async(Policy p)=>new{maxBytes=await p.Number("maxBytes",5_000_000_000),maxDurationMs=await p.Number("maxDurationMs",10_800_000),maxClips=await p.Number("maxClips",20),formats=new[]{"mp4","mov","mkv","webm"},features=new Dictionary<string,int>{{"dynamic_captions",3},{"zoom",2},{"blur",3},{"tracking",2},{"cover",2}},paidPackagesEnabled=await p.Enabled("packagesApproved")});
  g.MapGet("/wallet",async(HttpContext h,Database d)=>new{wallet=await d.Wallets.SingleAsync(x=>x.Id==Api.User(h)),lots=await d.Lots.Where(x=>x.UserId==Api.User(h)).ToListAsync()});
  g.MapGet("/wallet/transactions",async(HttpContext h,Database d)=>await d.Ledger.Where(x=>x.UserId==Api.User(h)).OrderByDescending(x=>x.CreatedAt).Take(100).ToListAsync());
  g.MapGet("/projects",async(HttpContext h,Database d)=>await d.Projects.Where(x=>x.UserId==Api.User(h)&&x.DeletedAt==null).OrderByDescending(x=>x.CreatedAt).Take(100).Select(x=>new{x.Id,x.Title,x.Status,x.Outcome,x.DurationMs,x.Version,x.CreatedAt,x.FirstProcessedAt}).ToListAsync());
  g.MapGet("/projects/{id:guid}",async(Guid id,HttpContext h,Database d)=>{var p=await Api.Own(d,h,id);return new{p.Id,p.Title,p.Status,p.Outcome,p.DurationMs,p.Version,p.Generation,configuration=Json.Read<VideoConfig>(p.Configuration),sourceAvailable=p.MasterAssetKey!=null};});
  g.MapPost("/projects/uploads",async(UploadDto r,HttpContext h,Database d,Cloud cloud,Policy policy)=>{
   var key=Api.Key(h);var hash=Api.Hash(r);var uid=Api.User(h);
   await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(uid);
   var old=await d.Idempotency.SingleOrDefaultAsync(x=>x.UserId==uid&&x.Scope=="upload"&&x.Key==key);if(old!=null){if(old.BodyHash!=hash)throw new DomainError("IDEMPOTENCY_CONFLICT",409);return Results.Content(old.Response,"application/json");}
   if(r.Size<=0||r.Size>await policy.Number("maxBytes",5_000_000_000))throw new DomainError("FILE_TOO_LARGE",413);
   if(!new[]{".mp4",".mov",".mkv",".webm"}.Contains(Path.GetExtension(r.Filename).ToLowerInvariant()))throw new DomainError("UNSUPPORTED_MEDIA",415);
   var p=new Project{UserId=uid,Title=r.Title.Length>200?r.Title[..200]:r.Title};
   var u=new Upload{UserId=uid,ProjectId=p.Id,Key=$"quarantine/{p.Id}/{Guid.NewGuid()}",Size=r.Size};
   var multi=await cloud.S3.InitiateMultipartUploadAsync(new InitiateMultipartUploadRequest{BucketName=cloud.Bucket,Key=u.Key,ContentType="application/octet-stream"});u.MultipartId=multi.UploadId;
   p.SourceAssetKey=u.Key;d.Projects.Add(p);d.Uploads.Add(u);d.Media.Add(new Media{UserId=uid,ProjectId=p.Id,Key=u.Key,Kind="ORIGINAL",Size=r.Size,RetentionReason="ORIGINAL_48H_AFTER_PROCESSING"});
   var response=Json.Write(new{projectId=p.Id,uploadId=u.Id,partSize=64*1024*1024});d.Idempotency.Add(new Idempotency{UserId=uid,Scope="upload",Key=key,BodyHash=hash,Response=response});await d.SaveChangesAsync();await tx.CommitAsync();return Results.Content(response,"application/json");
  });
  g.MapPost("/uploads/{id:guid}/parts",async(Guid id,PartDto r,HttpContext h,Database d,Cloud c)=>{var u=await d.Uploads.SingleOrDefaultAsync(x=>x.Id==id&&x.UserId==Api.User(h)&&x.State=="UPLOADING")??throw new DomainError("NOT_FOUND",404);if(r.PartNumber<1||r.PartNumber>(u.Size+64*1024*1024-1)/(64*1024*1024))throw new DomainError("INVALID_PART");return new{url=c.Part(u.Key,u.MultipartId,r.PartNumber)};});
  g.MapPost("/uploads/{id:guid}/complete",async(Guid id,CompleteDto r,HttpContext h,Database d,Cloud c)=>{
   await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(Api.User(h));
   var u=await d.Uploads.SingleOrDefaultAsync(x=>x.Id==id&&x.UserId==Api.User(h))??throw new DomainError("NOT_FOUND",404);if(u.State=="COMPLETED")return Results.Accepted();
   if(u.State!="UPLOADING"||r.Parts.Length==0||r.Parts.Select(x=>x.PartNumber).Distinct().Count()!=r.Parts.Length)throw new DomainError("INVALID_UPLOAD");
   // If S3 completed before a crash, HEAD permits recovery on the same key.
   try{await c.S3.GetObjectMetadataAsync(c.Bucket,u.Key);}catch(Amazon.S3.AmazonS3Exception ex)when(ex.StatusCode==System.Net.HttpStatusCode.NotFound){await c.S3.CompleteMultipartUploadAsync(new CompleteMultipartUploadRequest{BucketName=c.Bucket,Key=u.Key,UploadId=u.MultipartId,PartETags=r.Parts.OrderBy(x=>x.PartNumber).Select(x=>new PartETag(x.PartNumber,x.ETag)).ToList()});}
   var meta=await c.S3.GetObjectMetadataAsync(c.Bucket,u.Key);if(meta.ContentLength!=u.Size)throw new DomainError("SIZE_MISMATCH",422);
   var p=await Api.Own(d,h,u.ProjectId);u.State="COMPLETED";Api.Enqueue(d,p,"INGEST",null,new{sourceKey=u.Key});await d.SaveChangesAsync();await tx.CommitAsync();return Results.Accepted();
  });
  g.MapPost("/projects/imports",async(LinkDto r,HttpContext h,Database d)=>{
   if(!Uri.TryCreate(r.Url,UriKind.Absolute,out var uri)||uri.Scheme!="https"||!new[]{"www.youtube.com","youtube.com","youtu.be"}.Contains(uri.Host)||!string.IsNullOrEmpty(uri.UserInfo)||uri.Port!=443)throw new DomainError("UNSUPPORTED_SOURCE",422);
   await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(Api.User(h));var key=Api.Key(h);var hash=Api.Hash(r);
   var old=await d.Idempotency.SingleOrDefaultAsync(x=>x.UserId==Api.User(h)&&x.Scope=="link"&&x.Key==key);if(old!=null){if(old.BodyHash!=hash)throw new DomainError("IDEMPOTENCY_CONFLICT",409);return Results.Content(old.Response,"application/json");}
   var p=new Project{UserId=Api.User(h),Title=r.Title,SourceUrl=r.Url};d.Projects.Add(p);Api.Enqueue(d,p,"LINK_METADATA",null,new{url=r.Url});var response=Json.Write(new{projectId=p.Id});d.Idempotency.Add(new Idempotency{UserId=Api.User(h),Scope="link",Key=key,BodyHash=hash,Response=response});await d.SaveChangesAsync();await tx.CommitAsync();return Results.Content(response,"application/json");
  });
  g.MapPost("/projects/{id:guid}/quotes",async(Guid id,QuoteDto r,HttpContext h,Database d,Policy policy)=>{
   var p=await Api.Own(d,h,id);if(p.DurationMs<=0||p.Status is "BLOQUEADO_RESTRICAO" or "ARQUIVOS_EXPIRADOS")throw new DomainError("SOURCE_NOT_READY",409);
   if(r.Modality is not ("trial" or "paid"))throw new DomainError("INVALID_MODALITY");
   var items=await policy.Price(p.DurationMs,r.Configuration);var q=new Quote{UserId=p.UserId,ProjectId=p.Id,Version=p.Version,Items=Json.Write(items),Total=items.Sum(x=>x.Credits),Configuration=Json.Write(r.Configuration),Modality=r.Modality};d.Quotes.Add(q);await d.SaveChangesAsync();var balance=(await d.Wallets.FindAsync(p.UserId))!.Available;return new{q.Id,q.Total,items,balance,balanceAfter=balance-q.Total,q.ExpiresAt};
  });
  g.MapPost("/projects/{id:guid}/runs",async(Guid id,StartDto r,HttpContext h,Database d,WalletService wallet)=>{
   if(!r.RightsAccepted)throw new DomainError("RIGHTS_REQUIRED");var uid=Api.User(h);var key=Api.Key(h);var hash=Api.Hash(new{id,r});
   await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(uid);await d.LockProject(id);
   var old=await d.Idempotency.SingleOrDefaultAsync(x=>x.UserId==uid&&x.Scope=="run"&&x.Key==key);if(old!=null){if(old.BodyHash!=hash)throw new DomainError("IDEMPOTENCY_CONFLICT",409);return Results.Content(old.Response,"application/json");}
   var p=await Api.Own(d,h,id);if(await d.Jobs.AnyAsync(x=>x.ProjectId==id&&(x.State=="RUNNING"||x.State=="QUEUED")))throw new DomainError("PROJECT_BUSY",409);
   var q=await d.Quotes.SingleOrDefaultAsync(x=>x.Id==r.QuoteId&&x.ProjectId==id&&x.UserId==uid)??throw new DomainError("QUOTE_NOT_FOUND",404);
   if(q.ExpiresAt<DateTimeOffset.UtcNow||q.Version!=p.Version)throw new DomainError("QUOTE_STALE",409);
   var run=new Run{UserId=uid,ProjectId=id,QuoteId=q.Id,Total=q.Total,Items=q.Items,Configuration=q.Configuration,Modality=q.Modality};d.Runs.Add(run);await wallet.Reserve(run);
   p.Configuration=q.Configuration;p.Version++;p.Status="RECEBIDO";p.Outcome=null;
   var job=Api.Enqueue(d,p,"PROCESS",run.Id,new{sourceKey=p.MasterAssetKey??p.SourceAssetKey,url=p.SourceUrl,config=Json.Read<VideoConfig>(q.Configuration),modality=q.Modality});
   var response=Json.Write(new{runId=run.Id,jobId=job.Id});d.Idempotency.Add(new Idempotency{UserId=uid,Scope="run",Key=key,BodyHash=hash,Response=response});Api.Audit(d,uid,"RUN_CONFIRMED",run.Id.ToString(),"Direitos aceitos; quote="+q.Id);await d.SaveChangesAsync();await tx.CommitAsync();return Results.Content(response,"application/json");
  });
  g.MapGet("/projects/{id:guid}/editor",async(Guid id,HttpContext h,Database d)=>{
   var p=await Api.Own(d,h,id);
   return new{
    p.Id,p.DurationMs,masterAvailable=p.MasterAssetKey!=null,
    captionPresets=CaptionPresets.OrderBy(x=>x),
    visualStyles=VisualStyles.OrderBy(x=>x),
    aspects=Aspects.OrderBy(x=>x),
    capabilities=new{manualCuts=true,nonDestructiveRevisions=true,segments=true,captionSync=true,manualCrop=true}
   };
  });
  g.MapGet("/projects/{id:guid}/clips",async(Guid id,HttpContext h,Database d,Cloud cloud)=>{
   await Api.Own(d,h,id);var clips=await d.Clips.Where(x=>x.ProjectId==id).OrderBy(x=>x.StartMs).ToListAsync();
   return clips.Select(x=>new{x.Id,x.Title,x.Reason,x.StartMs,x.EndMs,x.Selection,x.Revision,x.Style,
    segments=ReadSegments(x),subtitles=Json.Read<SubtitleDto[]>(x.Subtitles),x.CaptionPreset,x.VisualStyle,x.Aspect,crop=Json.Read<CropSpec>(x.Crop),
    preview=x.PreviewKey==null?null:cloud.Download(x.PreviewKey),cover=x.CoverKey==null?null:cloud.Download(x.CoverKey)});
  });
  g.MapGet("/clips/{id:guid}/revisions",async(Guid id,HttpContext h,Database d)=>{
   var clip=await d.Clips.FindAsync(id)??throw new DomainError("NOT_FOUND",404);await Api.Own(d,h,clip.ProjectId);
   var revisions=await d.ClipRevisions.Where(x=>x.ClipId==id).OrderByDescending(x=>x.Number).ToListAsync();
   return revisions.Select(x=>new{x.Id,x.Number,x.Title,x.Selection,x.StartMs,x.EndMs,segments=Json.Read<RevisionSegment[]>(x.Segments),subtitles=Json.Read<SubtitleDto[]>(x.Subtitles),x.Style,x.CaptionPreset,x.VisualStyle,x.Aspect,crop=Json.Read<CropSpec>(x.Crop),x.CreatedAt});
  });
  g.MapPost("/projects/{id:guid}/clips/manual",async(Guid id,ManualClipDto r,HttpContext h,Database d)=>{
   await using var tx=await d.Database.BeginTransactionAsync();await d.LockProject(id);var p=await Api.Own(d,h,id);
   if(p.MasterAssetKey==null)throw new DomainError("MASTER_EXPIRED",410);
   var run=await d.Runs.Where(x=>x.ProjectId==id).OrderByDescending(x=>x.CreatedAt).FirstOrDefaultAsync()??throw new DomainError("NO_ANALYSIS_AVAILABLE",409);
   var segments=ValidateSegments(r.Segments,p.DurationMs);ValidateEditorStyle(r.CaptionPreset,r.VisualStyle,r.Aspect,new CropSpec());
   if(string.IsNullOrWhiteSpace(r.Title)||r.Title.Length>200)throw new DomainError("INVALID_EDIT");
   var clip=new Clip{ProjectId=id,RunId=run.Id,Title=r.Title.Trim(),Reason="Corte criado manualmente pelo usuário.",StartMs=segments.Min(x=>x.StartMs),EndMs=segments.Max(x=>x.EndMs),Selection="SELECTED",Segments=Json.Write(segments),Subtitles="[]",Style="simple",CaptionPreset=r.CaptionPreset,VisualStyle=r.VisualStyle,Aspect=r.Aspect};
   d.Clips.Add(clip);d.ClipRevisions.Add(Snapshot(clip));Api.Audit(d,Api.User(h),"MANUAL_CLIP_CREATED",clip.Id.ToString(),"Working master; sem nova análise de IA");
   await d.SaveChangesAsync();await tx.CommitAsync();return Results.Created($"/api/v1/clips/{clip.Id}",new{clip.Id,clip.Revision});
  });
  g.MapPost("/clips/{id:guid}/revisions",async(Guid id,ClipRevisionDto r,HttpContext h,Database d)=>{
   var clip=await d.Clips.FindAsync(id)??throw new DomainError("NOT_FOUND",404);await using var tx=await d.Database.BeginTransactionAsync();await d.LockProject(clip.ProjectId);var p=await Api.Own(d,h,clip.ProjectId);await d.Entry(clip).ReloadAsync();Api.Version(h,clip.Revision);
   if(string.IsNullOrWhiteSpace(r.Title)||r.Title.Length>200||!Selections.Contains(r.Selection))throw new DomainError("INVALID_EDIT");
   var segments=ValidateSegments(r.Segments,p.DurationMs);var total=segments.Sum(x=>x.EndMs-x.StartMs);ValidateSubtitles(r.Subtitles,total);var crop=r.Crop??new CropSpec();ValidateEditorStyle(r.CaptionPreset,r.VisualStyle,r.Aspect,crop);
   await EnsureCurrentRevision(d,clip);
   clip.Title=r.Title.Trim();clip.StartMs=segments.Min(x=>x.StartMs);clip.EndMs=segments.Max(x=>x.EndMs);clip.Selection=r.Selection;clip.Segments=Json.Write(segments);clip.Subtitles=Json.Write(r.Subtitles);clip.Style=r.CaptionsEnabled?"simple":"none";clip.CaptionPreset=r.CaptionPreset;clip.VisualStyle=r.VisualStyle;clip.Aspect=r.Aspect;clip.Crop=Json.Write(crop);clip.Revision++;
   d.ClipRevisions.Add(Snapshot(clip));Api.Audit(d,Api.User(h),"CLIP_REVISION_CREATED",clip.Id.ToString(),"Revision "+clip.Revision);
   await d.SaveChangesAsync();await tx.CommitAsync();return Results.Ok(new{clip.Revision});
  });
  g.MapPut("/clips/{id:guid}",async(Guid id,EditDto r,HttpContext h,Database d)=>{
   var clip=await d.Clips.FindAsync(id)??throw new DomainError("NOT_FOUND",404);await using var tx=await d.Database.BeginTransactionAsync();await d.LockProject(clip.ProjectId);var p=await Api.Own(d,h,clip.ProjectId);await d.Entry(clip).ReloadAsync();Api.Version(h,clip.Revision);
   if(r.StartMs<0||r.EndMs<=r.StartMs||r.EndMs>p.DurationMs||string.IsNullOrWhiteSpace(r.Title)||r.Title.Length>200||!Selections.Contains(r.Selection)||!new[]{"simple","none"}.Contains(r.Style))throw new DomainError("INVALID_EDIT");
   ValidateSubtitles(r.Subtitles,r.EndMs-r.StartMs);await EnsureCurrentRevision(d,clip);
   clip.Title=r.Title.Trim();clip.StartMs=r.StartMs;clip.EndMs=r.EndMs;clip.Selection=r.Selection;clip.Segments=Json.Write(new[]{new RevisionSegment(r.StartMs,r.EndMs)});clip.Subtitles=Json.Write(r.Subtitles);clip.Style=r.Style;clip.Revision++;d.ClipRevisions.Add(Snapshot(clip));
   await d.SaveChangesAsync();await tx.CommitAsync();return Results.Ok(new{clip.Revision});
  });
  g.MapPost("/projects/{id:guid}/exports",async(Guid id,ExportDto r,HttpContext h,Database d)=>{
   await using var tx=await d.Database.BeginTransactionAsync();await d.LockProject(id);var p=await Api.Own(d,h,id);
   if(p.MasterAssetKey==null)throw new DomainError("MASTER_EXPIRED",410);
   var clip=await d.Clips.SingleOrDefaultAsync(x=>x.Id==r.ClipId&&x.ProjectId==id)??throw new DomainError("NOT_FOUND",404);if(clip.Selection!="SELECTED")throw new DomainError("SELECT_CLIP_FIRST",409);
   var run=await d.Runs.FindAsync(clip.RunId);var config=Json.Read<VideoConfig>(run!.Configuration);if(!(config.Formats??["9:16"]).Contains(r.Format))throw new DomainError("ADDITIONAL_FORMAT_QUOTE_REQUIRED",409);
   var old=await d.Exports.SingleOrDefaultAsync(x=>x.ClipId==clip.Id&&x.Revision==clip.Revision&&x.Format==r.Format);if(old!=null){if(old.State=="FAILED"){var prior=await d.Jobs.FindAsync(old.JobId);prior!.State="QUEUED";prior.LeaseUntil=null;prior.Attempts=0;old.State="QUEUED";d.Outbox.Add(new Outbox{JobId=prior.Id});await d.SaveChangesAsync();await tx.CommitAsync();}return Results.Accepted(value:new{exportId=old.Id});}
   var job=Api.Enqueue(d,p,"RENDER",run.Id,new{sourceKey=p.MasterAssetKey,clip=new{clip.Id,clip.StartMs,clip.EndMs,clip.Title,segments=ReadSegments(clip),subtitles=Json.Read<SubtitleDto[]>(clip.Subtitles),clip.Style,clip.CaptionPreset,clip.VisualStyle,clip.Aspect,crop=Json.Read<CropSpec>(clip.Crop),clip.Revision},format=r.Format,features=Json.Read<QuoteItem[]>(run.Items).Where(x=>x.Feature!=null).Select(x=>x.Feature).ToArray()});
   var export=new Export{ClipId=clip.Id,ProjectId=id,JobId=job.Id,Revision=clip.Revision,Format=r.Format};d.Exports.Add(export);p.Status="RENDERIZANDO";await d.SaveChangesAsync();await tx.CommitAsync();return Results.Accepted(value:new{exportId=export.Id});
  });
  g.MapGet("/projects/{id:guid}/exports",async(Guid id,HttpContext h,Database d,Cloud c)=>{await Api.Own(d,h,id);var list=await d.Exports.Where(x=>x.ProjectId==id).ToListAsync();return list.Select(x=>new{x.Id,x.ClipId,x.Format,x.Revision,x.State,url=x.Key==null?null:c.Download(x.Key)});});
  g.MapPost("/projects/{id:guid}/alternatives",async(Guid id,HttpContext h,Database d)=>{
   await using var tx=await d.Database.BeginTransactionAsync();await d.LockProject(id);var p=await Api.Own(d,h,id);
   if(p.MasterAssetKey==null)throw new DomainError("MASTER_EXPIRED",410);
   if(await d.Jobs.AnyAsync(x=>x.ProjectId==id&&(x.State=="QUEUED"||x.State=="RUNNING")))throw new DomainError("PROJECT_BUSY",409);
   var run=await d.Runs.Where(x=>x.ProjectId==id&&x.FinancialState=="CAPTURED").OrderByDescending(x=>x.CreatedAt).FirstOrDefaultAsync()??throw new DomainError("NO_ANALYSIS_AVAILABLE",409);
   var transcript=await d.Media.Where(x=>x.ProjectId==id&&x.Kind=="TRANSCRIPT"&&x.DeletedAt==null).OrderByDescending(x=>x.CreatedAt).FirstOrDefaultAsync()??throw new DomainError("TRANSCRIPT_MISSING",410);
   var rejected=await d.Clips.Where(x=>x.ProjectId==id).Select(x=>new{x.StartMs,x.EndMs}).ToListAsync();
   var job=Api.Enqueue(d,p,"ALTERNATIVES",run.Id,new{sourceKey=p.MasterAssetKey,transcriptKey=transcript.Key,config=Json.Read<VideoConfig>(run.Configuration),modality=run.Modality,rejected});p.Status="ANALISANDO";
   await d.SaveChangesAsync();await tx.CommitAsync();return Results.Accepted(value:new{jobId=job.Id});
  });
  g.MapPost("/projects/{id:guid}/bundle",async(Guid id,HttpContext h,Database d)=>{
   await using var tx=await d.Database.BeginTransactionAsync();await d.LockProject(id);var p=await Api.Own(d,h,id);
   var exports=await d.Exports.Where(x=>x.ProjectId==id&&x.State=="SUCCEEDED").Select(x=>new{x.Id,x.Key}).ToListAsync();if(exports.Count==0)throw new DomainError("NO_EXPORTS",409);
   var job=Api.Enqueue(d,p,"BUNDLE",null,new{exports});await d.SaveChangesAsync();await tx.CommitAsync();return Results.Accepted(value:new{jobId=job.Id});
  });
  g.MapGet("/projects/{id:guid}/bundles",async(Guid id,HttpContext h,Database d,Cloud c)=>{await Api.Own(d,h,id);var assets=await d.Media.Where(x=>x.ProjectId==id&&x.Kind=="BUNDLE"&&x.DeletedAt==null).OrderByDescending(x=>x.CreatedAt).Take(10).ToListAsync();return assets.Select(x=>new{x.Id,url=c.Download(x.Key)});});
  g.MapDelete("/projects/{id:guid}",async(Guid id,HttpContext h,Database d)=>{await using var tx=await d.Database.BeginTransactionAsync();await d.LockProject(id);var p=await Api.Own(d,h,id);p.DeletedAt=DateTimeOffset.UtcNow;p.Generation++;p.Status="EXCLUIDO";await d.SaveChangesAsync();await tx.CommitAsync();return Results.Accepted();});
  g.MapPost("/tickets",async(TicketDto r,HttpContext h,Database d)=>{if(r.ProjectId.HasValue)await Api.Own(d,h,r.ProjectId.Value);if(r.Subject.Length>200||r.Message.Length>10000)throw new DomainError("INVALID_TICKET");var t=new Ticket{UserId=Api.User(h),ProjectId=r.ProjectId,Subject=r.Subject,Message=r.Message};d.Tickets.Add(t);await d.SaveChangesAsync();return Results.Ok(t);});
  g.MapGet("/tickets",async(HttpContext h,Database d)=>await d.Tickets.Where(x=>x.UserId==Api.User(h)).OrderByDescending(x=>x.CreatedAt).Take(100).ToListAsync());
 }

 static readonly HashSet<string> Selections=new(StringComparer.Ordinal){"SELECTED","REJECTED","SUGGESTED"};
 static readonly HashSet<string> CaptionPresets=new(StringComparer.OrdinalIgnoreCase){"Clean","Bold","Viral","Podcast","Karaoke","Pop","Minimal","Box","News","Dark","Neon","Impacto","Emoji","Subtitle Classic","Creator","Custom"};
 static readonly HashSet<string> VisualStyles=new(StringComparer.OrdinalIgnoreCase){"Cinema","Divertido","Animado","Sombrio","Quente","Frio","Clean","Podcast","Impactante","Viral"};
 static readonly HashSet<string> Aspects=new(StringComparer.OrdinalIgnoreCase){"9:16","4:5","1:1","16:9","original"};

 static RevisionSegment[] ReadSegments(Clip clip){
  var segments=Json.Read<RevisionSegment[]>(clip.Segments);
  return segments.Length==0?new[]{new RevisionSegment(clip.StartMs,clip.EndMs)}:segments;
 }
 static RevisionSegment[] ValidateSegments(RevisionSegment[]? segments,long durationMs){
  if(segments==null||segments.Length==0||segments.Length>64)throw new DomainError("INVALID_SEGMENTS");
  long total=0,previous=-1;
  foreach(var s in segments){
   if(s.StartMs<0||s.EndMs<=s.StartMs||s.EndMs>durationMs||s.StartMs<previous)throw new DomainError("INVALID_SEGMENTS");
   total+=s.EndMs-s.StartMs;previous=s.EndMs;
  }
  if(total<=0||total>180_000)throw new DomainError("INVALID_SEGMENTS");
  return segments;
 }
 static void ValidateSubtitles(SubtitleDto[]? subtitles,long outputDurationMs){
  if(subtitles==null||subtitles.Length>5000||subtitles.Any(x=>x.StartMs<0||x.EndMs<=x.StartMs||x.EndMs>outputDurationMs||x.Text.Length>1000))throw new DomainError("INVALID_SUBTITLE");
 }
 static void ValidateEditorStyle(string captionPreset,string visualStyle,string aspect,CropSpec crop){
  if(!CaptionPresets.Contains(captionPreset)||!VisualStyles.Contains(visualStyle)||!Aspects.Contains(aspect))throw new DomainError("INVALID_EDITOR_PRESET");
  if(crop.X<0||crop.Y<0||crop.Width<=0||crop.Height<=0||crop.X+crop.Width>1.000001||crop.Y+crop.Height>1.000001)throw new DomainError("INVALID_CROP");
 }
 static ClipRevision Snapshot(Clip clip)=>new(){
  ClipId=clip.Id,ProjectId=clip.ProjectId,Number=clip.Revision,Title=clip.Title,Selection=clip.Selection,StartMs=clip.StartMs,EndMs=clip.EndMs,
  Segments=clip.Segments,Subtitles=clip.Subtitles,Style=clip.Style,CaptionPreset=clip.CaptionPreset,CaptionOverrides=clip.CaptionOverrides,
  VisualStyle=clip.VisualStyle,VisualOverrides=clip.VisualOverrides,Aspect=clip.Aspect,Crop=clip.Crop,CoverKey=clip.CoverKey
 };
 static async Task EnsureCurrentRevision(Database d,Clip clip){
  if(!await d.ClipRevisions.AnyAsync(x=>x.ClipId==clip.Id&&x.Number==clip.Revision))d.ClipRevisions.Add(Snapshot(clip));
 }
}
