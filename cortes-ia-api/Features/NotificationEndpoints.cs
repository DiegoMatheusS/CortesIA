using Microsoft.EntityFrameworkCore;

namespace Cortes;

public record NotificationPreferencesDto(bool ProcessingEmail=true,bool SupportEmail=true,bool LowBalanceEmail=false,bool MarketingEmail=false);

public static class NotificationEndpoints {
 public static async Task Queue(
  Database d,
  Guid userId,
  string dedupe,
  string eventCode,
  string category,
  string subject,
  string body,
  string emailPolicy="DEFAULT_ON",
  bool inApp=true)
 {
  if(await d.Notifications.AnyAsync(x=>x.Dedupe==dedupe))return;
  d.Notifications.Add(new Notification{
   UserId=userId,Dedupe=dedupe,Event=eventCode,Category=category,Subject=subject,Body=body,
   EmailPolicy=emailPolicy,EmailStatus=emailPolicy=="IN_APP_ONLY"?"SKIPPED":"PENDING",InApp=inApp
  });
 }

 public static bool WantsEmail(Notification n,NotificationPreference? p)=>n.EmailPolicy switch{
  "REQUIRED"=>true,
  "IN_APP_ONLY"=>false,
  "OPTIONAL_OFF"=>n.Category switch{
   "LOW_BALANCE"=>p?.LowBalanceEmail??false,
   "MARKETING"=>p?.MarketingEmail??false,
   _=>false
  },
  _=>n.Category switch{
   "PROCESSING"=>p?.ProcessingEmail??true,
   "SUPPORT"=>p?.SupportEmail??true,
   "LOW_BALANCE"=>p?.LowBalanceEmail??false,
   "MARKETING"=>p?.MarketingEmail??false,
   _=>true
  }
 };

 public static void Map(WebApplication app){
  var g=app.MapGroup("/api/v1").RequireAuthorization();

  g.MapGet("/notifications",async(HttpContext h,Database d,bool unreadOnly=false)=>{
   var uid=Api.User(h);
   var query=d.Notifications.AsNoTracking().Where(x=>x.UserId==uid&&x.InApp);
   if(unreadOnly)query=query.Where(x=>x.ReadAt==null);
   var items=await query.OrderByDescending(x=>x.CreatedAt).Take(100).Select(x=>new{
    x.Id,x.Event,x.Category,x.Subject,x.Body,x.CreatedAt,x.ReadAt
   }).ToListAsync();
   var unread=await d.Notifications.CountAsync(x=>x.UserId==uid&&x.InApp&&x.ReadAt==null);
   return Results.Ok(new{unread,items});
  });

  g.MapPost("/notifications/{id:guid}/read",async(Guid id,HttpContext h,Database d)=>{
   var uid=Api.User(h);
   var n=await d.Notifications.SingleOrDefaultAsync(x=>x.Id==id&&x.UserId==uid&&x.InApp)??throw new DomainError("NOT_FOUND",404);
   n.ReadAt??=DateTimeOffset.UtcNow;await d.SaveChangesAsync();return Results.Ok();
  });

  g.MapPost("/notifications/read-all",async(HttpContext h,Database d)=>{
   var uid=Api.User(h);var now=DateTimeOffset.UtcNow;
   foreach(var n in await d.Notifications.Where(x=>x.UserId==uid&&x.InApp&&x.ReadAt==null).Take(500).ToListAsync())n.ReadAt=now;
   await d.SaveChangesAsync();return Results.Ok();
  });

  g.MapGet("/notification-preferences",async(HttpContext h,Database d)=>{
   var uid=Api.User(h);var p=await d.NotificationPreferences.FindAsync(uid);
   return Results.Ok(new{
    processing=p?.ProcessingEmail??true,
    support=p?.SupportEmail??true,
    lowBalance=p?.LowBalanceEmail??false,
    marketing=p?.MarketingEmail??false,
    securityRequired=true,paymentsRequired=true,storageRequired=true
   });
  });

  g.MapPut("/notification-preferences",async(NotificationPreferencesDto r,HttpContext h,Database d)=>{
   var uid=Api.User(h);var p=await d.NotificationPreferences.FindAsync(uid);
   if(p==null){p=new NotificationPreference{UserId=uid};d.NotificationPreferences.Add(p);}
   p.ProcessingEmail=r.ProcessingEmail;p.SupportEmail=r.SupportEmail;p.LowBalanceEmail=r.LowBalanceEmail;p.MarketingEmail=r.MarketingEmail;
   await d.SaveChangesAsync();return Results.Ok();
  });
 }
}
