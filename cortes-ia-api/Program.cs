using Cortes;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using System.Security.Claims;
using System.Text.Json.Serialization;
var b=WebApplication.CreateBuilder(args);
b.Services.AddDbContext<Database>(o=>o.UseNpgsql(b.Configuration.GetConnectionString("Database")??throw new InvalidOperationException("Database missing")));
b.Services.AddIdentity<User,IdentityRole<Guid>>(o=>{o.User.RequireUniqueEmail=true;o.SignIn.RequireConfirmedEmail=true;o.Password.RequiredLength=12;o.Lockout.MaxFailedAccessAttempts=5;}).AddEntityFrameworkStores<Database>().AddDefaultTokenProviders();
b.Services.ConfigureApplicationCookie(o=>{o.Cookie.Name=b.Environment.IsDevelopment()?"cortes_session":"__Host-cortes_session";o.Cookie.HttpOnly=true;o.Cookie.SameSite=SameSiteMode.Strict;o.Cookie.SecurePolicy=b.Environment.IsDevelopment()?CookieSecurePolicy.SameAsRequest:CookieSecurePolicy.Always;o.ExpireTimeSpan=TimeSpan.FromHours(8);o.Events.OnRedirectToLogin=c=>{c.Response.StatusCode=401;return Task.CompletedTask;};o.Events.OnRedirectToAccessDenied=c=>{c.Response.StatusCode=403;return Task.CompletedTask;};});
b.Services.Configure<SecurityStampValidatorOptions>(o=>{
 o.ValidationInterval=TimeSpan.Zero;
 o.OnRefreshingPrincipal=context=>{if(context.NewPrincipal.Identity is ClaimsIdentity identity)
  foreach(var claim in context.CurrentPrincipal.Claims.Where(x=>x.Type is "amr" or "auth_time"))identity.AddClaim(claim);
  return Task.CompletedTask;};
});
b.Services.AddAntiforgery(o=>o.HeaderName="X-CSRF-Token");
b.Services.AddAuthorization(o=>{
 o.AddPolicy("Staff",p=>p.RequireRole(StaffRoles.All).RequireClaim("amr","mfa"));
 o.AddPolicy("UserRead",p=>p.RequireRole(StaffRoles.UserRead).RequireClaim("amr","mfa"));
 o.AddPolicy("Support",p=>p.RequireRole(StaffRoles.SupportAccess).RequireClaim("amr","mfa"));
 o.AddPolicy("Finance",p=>p.RequireRole(StaffRoles.FinanceAccess).RequireClaim("amr","mfa"));
 o.AddPolicy("Security",p=>p.RequireRole(StaffRoles.SecurityAccess).RequireClaim("amr","mfa"));
 o.AddPolicy("Admin",p=>p.RequireRole(StaffRoles.Admin).RequireClaim("amr","mfa"));
});
b.Services.ConfigureHttpJsonOptions(o=>o.SerializerOptions.UnmappedMemberHandling=JsonUnmappedMemberHandling.Disallow);
b.Services.AddRateLimiter(o=>{o.RejectionStatusCode=429;o.GlobalLimiter=PartitionedRateLimiter.Create<HttpContext,string>(h=>RateLimitPartition.GetFixedWindowLimiter(h.User.FindFirstValue(ClaimTypes.NameIdentifier)??h.Connection.RemoteIpAddress?.ToString()??"unknown",_=>new FixedWindowRateLimiterOptions{PermitLimit=120,Window=TimeSpan.FromMinutes(1),QueueLimit=0}));o.AddPolicy("auth",h=>RateLimitPartition.GetFixedWindowLimiter(h.Connection.RemoteIpAddress?.ToString()??"unknown",_=>new FixedWindowRateLimiterOptions{PermitLimit=10,Window=TimeSpan.FromMinutes(1),QueueLimit=0}));});
b.Logging.AddJsonConsole();
b.Services.AddOpenApi();b.Services.AddHttpClient();b.Services.AddScoped<WalletService>();b.Services.AddScoped<Policy>();b.Services.AddScoped<Payments>();b.Services.AddSingleton<Cloud>();b.Services.AddSingleton<Mailer>();b.Services.AddHostedService<Background>();
var app=b.Build();
foreach(var key in new[]{"CPF_HMAC_KEY","WORKER_TOKEN"})if((app.Configuration[key]?.Length??0)<32)throw new InvalidOperationException(key+" must contain at least 32 random characters");
if(!app.Environment.IsDevelopment()){app.UseExceptionHandler(a=>a.Run(async c=>{c.Response.StatusCode=500;await c.Response.WriteAsJsonAsync(new{code="INTERNAL_ERROR",traceId=c.TraceIdentifier});}));app.UseHsts();}
app.Use(async(ctx,next)=>{try{await next();}catch(DomainError e){ctx.Response.StatusCode=e.Status;await ctx.Response.WriteAsJsonAsync(new{code=e.Message,traceId=ctx.TraceIdentifier});}catch(AntiforgeryValidationException){ctx.Response.StatusCode=403;await ctx.Response.WriteAsJsonAsync(new{code="CSRF_INVALID"});}});
app.UseAuthentication();app.UseAuthorization();app.UseRateLimiter();
app.Use(async(ctx,next)=>{
 ctx.Response.Headers["X-Content-Type-Options"]="nosniff";ctx.Response.Headers["Referrer-Policy"]="no-referrer";
 if(ctx.Request.Path.StartsWithSegments("/api")&&!HttpMethods.IsGet(ctx.Request.Method)&&!ctx.Request.Path.StartsWithSegments("/api/v1/webhooks"))await ctx.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(ctx);
 if(ctx.User.Identity?.IsAuthenticated==true){var db=ctx.RequestServices.GetRequiredService<Database>();var id=Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);var u=await db.Users.FindAsync(id);if(u==null||u.Blocked){ctx.Response.StatusCode=403;return;}if(DateTimeOffset.UtcNow-u.LastActive>TimeSpan.FromMinutes(5)){u.LastActive=DateTimeOffset.UtcNow;u.ActivityEpoch++;await db.SaveChangesAsync();}}
 await next();
});
app.MapGet("/health",()=>Results.Ok(new{status="ok"}));
if(app.Environment.IsDevelopment())app.MapOpenApi("/api/openapi/{documentName}.json");else app.MapOpenApi("/api/openapi/{documentName}.json").RequireAuthorization("Admin");
app.MapGet("/api/v1/auth/csrf",(HttpContext h,IAntiforgery a)=>new{token=a.GetAndStoreTokens(h).RequestToken});
AuthEndpoints.Map(app);ProjectEndpoints.Map(app);AdminEndpoints.Map(app);WorkerEndpoints.Map(app);Payments.Map(app);NotificationEndpoints.Map(app);
if(args.Contains("--init-db")){
 using var scope=app.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<Database>();
 // Schema changes are versioned EF migrations. This command is explicit and runs before the API container starts.
 await db.Database.MigrateAsync();
 var roles=scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
 foreach(var role in StaffRoles.All)if(!await roles.RoleExistsAsync(role))await roles.CreateAsync(new IdentityRole<Guid>(role));
 return;
}
if(args.Contains("--make-admin")){
 using var scope=app.Services.CreateScope();var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();
 var email=app.Configuration["ADMIN_EMAIL"]??throw new InvalidOperationException("ADMIN_EMAIL required");var user=await users.FindByEmailAsync(email)??throw new InvalidOperationException("Register and verify account first");
 await users.AddToRoleAsync(user,StaffRoles.Admin);await users.UpdateSecurityStampAsync(user);Console.WriteLine("Admin role assigned. MFA enrollment remains mandatory.");return;
}
if(args.Contains("--grant-role")||args.Contains("--revoke-role")){
 using var scope=app.Services.CreateScope();var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();
 var email=app.Configuration["STAFF_EMAIL"]??throw new InvalidOperationException("STAFF_EMAIL required");
 var role=app.Configuration["STAFF_ROLE"]??throw new InvalidOperationException("STAFF_ROLE required");
 if(!StaffRoles.Valid(role))throw new InvalidOperationException("STAFF_ROLE must be Admin, Support, Finance or Security");
 var user=await users.FindByEmailAsync(email)??throw new InvalidOperationException("Register and verify account first");
 if(args.Contains("--grant-role")){
  if(!await users.IsInRoleAsync(user,role))await users.AddToRoleAsync(user,role);
  await users.UpdateSecurityStampAsync(user);Console.WriteLine(role+" role assigned. MFA enrollment remains mandatory.");
 }else{
  if(await users.IsInRoleAsync(user,role))await users.RemoveFromRoleAsync(user,role);
  await users.UpdateSecurityStampAsync(user);Console.WriteLine(role+" role revoked.");
 }
 return;
}
app.Run();
public partial class Program {}
