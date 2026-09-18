using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
namespace Cortes;
public static class Api {
 public static Guid User(HttpContext h)=>Guid.Parse(h.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
 public static string Key(HttpContext h){var s=h.Request.Headers["Idempotency-Key"].ToString();if(s.Length is <16 or >128)throw new DomainError("IDEMPOTENCY_KEY_REQUIRED");return s;}
 public static string Hash<T>(T value)=>Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(Json.Write(value))));
 public static async Task<Project> Own(Database d,HttpContext h,Guid id)=>await d.Projects.SingleOrDefaultAsync(x=>x.Id==id&&x.UserId==User(h)&&x.DeletedAt==null)??throw new DomainError("NOT_FOUND",404);
 public static void Version(HttpContext h,int v){if(h.Request.Headers.IfMatch.ToString()!=v.ToString())throw new DomainError("REVISION_CONFLICT",412);}
 public static void Audit(Database d,Guid? actor,string action,string target,string reason)=>d.Audit.Add(new Audit{Actor=actor,Action=action,Target=target,Reason=reason});
 public static Job Enqueue(Database d,Project p,string stage,Guid? run,object payload){var job=new Job{ProjectId=p.Id,Generation=p.Generation,Stage=stage,RunId=run,Payload=Json.Write(payload)};d.Jobs.Add(job);d.Outbox.Add(new Outbox{JobId=job.Id});return job;}
}
public record RegisterDto(string Name,string Email,string Phone,string Cpf,string Password,bool TermsAccepted);
public record LoginDto(string Email,string Password,string? MfaCode);
public record TokenDto(string Email,string Token,string? Password);
public record EmailDto(string Email);
public record MfaDto(string Code);
public static class AuthEndpoints {
 public static void Map(WebApplication app){
  app.MapPost("/api/v1/auth/register",async(RegisterDto r,Database db,UserManager<User> users,WalletService wallet,IConfiguration c)=>{
   if(!r.TermsAccepted||string.IsNullOrWhiteSpace(r.Name)||r.Name.Length is <2 or >120||string.IsNullOrWhiteSpace(r.Phone)||r.Phone.Length is <8 or >20||string.IsNullOrWhiteSpace(r.Email)||string.IsNullOrWhiteSpace(r.Password)||string.IsNullOrWhiteSpace(r.Cpf))throw new DomainError("INVALID_REGISTRATION");
   var cpf=Cpf.Normalize(r.Cpf);var digest=Cpf.Digest(cpf,c["CPF_HMAC_KEY"]!);
   await using var tx=await db.Database.BeginTransactionAsync();
   // Transaction-level advisory lock serializes different registrations for the same CPF.
   await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({digest},0))");
   if(await users.FindByEmailAsync(r.Email)!=null)return Results.Accepted();
   var u=new User{Id=Guid.NewGuid(),UserName=r.Email,Email=r.Email,Name=r.Name,PhoneNumber=r.Phone,CpfLastTwo=cpf[^2..]};
   var result=await users.CreateAsync(u,r.Password);if(!result.Succeeded)throw new DomainError("INVALID_REGISTRATION");
   db.Wallets.Add(new Wallet{Id=u.Id});await db.SaveChangesAsync();
   if(!await db.TrialClaims.AnyAsync(x=>x.CpfHmac==digest)){db.TrialClaims.Add(new TrialClaim{CpfHmac=digest,UserId=u.Id});await wallet.Grant(u.Id,"TRIAL",10,"trial:"+digest);}
   var token=await users.GenerateEmailConfirmationTokenAsync(u);
   var url=(c["PUBLIC_URL"]??"http://localhost:3000")+"/verify?email="+Uri.EscapeDataString(r.Email)+"&token="+Uri.EscapeDataString(token);
   await NotificationEndpoints.Queue(db,u.Id,"verify:"+u.Id,"EMAIL_CONFIRMATION","SECURITY","Confirme seu e-mail",url,"REQUIRED",false);
   await db.SaveChangesAsync();await tx.CommitAsync();return Results.Accepted();
  }).RequireRateLimiting("auth");
  app.MapPost("/api/v1/auth/verify",async(TokenDto r,UserManager<User> users,Database db)=>{var u=await users.FindByEmailAsync(r.Email);if(u==null||!(await users.ConfirmEmailAsync(u,r.Token)).Succeeded)throw new DomainError("INVALID_TOKEN");await NotificationEndpoints.Queue(db,u.Id,"welcome:"+u.Id,"ACCOUNT_READY","SECURITY","Sua conta SliceFlow está pronta","E-mail confirmado. Sua conta está ativa e você já pode criar seus cortes.","REQUIRED");await db.SaveChangesAsync();return Results.Ok();}).RequireRateLimiting("auth");
  app.MapPost("/api/v1/auth/login",async(LoginDto r,UserManager<User> users,SignInManager<User> sign,HttpContext h)=>{
   var u=await users.FindByEmailAsync(r.Email);if(u==null||u.Blocked)throw new DomainError("INVALID_LOGIN",401);
   var check=await sign.CheckPasswordSignInAsync(u,r.Password,true);if(!check.Succeeded)throw new DomainError("INVALID_LOGIN",401);
   if(u.TwoFactorEnabled){if(string.IsNullOrEmpty(r.MfaCode)||!await users.VerifyTwoFactorTokenAsync(u,TokenOptions.DefaultAuthenticatorProvider,r.MfaCode)){await users.AccessFailedAsync(u);throw new DomainError("MFA_REQUIRED",401);}
    await sign.SignInWithClaimsAsync(u,false,[new Claim("amr","mfa"),new Claim("auth_time",DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString())]);
   }else await sign.SignInWithClaimsAsync(u,false,[new Claim("auth_time",DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString())]);
   u.LastActive=DateTimeOffset.UtcNow;u.ActivityEpoch++;await users.UpdateAsync(u);return Results.Ok(new{mfaEnrollmentRequired=await users.IsInRoleAsync(u,"Admin")&&!u.TwoFactorEnabled});
  }).RequireRateLimiting("auth");
  app.MapPost("/api/v1/auth/logout",async(SignInManager<User> s)=>{await s.SignOutAsync();return Results.NoContent();}).RequireAuthorization();
  app.MapPost("/api/v1/auth/forgot",async(EmailDto r,UserManager<User> users,Database db,IConfiguration c)=>{
   var u=await users.FindByEmailAsync(r.Email);if(u!=null){var token=await users.GeneratePasswordResetTokenAsync(u);var url=(c["PUBLIC_URL"]??"http://localhost:3000")+"/reset?email="+Uri.EscapeDataString(r.Email)+"&token="+Uri.EscapeDataString(token);await NotificationEndpoints.Queue(db,u.Id,"reset:"+Guid.NewGuid(),"PASSWORD_RESET_REQUESTED","SECURITY","Redefinir senha",url,"REQUIRED",false);await db.SaveChangesAsync();}return Results.Accepted();
  }).RequireRateLimiting("auth");
  app.MapPost("/api/v1/auth/reset",async(TokenDto r,UserManager<User> users,Database db)=>{var u=await users.FindByEmailAsync(r.Email);if(u==null||string.IsNullOrEmpty(r.Password)||!(await users.ResetPasswordAsync(u,r.Token,r.Password)).Succeeded)throw new DomainError("INVALID_TOKEN");await users.UpdateSecurityStampAsync(u);await NotificationEndpoints.Queue(db,u.Id,"password-changed:"+Guid.NewGuid(),"PASSWORD_CHANGED","SECURITY","Sua senha foi alterada","A senha da sua conta SliceFlow foi alterada. Se não foi você, procure o suporte imediatamente.","REQUIRED");await db.SaveChangesAsync();return Results.Ok();}).RequireRateLimiting("auth");
  app.MapPost("/api/v1/auth/mfa/enroll",async(HttpContext h,UserManager<User> users)=>{var u=(await users.FindByIdAsync(Api.User(h).ToString()))!;if(u.TwoFactorEnabled)throw new DomainError("MFA_ALREADY_ENABLED",409);var recent=long.TryParse(h.User.FindFirstValue("auth_time"),out var at)&&DateTimeOffset.UtcNow.ToUnixTimeSeconds()-at<300;if(!recent)throw new DomainError("STEP_UP_REQUIRED",403);await users.ResetAuthenticatorKeyAsync(u);var key=await users.GetAuthenticatorKeyAsync(u);return Results.Ok(new{key,uri=$"otpauth://totp/SliceFlow:{Uri.EscapeDataString(u.Email!)}?secret={key}&issuer=SliceFlow"});}).RequireAuthorization();
  app.MapPost("/api/v1/auth/mfa/confirm",async(MfaDto r,HttpContext h,UserManager<User> users)=>{var u=(await users.FindByIdAsync(Api.User(h).ToString()))!;if(!await users.VerifyTwoFactorTokenAsync(u,TokenOptions.DefaultAuthenticatorProvider,r.Code))throw new DomainError("INVALID_MFA");await users.SetTwoFactorEnabledAsync(u,true);await users.UpdateSecurityStampAsync(u);return Results.Ok(new{loginAgain=true});}).RequireAuthorization().RequireRateLimiting("auth");
  app.MapGet("/api/v1/me",async(HttpContext h,Database d,UserManager<User> users)=>{var u=await users.FindByIdAsync(Api.User(h).ToString());return Results.Ok(new{u!.Id,u.Name,u.Email,cpfMasked="***.***.***-"+u.CpfLastTwo,admin=await users.IsInRoleAsync(u,"Admin"),u.TwoFactorEnabled});}).RequireAuthorization();
 }
}
