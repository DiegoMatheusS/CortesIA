using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
namespace Cortes;
public record HeartbeatDto(int Fence);
public record OutputDto(string Key,string Kind,long Size);
public record CandidateDto(string Title,string Reason,long StartMs,long EndMs,string PreviewKey,string? CoverKey,SubtitleDto[] Subtitles);
public record PreviewClipRef(Guid Id,int Revision);
public record PreviewPayload(PreviewClipRef Clip);
public record WorkerEvent(Guid EventId,Guid JobId,int Fence,string Kind,string? Error,bool Retryable,long DurationMs,OutputDto[]? Outputs,CandidateDto[]? Clips,string[]? FailedFeatures,string? Outcome);
public static class WorkerEndpoints {
 public static void Map(WebApplication app){var g=app.MapGroup("/internal/v1");
  g.AddEndpointFilter(async(ctx,next)=>{var got=Encoding.UTF8.GetBytes(ctx.HttpContext.Request.Headers["X-Worker-Token"].ToString());var expected=Encoding.UTF8.GetBytes(app.Configuration["WORKER_TOKEN"]!);if(!CryptographicOperations.FixedTimeEquals(SHA256.HashData(got),SHA256.HashData(expected)))return Results.Unauthorized();return await next(ctx);});
  g.MapPost("/jobs/{id:guid}/lease",async(Guid id,Database d,Policy policy)=>{
   await using var tx=await d.Database.BeginTransactionAsync();var j=await d.Jobs.FromSqlInterpolated($"SELECT * FROM \"Jobs\" WHERE \"Id\"={id} FOR UPDATE").SingleOrDefaultAsync()??throw new DomainError("NOT_FOUND",404);
   var p=await d.Projects.FindAsync(j.ProjectId);
   if(p!.DeletedAt!=null||p.Generation!=j.Generation||j.State is "SUCCEEDED" or "FAILED" or "CANCELLED")return Results.Ok(new{disposition="DONE"});
   if(j.LeaseUntil>DateTimeOffset.UtcNow&&j.State=="RUNNING")return Results.Ok(new{disposition="BUSY"});
   j.State="RUNNING";j.Attempts++;j.Fence++;j.LeaseUntil=DateTimeOffset.UtcNow.AddSeconds(120);await d.SaveChangesAsync();await tx.CommitAsync();
   return Results.Ok(new{disposition="GRANTED",j.Id,j.Stage,j.Fence,j.ProjectId,j.Generation,p.DurationMs,payload=System.Text.Json.JsonSerializer.Deserialize<object>(j.Payload),outputPrefix=$"projects/{j.ProjectId}/jobs/{j.Id}/{j.Fence}/",maxBytes=await policy.Number("maxBytes",5_000_000_000),maxDurationMs=await policy.Number("maxDurationMs",10_800_000)});
  });
  g.MapPost("/jobs/{id:guid}/heartbeat",async(Guid id,HeartbeatDto r,Database d)=>{
   var n=await d.Jobs.Where(x=>x.Id==id&&x.Fence==r.Fence&&x.State=="RUNNING"&&x.LeaseUntil>DateTimeOffset.UtcNow).ExecuteUpdateAsync(x=>x.SetProperty(y=>y.LeaseUntil,DateTimeOffset.UtcNow.AddSeconds(120)));
   if(n!=1)throw new DomainError("LEASE_LOST",409);return Results.Ok();
  });
 }
 public static async Task Apply(WorkerEvent e,Database d,WalletService wallet,Cloud cloud){
  if(await d.Inbox.AnyAsync(x=>x.Id==e.EventId))return;
  var initial=await d.Jobs.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==e.JobId);if(initial==null)return;
  var owner=await d.Projects.AsNoTracking().Where(x=>x.Id==initial.ProjectId).Select(x=>x.UserId).SingleAsync();
  await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(owner);await d.LockProject(initial.ProjectId);
  var j=await d.Jobs.FromSqlInterpolated($"SELECT * FROM \"Jobs\" WHERE \"Id\"={e.JobId} FOR UPDATE").SingleAsync();var p=await d.Projects.FindAsync(j.ProjectId);
  if(await d.Inbox.AnyAsync(x=>x.Id==e.EventId))return;
  d.Inbox.Add(new Inbox{Id=e.EventId});
  if(j.Fence!=e.Fence||j.State!="RUNNING"||p!.Generation!=j.Generation||p.DeletedAt!=null){await d.SaveChangesAsync();await tx.CommitAsync();return;}
  var run=j.RunId.HasValue?await d.Runs.FindAsync(j.RunId.Value):null;
  if(e.Kind=="failed"){
   if(e.Retryable&&j.Attempts<3){j.State="QUEUED";j.LeaseUntil=null;d.Outbox.Add(new Outbox{JobId=j.Id});}
   else{
    j.State="FAILED";j.Error=e.Error??"SYSTEM_FAILURE";j.LeaseUntil=null;
    p.Outcome=e.Outcome??"SYSTEM_FAILURE";p.Status=e.Outcome=="SOURCE_RESTRICTED"?"BLOQUEADO_RESTRICAO":"ERRO";
    if(j.Stage=="RENDER"){var ex=await d.Exports.SingleAsync(x=>x.JobId==j.Id);ex.State="FAILED";}
    else if(run!=null&&run.FinancialState=="RESERVED"){await wallet.Refund(run,"ALL",run.Total-run.Refunded,"Falha antes de previews úteis");run.Outcome=p.Outcome;}
   }
  }else if(e.Kind=="succeeded"){
   var prefix=$"projects/{j.ProjectId}/jobs/{j.Id}/{j.Fence}/";
   foreach(var output in e.Outputs??[]){
    if(!output.Key.StartsWith(prefix,StringComparison.Ordinal)||output.Key.Contains("..")||output.Size<0)throw new DomainError("INVALID_WORKER_OUTPUT");
    var head=await cloud.S3.GetObjectMetadataAsync(cloud.Bucket,output.Key);if(head.ContentLength!=output.Size)throw new DomainError("OUTPUT_SIZE_MISMATCH");
    d.Media.Add(new Media{UserId=p.UserId,ProjectId=p.Id,Key=output.Key,Kind=output.Kind,Size=output.Size});
   }
   if(j.Stage is "INGEST" or "LINK_METADATA"){
    if(e.DurationMs<=0||e.DurationMs>10_800_000)throw new DomainError("INVALID_DURATION");p.DurationMs=e.DurationMs;p.Status="RECEBIDO";
    var master=(e.Outputs??[]).FirstOrDefault(x=>x.Kind=="WORKING_MASTER");if(master!=null)p.MasterAssetKey=master.Key;
   }else if(j.Stage is "PROCESS" or "ALTERNATIVES"){
    if(run==null)throw new InvalidOperationException("Run missing");
    var clips=e.Clips??[];var config=Json.Read<VideoConfig>(run.Configuration);
    if(clips.Length>config.Quantity||clips.Any(c=>c.StartMs<0||c.EndMs<=c.StartMs||c.EndMs>p.DurationMs||!c.PreviewKey.StartsWith(prefix,StringComparison.Ordinal)||(c.CoverKey!=null&&!c.CoverKey.StartsWith(prefix,StringComparison.Ordinal))||!(e.Outputs??[]).Any(o=>o.Key==c.PreviewKey)||(c.CoverKey!=null&&!(e.Outputs??[]).Any(o=>o.Key==c.CoverKey))))throw new DomainError("INVALID_CANDIDATES");
    var master=(e.Outputs??[]).FirstOrDefault(x=>x.Kind=="WORKING_MASTER");if(master!=null)p.MasterAssetKey=master.Key;
    if(clips.Length==0&&j.Stage=="ALTERNATIVES"){p.Status="AGUARDANDO_REVISAO";}
    else if(clips.Length==0){p.FirstProcessedAt??=DateTimeOffset.UtcNow;p.Outcome="NO_SUITABLE_CLIPS";p.Status="AGUARDANDO_REVISAO";run.Outcome=p.Outcome;await wallet.Refund(run,"ALL",run.Total-run.Refunded,"Nenhum trecho adequado encontrado");}
    else{
     foreach(var candidate in clips){
      var aspect=(config.Formats??new[]{"9:16"}).FirstOrDefault()??"9:16";
      var clip=new Clip{ProjectId=p.Id,RunId=run.Id,Title=candidate.Title,Reason=candidate.Reason,StartMs=candidate.StartMs,EndMs=candidate.EndMs,Segments=Json.Write(new[]{new RevisionSegment(candidate.StartMs,candidate.EndMs)}),PreviewKey=candidate.PreviewKey,PreviewRevision=1,CoverKey=candidate.CoverKey,Subtitles=Json.Write(candidate.Subtitles),CaptionPreset="Clean",VisualStyle="Cinema",Aspect=aspect};
      d.Clips.Add(clip);d.ClipRevisions.Add(new ClipRevision{ClipId=clip.Id,ProjectId=p.Id,Number=1,Title=clip.Title,Selection=clip.Selection,StartMs=clip.StartMs,EndMs=clip.EndMs,Segments=clip.Segments,Subtitles=clip.Subtitles,Style=clip.Style,CaptionPreset=clip.CaptionPreset,VisualStyle=clip.VisualStyle,Aspect=clip.Aspect,Crop=clip.Crop,CoverKey=clip.CoverKey});
     }
     await wallet.Capture(run);p.Status="AGUARDANDO_REVISAO";p.Outcome="SUCCESS";run.Outcome="SUCCESS";p.FirstProcessedAt??=DateTimeOffset.UtcNow;
     foreach(var feature in (e.FailedFeatures??[]).Distinct()){var item=Json.Read<QuoteItem[]>(run.Items).SingleOrDefault(x=>x.Feature==feature);if(item!=null)await wallet.Refund(run,item.Code,item.Credits,"Extra não entregue em nenhum output");}
     if(!await d.Notifications.AnyAsync(x=>x.Dedupe=="ready:"+run.Id))d.Notifications.Add(new Notification{UserId=p.UserId,Dedupe="ready:"+run.Id,Subject="Suas prévias estão prontas",Body="Acesse o projeto para revisar e escolher os cortes finais."});
    }
   }else if(j.Stage=="PREVIEW"){
    var payload=Json.Read<PreviewPayload>(j.Payload);var output=(e.Outputs??[]).Single(x=>x.Kind=="PREVIEW");
    var clip=await d.Clips.SingleOrDefaultAsync(x=>x.Id==payload.Clip.Id&&x.ProjectId==p.Id)??throw new DomainError("INVALID_PREVIEW_TARGET");
    if(clip.Revision==payload.Clip.Revision){clip.PreviewKey=output.Key;clip.PreviewRevision=payload.Clip.Revision;}
   }else if(j.Stage=="RENDER"){
    var ex=await d.Exports.SingleAsync(x=>x.JobId==j.Id);var output=(e.Outputs??[]).Single(x=>x.Kind=="FINAL_EXPORT");ex.Key=output.Key;ex.State="SUCCEEDED";
    p.Status=await d.Exports.AnyAsync(x=>x.ProjectId==p.Id&&x.Id!=ex.Id&&x.State!="SUCCEEDED")?"RENDERIZANDO":"PRONTO";
   }
   j.State="SUCCEEDED";j.LeaseUntil=null;
  }else throw new DomainError("INVALID_EVENT_KIND");
  await d.SaveChangesAsync();await tx.CommitAsync();
 }
}
