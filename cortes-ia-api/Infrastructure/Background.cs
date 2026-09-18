using Microsoft.EntityFrameworkCore;
using Amazon.SQS.Model;
namespace Cortes;
public class Background(IServiceScopeFactory scopes,Cloud cloud,ILogger<Background> log):BackgroundService {
 protected override async Task ExecuteAsync(CancellationToken stop){
  while(!stop.IsCancellationRequested){
   try{
    using var scope=scopes.CreateScope();var d=scope.ServiceProvider.GetRequiredService<Database>();var wallet=scope.ServiceProvider.GetRequiredService<WalletService>();
    foreach(var row in await d.Outbox.Where(x=>x.PublishedAt==null).OrderBy(x=>x.CreatedAt).Take(20).ToListAsync(stop)){await cloud.Queue(row.JobId);row.PublishedAt=DateTimeOffset.UtcNow;await d.SaveChangesAsync(stop);}
    var messages=await cloud.Sqs.ReceiveMessageAsync(new ReceiveMessageRequest{QueueUrl=cloud.EventsQueue,MaxNumberOfMessages=5,WaitTimeSeconds=2,VisibilityTimeout=120},stop);
    foreach(var message in messages.Messages??[]){
     try{var pointer=Json.Read<EventPointer>(message.Body);
      var job=await d.Jobs.AsNoTracking().SingleOrDefaultAsync(x=>x.Id==pointer.JobId,stop)??throw new DomainError("UNKNOWN_JOB");
      var expected=$"projects/{job.ProjectId}/jobs/{job.Id}/{pointer.Fence}/event.json";
      if(pointer.SchemaVersion!=1||pointer.ManifestKey!=expected)throw new DomainError("INVALID_EVENT_MANIFEST");
      using var obj=await cloud.S3.GetObjectAsync(cloud.Bucket,pointer.ManifestKey,stop);
      if(obj.ContentLength>2_000_000)throw new DomainError("MANIFEST_TOO_LARGE");
      using var reader=new StreamReader(obj.ResponseStream);var e=Json.Read<WorkerEvent>(await reader.ReadToEndAsync(stop));
      if(e.JobId!=pointer.JobId||e.Fence!=pointer.Fence)throw new DomainError("MANIFEST_MISMATCH");
      using var eventScope=scopes.CreateScope();await WorkerEndpoints.Apply(e,eventScope.ServiceProvider.GetRequiredService<Database>(),eventScope.ServiceProvider.GetRequiredService<WalletService>(),cloud);await cloud.Sqs.DeleteMessageAsync(cloud.EventsQueue,message.ReceiptHandle,stop);}catch(Exception ex){log.LogWarning("Event failed: {Type}",ex.GetType().Name);}
    }
    // Lease recovery: a crash cannot strand a reservation indefinitely.
    foreach(var stale in await d.Jobs.AsNoTracking().Where(x=>x.State=="RUNNING"&&x.LeaseUntil<DateTimeOffset.UtcNow).Take(20).ToListAsync(stop)){
     using var recovery=scopes.CreateScope();await WorkerEndpoints.Apply(new WorkerEvent(Guid.NewGuid(),stale.Id,stale.Fence,"failed","WORKER_TIMEOUT",true,0,null,null,null,"SYSTEM_FAILURE"),recovery.ServiceProvider.GetRequiredService<Database>(),recovery.ServiceProvider.GetRequiredService<WalletService>(),cloud);
    }
    await Notify(scope,d,stop);await Retain(d,wallet,stop);
    await scope.ServiceProvider.GetRequiredService<Payments>().ReconcilePending(stop);
   }catch(OperationCanceledException)when(stop.IsCancellationRequested){break;}catch(Exception ex){log.LogWarning("Background retry: {Type}",ex.GetType().Name);}
   await Task.Delay(TimeSpan.FromSeconds(5),stop);
  }
 }
 async Task Notify(IServiceScope scope,Database d,CancellationToken ct){
  foreach(var n in await d.Notifications.Where(x=>x.EmailStatus=="PENDING").OrderBy(x=>x.CreatedAt).Take(20).ToListAsync(ct)){
   var u=await d.Users.FindAsync([n.UserId],ct);
   var pref=await d.NotificationPreferences.FindAsync([n.UserId],ct);
   if(u?.Email==null||!NotificationEndpoints.WantsEmail(n,pref)){n.EmailStatus="SKIPPED";await d.SaveChangesAsync(ct);continue;}
   await scope.ServiceProvider.GetRequiredService<Mailer>().Send(u.Email,n.Subject,n.Body);
   n.SentAt=DateTimeOffset.UtcNow;n.EmailStatus="SENT";await d.SaveChangesAsync(ct);
  }
 }
 async Task Retain(Database d,WalletService wallet,CancellationToken ct){
  var now=DateTimeOffset.UtcNow;
  foreach(var u in await d.Users.Where(x=>x.LastActive<now.AddDays(-105)).Take(100).ToListAsync(ct)){
   var days=(now-u.LastActive).TotalDays;foreach(var milestone in new[]{105,115,119})if(days>=milestone&&days<120){var dedupe=$"retention:{u.Id}:{u.ActivityEpoch}:{milestone}";await NotificationEndpoints.Queue(d,u.Id,dedupe,"STORAGE_RETENTION_WARNING","STORAGE","Aviso de inatividade",$"Seus arquivos serão removidos ao completar 120 dias sem acesso. Acesse para manter os arquivos. Sua carteira não será alterada.","REQUIRED");}
  }await d.SaveChangesAsync(ct);
  var projectIds=await d.Projects.AsNoTracking().Where(p=>
   (p.DeletedAt!=null||p.FirstProcessedAt<now.AddHours(-48)||d.Users.Any(u=>u.Id==p.UserId&&u.LastActive<now.AddDays(-120)))
   &&d.Media.Any(m=>m.ProjectId==p.Id&&m.DeletedAt==null)).Select(p=>p.Id).Take(100).ToListAsync(ct);
  foreach(var id in projectIds){
   using var scope=scopes.CreateScope();var store=scope.ServiceProvider.GetRequiredService<Database>();var credits=scope.ServiceProvider.GetRequiredService<WalletService>();
   var owner=await store.Projects.Where(x=>x.Id==id).Select(x=>x.UserId).SingleAsync(ct);
   await using var tx=await store.Database.BeginTransactionAsync(ct);await store.LockWallet(owner,ct);
   // Serialize the cutoff with login/activity updates. No stale activity snapshot can delete a newly active account.
   var user=await store.Users.FromSqlInterpolated($"SELECT * FROM \"AspNetUsers\" WHERE \"Id\"={owner} FOR UPDATE").SingleAsync(ct);
   await store.LockProject(id,ct);var project=await store.Projects.FindAsync([id],ct);
   bool all=project!.DeletedAt!=null||user.LastActive<now.AddDays(-120);
   bool originalOnly=!all&&project.FirstProcessedAt<now.AddHours(-48)&&project.MasterAssetKey!=null;
   if(!all&&!originalOnly){await tx.CommitAsync(ct);continue;}
   var assets=await store.Media.Where(x=>x.ProjectId==id&&x.DeletedAt==null&&(all||x.Kind=="ORIGINAL")).ToListAsync(ct);
   foreach(var asset in assets){
    await cloud.S3.DeleteObjectAsync(cloud.Bucket,asset.Key,ct);asset.DeletionState="DELETED";asset.DeletedAt=DateTimeOffset.UtcNow;
    if(asset.Kind=="ORIGINAL")project.SourceAssetKey=null;
   }
   if(all){
    // Also remove manifests and unregistered outputs from interrupted attempts.
    string? continuation=null;
    do{var page=await cloud.S3.ListObjectsV2Async(new Amazon.S3.Model.ListObjectsV2Request{BucketName=cloud.Bucket,Prefix=$"projects/{id}/",ContinuationToken=continuation},ct);
     foreach(var item in page.S3Objects??[])await cloud.S3.DeleteObjectAsync(cloud.Bucket,item.Key,ct);
     continuation=page.IsTruncated==true?page.NextContinuationToken:null;
    }while(continuation!=null);
    project.MasterAssetKey=null;project.SourceAssetKey=null;project.Status=project.DeletedAt==null?"ARQUIVOS_EXPIRADOS":"EXCLUIDO";project.Generation++;
    if(project.DeletedAt==null)await NotificationEndpoints.Queue(store,owner,$"storage-deleted:{id}:{user.ActivityEpoch}","STORAGE_FILES_DELETED","STORAGE","Arquivos removidos por inatividade","Os arquivos deste projeto foram removidos após 120 dias de inatividade. Seu saldo de créditos permanece intacto.","REQUIRED");
    foreach(var job in await store.Jobs.Where(x=>x.ProjectId==id&&(x.State=="QUEUED"||x.State=="RUNNING")).ToListAsync(ct)){job.State="CANCELLED";job.Fence++;job.LeaseUntil=null;}
    foreach(var run in await store.Runs.Where(x=>x.ProjectId==id&&x.FinancialState=="RESERVED").ToListAsync(ct)){await credits.Refund(run,"ALL",run.Total-run.Refunded,"Execução encerrada antes de previews");run.Outcome="USER_CANCELLED";}
   }
   Api.Audit(store,null,"RETENTION_DELETE",id.ToString(),all?"Project retention":"Original after 48h with master retained");
   await store.SaveChangesAsync(ct);await tx.CommitAsync(ct);
  }
 }
}

public record EventPointer(int SchemaVersion,Guid JobId,int Fence,string ManifestKey);
