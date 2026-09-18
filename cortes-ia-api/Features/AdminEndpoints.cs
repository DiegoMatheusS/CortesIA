using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using System.Security.Claims;
namespace Cortes;
public record BlockDto(bool Blocked,string Reason);
public record AdjustDto(Guid UserId,long Credits,string Reason);
public record RefundDto(Guid RunId,string ItemCode,string Reason);
public record SettingDto(string Value,string Reason);
public record ReplyDto(string Reply,string Status);
public static class AdminEndpoints {
 public static void Map(WebApplication app){var g=app.MapGroup("/api/v1/admin").RequireAuthorization("Admin");
  g.AddEndpointFilter(async(ctx,next)=>{if(!HttpMethods.IsGet(ctx.HttpContext.Request.Method)){if(!long.TryParse(ctx.HttpContext.User.FindFirstValue("auth_time"),out var at)||DateTimeOffset.UtcNow.ToUnixTimeSeconds()-at>300)throw new DomainError("STEP_UP_REQUIRED_LOGIN_AGAIN",403);}return await next(ctx);});
  g.MapGet("/users",async(Database d)=>await d.Users.Take(100).Select(x=>new{x.Id,x.Name,x.Email,x.Blocked,x.TwoFactorEnabled}).ToListAsync());
  g.MapPost("/users/{id:guid}/block",async(Guid id,BlockDto r,HttpContext h,Database d,UserManager<User> users)=>{if(r.Reason.Length<5)throw new DomainError("REASON_REQUIRED");var u=await users.FindByIdAsync(id.ToString())??throw new DomainError("NOT_FOUND",404);u.Blocked=r.Blocked;await users.UpdateSecurityStampAsync(u);Api.Audit(d,Api.User(h),"USER_BLOCK",id.ToString(),r.Reason);await d.SaveChangesAsync();return Results.Ok();});
  g.MapGet("/jobs",async(Database d)=>await d.Jobs.OrderByDescending(x=>x.CreatedAt).Take(100).Select(x=>new{x.Id,x.ProjectId,x.Stage,x.State,x.Attempts,x.Error}).ToListAsync());
  g.MapGet("/purchases",async(Database d)=>await d.Purchases.OrderByDescending(x=>x.CreatedAt).Take(100).ToListAsync());
  g.MapGet("/audit",async(Database d)=>await d.Audit.OrderByDescending(x=>x.At).Take(100).ToListAsync());
  g.MapGet("/tickets",async(Database d)=>await d.Tickets.OrderByDescending(x=>x.CreatedAt).Take(100).ToListAsync());
  g.MapPost("/tickets/{id:guid}/reply",async(Guid id,ReplyDto r,HttpContext h,Database d)=>{var t=await d.Tickets.FindAsync(id)??throw new DomainError("NOT_FOUND",404);if(!new[]{"IN_REVIEW","ANSWERED","RESOLVED"}.Contains(r.Status))throw new DomainError("INVALID_STATUS");t.Reply=r.Reply;t.Status=r.Status;Api.Audit(d,Api.User(h),"TICKET_REPLY",id.ToString(),"Resposta registrada");await d.SaveChangesAsync();return Results.Ok();});
  g.MapPost("/credits/adjust",async(AdjustDto r,HttpContext h,Database d,WalletService w)=>{
   if(r.Reason.Length<5||r.Credits==0||Math.Abs(r.Credits)>100000)throw new DomainError("INVALID_ADJUSTMENT");await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(r.UserId);var op="admin:"+Api.Key(h);if(await d.Ledger.AnyAsync(x=>x.Operation==op))return Results.Ok();
   if(r.Credits>0)await w.Grant(r.UserId,"PROMOTION",r.Credits,op);else{var wallet=await d.Wallets.SingleAsync(x=>x.Id==r.UserId);long left=-r.Credits;if(wallet.Available<left)throw new DomainError("INSUFFICIENT_CREDITS",409);foreach(var lot in await d.Lots.Where(x=>x.UserId==r.UserId&&x.Available>0).OrderBy(x=>x.CreatedAt).ToListAsync()){var n=Math.Min(left,lot.Available);if(n==0)break;lot.Available-=n;left-=n;d.Ledger.Add(new Ledger{UserId=r.UserId,LotId=lot.Id,Operation=op,Kind="ADJUST",AvailableDelta=-n,Reason=r.Reason});}wallet.Available+=r.Credits;}
   Api.Audit(d,Api.User(h),"CREDIT_ADJUST",r.UserId.ToString(),r.Reason);await d.SaveChangesAsync();await tx.CommitAsync();return Results.Ok();
  });
  g.MapPost("/credits/refund",async(RefundDto r,HttpContext h,Database d,WalletService w)=>{var run=await d.Runs.FindAsync(r.RunId)??throw new DomainError("NOT_FOUND",404);await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(run.UserId);await d.Entry(run).ReloadAsync();var item=Json.Read<QuoteItem[]>(run.Items).SingleOrDefault(x=>x.Code==r.ItemCode)??throw new DomainError("INVALID_ITEM");await w.Refund(run,item.Code,item.Credits,r.Reason);Api.Audit(d,Api.User(h),"ITEM_REFUND",run.Id.ToString(),r.Reason);await d.SaveChangesAsync();await tx.CommitAsync();return Results.Ok();});
  g.MapGet("/settings",async(Database d)=>await d.Settings.ToListAsync());
  g.MapPut("/settings/{key}",async(string key,SettingDto r,HttpContext h,Database d)=>{var allowed=new[]{"maxBytes","maxDurationMs","maxClips","tier180Approved","longVideoPricingApproved","packagesApproved","price.zoom","price.blur","price.dynamic_captions","price.tracking","price.cover"};if(!allowed.Contains(key)||r.Reason.Length<5)throw new DomainError("INVALID_SETTING");if(key.EndsWith("Approved")){if(!bool.TryParse(r.Value,out _))throw new DomainError("INVALID_SETTING");}else if(!long.TryParse(r.Value,out var n)||n<=0)throw new DomainError("INVALID_SETTING");var s=await d.Settings.FindAsync(key);if(s==null)d.Settings.Add(new Setting{Key=key,Value=r.Value});else s.Value=r.Value;Api.Audit(d,Api.User(h),"SETTING_CHANGE",key,r.Reason);await d.SaveChangesAsync();return Results.Ok();});
 }
}
