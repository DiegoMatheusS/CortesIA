using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Net.Http.Headers;
namespace Cortes;
public record BuyDto(string Package);
public class Payments(Database d,WalletService wallet,IHttpClientFactory clients,IConfiguration cfg,Policy policy){
 static readonly Dictionary<string,(long Credits,long Bonus,long Minor)> Packs=new(){["Start"]=(50,0,1990),["Creator"]=(150,20,4990),["Pro"]=(400,80,9990),["Studio"]=(1000,300,19990),["Agência"]=(2500,1000,39990)};
 HttpClient Client(){var c=clients.CreateClient();c.BaseAddress=new Uri("https://api.mercadopago.com/");c.Timeout=TimeSpan.FromSeconds(20);c.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Bearer",cfg["MP_ACCESS_TOKEN"]);return c;}
 public async Task<Purchase> Create(Guid uid,string name,string key){
  if(!Packs.TryGetValue(name,out var pack))throw new DomainError("INVALID_PACKAGE");
  if(!policy.Development&&!await policy.Enabled("packagesApproved"))throw new DomainError("PACKAGES_NOT_APPROVED",409);
  await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(uid);var hash=Api.Hash(name);
  var old=await d.Idempotency.SingleOrDefaultAsync(x=>x.UserId==uid&&x.Scope=="purchase"&&x.Key==key);if(old!=null){if(old.BodyHash!=hash)throw new DomainError("IDEMPOTENCY_CONFLICT",409);return Json.Read<Purchase>(old.Response);}
  var purchase=new Purchase{UserId=uid,Package=name,Credits=pack.Credits,Bonus=pack.Bonus,AmountMinor=pack.Minor};d.Purchases.Add(purchase);
  if(cfg["PAYMENTS_MODE"]=="sandbox-local"){
   if(!policy.Development)throw new InvalidOperationException("Local payments forbidden outside Development");
  }else{
   using var c=Client();c.DefaultRequestHeaders.Add("X-Idempotency-Key",purchase.Id.ToString());
   var response=await c.PostAsJsonAsync("checkout/preferences",new{external_reference=purchase.Id.ToString(),items=new[]{new{id=name,title="Créditos Cortes IA - "+name,quantity=1,currency_id="BRL",unit_price=purchase.AmountMinor/100m}},notification_url=cfg["MP_WEBHOOK_URL"],back_urls=new{success=cfg["PUBLIC_URL"]+"/app",failure=cfg["PUBLIC_URL"]+"/app",pending=cfg["PUBLIC_URL"]+"/app"}});
   response.EnsureSuccessStatusCode();using var json=JsonDocument.Parse(await response.Content.ReadAsStringAsync());purchase.CheckoutUrl=json.RootElement.GetProperty(cfg["MP_SANDBOX"]=="true"?"sandbox_init_point":"init_point").GetString();
  }
  d.Idempotency.Add(new Idempotency{UserId=uid,Scope="purchase",Key=key,BodyHash=hash,Response=Json.Write(purchase)});await d.SaveChangesAsync();await tx.CommitAsync();return purchase;
 }
 public async Task Grant(Guid id,string providerId){
  var p=await d.Purchases.FindAsync(id)??throw new DomainError("UNKNOWN_PURCHASE",404);await using var tx=await d.Database.BeginTransactionAsync();await d.LockWallet(p.UserId);await d.Entry(p).ReloadAsync();
  if(p.State=="APPROVED")return;if(p.State is "REFUNDED" or "CHARGEBACK")throw new DomainError("PAYMENT_CLOSED",409);
  p.State="APPROVED";p.ProviderId=providerId;await wallet.Grant(p.UserId,"PURCHASED",p.Credits,"purchase:"+p.Id,p.Id);await wallet.Grant(p.UserId,"PURCHASE_BONUS",p.Bonus,"bonus:"+p.Id,p.Id);
  if(!await d.Notifications.AnyAsync(x=>x.Dedupe=="purchase:"+p.Id))d.Notifications.Add(new Notification{UserId=p.UserId,Dedupe="purchase:"+p.Id,Subject="Créditos adicionados",Body=$"{p.Credits+p.Bonus} créditos adicionados. Compra {p.Id}."});await d.SaveChangesAsync();await tx.CommitAsync();
 }
 public async Task ReconcilePending(CancellationToken ct){
  if(cfg["PAYMENTS_MODE"]=="sandbox-local")return;
  foreach(var e in await d.PaymentEvents.Where(x=>x.ProcessedAt==null).Take(10).ToListAsync(ct)){
   using var c=Client();using var response=await c.GetAsync("v1/payments/"+Uri.EscapeDataString(e.PaymentId),ct);response.EnsureSuccessStatusCode();using var json=JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));var x=json.RootElement;
   if(!Guid.TryParse(x.GetProperty("external_reference").GetString(),out var id))throw new DomainError("PAYMENT_REFERENCE_MISMATCH");var p=await d.Purchases.FindAsync([id],ct)??throw new DomainError("UNKNOWN_PURCHASE");
   if(x.GetProperty("currency_id").GetString()!="BRL"||x.GetProperty("transaction_amount").GetDecimal()!=p.AmountMinor/100m||x.GetProperty("collector_id").ToString()!=cfg["MP_COLLECTOR_ID"])throw new DomainError("PAYMENT_VALUE_MISMATCH");
   var status=x.GetProperty("status").GetString();if(status=="approved")await Grant(id,e.PaymentId);
   else if(status is "refunded" or "charged_back"){
    // No silent negative credit balance: freeze access and require audited reconciliation.
    var u=await d.Users.FindAsync([p.UserId],ct);u!.Blocked=true;p.State=status=="refunded"?"REFUNDED":"CHARGEBACK";Api.Audit(d,null,"PAYMENT_REVERSAL_REVIEW",p.Id.ToString(),"Reembolso/chargeback requer conciliação dos lotes consumidos");
   }else if(status is "rejected" or "cancelled")p.State=status.ToUpperInvariant();
   e.ProcessedAt=DateTimeOffset.UtcNow;await d.SaveChangesAsync(ct);
  }
 }
 public static void Map(WebApplication app){
  app.MapGet("/api/v1/packages",()=>Packs.Select(p=>new{name=p.Key,credits=p.Value.Credits,bonus=p.Value.Bonus,amountMinor=p.Value.Minor,status="PROPOSTA_COMERCIAL"})).RequireAuthorization();
  app.MapPost("/api/v1/purchases",async(BuyDto r,HttpContext h,Payments p)=>await p.Create(Api.User(h),r.Package,Api.Key(h))).RequireAuthorization();
  app.MapGet("/api/v1/purchases",async(HttpContext h,Database d)=>await d.Purchases.Where(x=>x.UserId==Api.User(h)).OrderByDescending(x=>x.CreatedAt).Take(100).ToListAsync()).RequireAuthorization();
  if(app.Environment.IsDevelopment()&&app.Configuration["PAYMENTS_MODE"]=="sandbox-local")app.MapPost("/api/v1/dev/purchases/{id:guid}/approve",async(Guid id,HttpContext h,Database d,Payments p)=>{if(!await d.Purchases.AnyAsync(x=>x.Id==id&&x.UserId==Api.User(h)))return Results.NotFound();await p.Grant(id,"local:"+id);return Results.Ok();}).RequireAuthorization();
  app.MapPost("/api/v1/webhooks/mercadopago",async(HttpContext h,Database d,IConfiguration c)=>{
   var secret=c["MP_WEBHOOK_SECRET"];if(string.IsNullOrWhiteSpace(secret))return Results.StatusCode(503);
   var id=h.Request.Query["data.id"].ToString().ToLowerInvariant();var request=h.Request.Headers["x-request-id"].ToString();var parts=h.Request.Headers["x-signature"].ToString().Split(',').Select(x=>x.Trim().Split('=',2)).Where(x=>x.Length==2).GroupBy(x=>x[0]).ToDictionary(x=>x.Key,x=>x.First()[1]);
   if(id.Length==0||request.Length==0||!parts.TryGetValue("ts",out var ts)||!parts.TryGetValue("v1",out var sig)||!long.TryParse(ts,out var timestamp))return Results.Unauthorized();
   var sec=timestamp>10_000_000_000?timestamp/1000:timestamp;if(Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds()-sec)>300)return Results.Unauthorized();
   var expected=Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret),Encoding.UTF8.GetBytes($"id:{id};request-id:{request};ts:{ts};"))).ToLowerInvariant();
   if(!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected),Encoding.UTF8.GetBytes(sig.ToLowerInvariant())))return Results.Unauthorized();
   var key=Api.Hash(new{id,request,ts});if(!await d.PaymentEvents.AnyAsync(x=>x.Id==key)){d.PaymentEvents.Add(new PaymentEvent{Id=key,PaymentId=id});await d.SaveChangesAsync();}return Results.Accepted();
  });
 }
}
