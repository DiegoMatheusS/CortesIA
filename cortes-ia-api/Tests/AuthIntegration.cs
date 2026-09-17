using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Cortes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

// Real Identity, cookies, CSRF and PostgreSQL; only background external I/O is disabled.
public sealed class AuthFactory : WebApplicationFactory<Program> {
 protected override void ConfigureWebHost(IWebHostBuilder builder) {
  var connection=Environment.GetEnvironmentVariable("TEST_DATABASE_URL")??throw new InvalidOperationException("TEST_DATABASE_URL required");
  if(new Npgsql.NpgsqlConnectionStringBuilder(connection).Database!="cortes_test")throw new InvalidOperationException("Only cortes_test database permitted");
  builder.UseEnvironment("Production");
  builder.UseContentRoot(Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../")));
  builder.UseSetting("ConnectionStrings:Database",connection);
  builder.UseSetting("CPF_HMAC_KEY",new string('h',64));
  builder.UseSetting("WORKER_TOKEN",new string('w',64));
  builder.ConfigureServices(services=>{
   foreach(var entry in services.Where(x=>x.ImplementationType==typeof(Background)).ToArray())services.Remove(entry);
  });
 }
 public async Task<HttpClient> Open() {
  var client=CreateClient(new WebApplicationFactoryClientOptions{BaseAddress=new Uri("https://localhost"),AllowAutoRedirect=false});
  using var scope=Services.CreateScope();
  await scope.ServiceProvider.GetRequiredService<Database>().Database.EnsureCreatedAsync();
  return client;
 }
}
[Collection("Database")]
public class AuthIntegration {
 static async Task<HttpResponseMessage> Post(HttpClient client,string path,object body) {
  var token=await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/csrf");
  using var request=new HttpRequestMessage(HttpMethod.Post,path){Content=JsonContent.Create(body)};
  request.Headers.Add("X-CSRF-Token",token.GetProperty("token").GetString());
  return await client.SendAsync(request);
 }
 [Fact] public async Task RegistrationVerificationLoginAndLogout() {
  await using var app=new AuthFactory();using var client=await app.Open();
  var email=$"{Guid.NewGuid():N}@test.invalid";var password="Test-Password-123!";
  var registration=new{Name="Teste HTTP",Email=email,Phone="11999999999",Cpf="52998224725",Password=password,TermsAccepted=true};
  Assert.Equal(HttpStatusCode.Accepted,(await Post(client,"/api/v1/auth/register",registration)).StatusCode);
  Assert.Equal(HttpStatusCode.Unauthorized,(await Post(client,"/api/v1/auth/login",new{Email=email,Password=password})).StatusCode);
  string token;
  using(var scope=app.Services.CreateScope()) {
   var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();var user=await users.FindByEmailAsync(email);
   Assert.NotNull(user);token=await users.GenerateEmailConfirmationTokenAsync(user);
   Assert.NotNull(await scope.ServiceProvider.GetRequiredService<Database>().Wallets.FindAsync(user.Id));
  }
  Assert.Equal(HttpStatusCode.OK,(await Post(client,"/api/v1/auth/verify",new{Email=email,Token=token})).StatusCode);
  var login=await Post(client,"/api/v1/auth/login",new{Email=email,Password=password});
  Assert.Equal(HttpStatusCode.OK,login.StatusCode);
  Assert.Contains(login.Headers.GetValues("Set-Cookie"),c=>c.Contains("__Host-cortes_session")&&c.Contains("httponly",StringComparison.OrdinalIgnoreCase)&&c.Contains("secure",StringComparison.OrdinalIgnoreCase));
  Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/v1/me")).StatusCode);
  Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync("/api/v1/admin/users")).StatusCode);
  Assert.Equal(HttpStatusCode.NoContent,(await Post(client,"/api/v1/auth/logout",new{})).StatusCode);
  Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/v1/me")).StatusCode);
 }
 [Fact] public async Task InvalidRequestsKeepDomainStatusInProductionAndRequireCsrf() {
  await using var app=new AuthFactory();using var client=await app.Open();
  Assert.Equal(HttpStatusCode.Forbidden,(await client.PostAsJsonAsync("/api/v1/auth/login",new{Email="nobody@test.invalid",Password="invalid"})).StatusCode);
  var invalid=await Post(client,"/api/v1/auth/register",new{Name=(string?)null,Email="nobody@test.invalid",Phone="11999999999",Cpf="52998224725",Password="Test-Password-123!",TermsAccepted=true});
  Assert.Equal(HttpStatusCode.BadRequest,invalid.StatusCode);
  Assert.Equal("INVALID_REGISTRATION",(await invalid.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
  Assert.Equal(HttpStatusCode.Unauthorized,(await Post(client,"/api/v1/auth/login",new{Email="nobody@test.invalid",Password="invalid"})).StatusCode);
 }
 [Fact] public async Task AdminRequiresMfaAndBlockedUserLosesSession() {
  await using var app=new AuthFactory();using var client=await app.Open();
  var email=$"{Guid.NewGuid():N}@test.invalid";var password="Test-Password-123!";
  using(var scope=app.Services.CreateScope()) {
   var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();
   var roles=scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
   if(!await roles.RoleExistsAsync("Admin"))Assert.True((await roles.CreateAsync(new IdentityRole<Guid>("Admin"))).Succeeded);
   var user=new User{Id=Guid.NewGuid(),UserName=email,Email=email,EmailConfirmed=true};
   Assert.True((await users.CreateAsync(user,password)).Succeeded);
   Assert.True((await users.AddToRoleAsync(user,"Admin")).Succeeded);
  }
  Assert.Equal(HttpStatusCode.OK,(await Post(client,"/api/v1/auth/login",new{Email=email,Password=password})).StatusCode);
  Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync("/api/v1/admin/users")).StatusCode);
  using(var scope=app.Services.CreateScope()) {
   var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();var user=(await users.FindByEmailAsync(email))!;
   user.Blocked=true;Assert.True((await users.UpdateAsync(user)).Succeeded);
  }
  Assert.Equal(HttpStatusCode.Forbidden,(await client.GetAsync("/api/v1/me")).StatusCode);
 }
 [Fact] public async Task PasswordResetRevokesSessionsAndTokenCannotBeReused() {
  await using var app=new AuthFactory();using var client=await app.Open();using var recovery=await app.Open();
  var email=$"{Guid.NewGuid():N}@test.invalid";const string oldPassword="Test-Password-123!",newPassword="Changed-Password-456!";
  using(var scope=app.Services.CreateScope()) {
   var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();
   Assert.True((await users.CreateAsync(new User{Id=Guid.NewGuid(),UserName=email,Email=email,EmailConfirmed=true},oldPassword)).Succeeded);
  }
  Assert.Equal(HttpStatusCode.OK,(await Post(client,"/api/v1/auth/login",new{Email=email,Password=oldPassword})).StatusCode);
  Assert.Equal(HttpStatusCode.Accepted,(await Post(recovery,"/api/v1/auth/forgot",new{Email=email})).StatusCode);
  string token;
  using(var scope=app.Services.CreateScope()) {
   var db=scope.ServiceProvider.GetRequiredService<Database>();var user=await db.Users.SingleAsync(u=>u.Email==email);
   var message=await db.Notifications.SingleAsync(n=>n.UserId==user.Id&&n.Dedupe.StartsWith("reset:"));
   token=Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(new Uri(message.Body).Query)["token"].ToString();
  }
  var reset=new{Email=email,Token=token,Password=newPassword};
  Assert.Equal(HttpStatusCode.OK,(await Post(recovery,"/api/v1/auth/reset",reset)).StatusCode);
  Assert.Equal(HttpStatusCode.Unauthorized,(await client.GetAsync("/api/v1/me")).StatusCode);
  Assert.Equal(HttpStatusCode.BadRequest,(await Post(recovery,"/api/v1/auth/reset",reset)).StatusCode);
  Assert.Equal(HttpStatusCode.Unauthorized,(await Post(recovery,"/api/v1/auth/login",new{Email=email,Password=oldPassword})).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await Post(recovery,"/api/v1/auth/login",new{Email=email,Password=newPassword})).StatusCode);
 }
 [Fact] public async Task SuccessfulMfaClearsFailuresAndAdminClaimsSurviveRefresh() {
  await using var app=new AuthFactory();using var client=await app.Open();
  var email=$"{Guid.NewGuid():N}@test.invalid";const string password="Test-Password-123!";
  // RFC 6238 test secret; never used outside this isolated test account.
  const string secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  using(var scope=app.Services.CreateScope()) {
   var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();
   var roles=scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
   if(!await roles.RoleExistsAsync("Admin"))Assert.True((await roles.CreateAsync(new IdentityRole<Guid>("Admin"))).Succeeded);
   var user=new User{Id=Guid.NewGuid(),UserName=email,Email=email,EmailConfirmed=true};
   Assert.True((await users.CreateAsync(user,password)).Succeeded);
   Assert.True((await users.AddToRoleAsync(user,"Admin")).Succeeded);
   Assert.True((await users.SetAuthenticationTokenAsync(user,"[AspNetUserStore]","AuthenticatorKey",secret)).Succeeded);
   Assert.True((await users.SetTwoFactorEnabledAsync(user,true)).Succeeded);
  }
  Assert.Equal(HttpStatusCode.Unauthorized,(await Post(client,"/api/v1/auth/login",new{Email=email,Password=password,MfaCode="invalid"})).StatusCode);
  using(var scope=app.Services.CreateScope()) {
   var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();Assert.Equal(1,await users.GetAccessFailedCountAsync((await users.FindByEmailAsync(email))!));
  }
  // Independent RFC 6238 computation using the ASCII secret encoded above.
  var counter=new byte[8];System.Buffers.Binary.BinaryPrimitives.WriteInt64BigEndian(counter,DateTimeOffset.UtcNow.ToUnixTimeSeconds()/30);
  var hash=System.Security.Cryptography.HMACSHA1.HashData(System.Text.Encoding.ASCII.GetBytes("12345678901234567890"),counter);
  int offset=hash[^1]&15;var code=((System.Buffers.Binary.BinaryPrimitives.ReadInt32BigEndian(hash.AsSpan(offset,4))&0x7fffffff)%1_000_000).ToString("D6");
  Assert.Equal(HttpStatusCode.OK,(await Post(client,"/api/v1/auth/login",new{Email=email,Password=password,MfaCode=code})).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/v1/admin/users")).StatusCode);
  Assert.Equal(HttpStatusCode.OK,(await client.GetAsync("/api/v1/admin/users")).StatusCode);
  using(var scope=app.Services.CreateScope()) {
   var users=scope.ServiceProvider.GetRequiredService<UserManager<User>>();Assert.Equal(0,await users.GetAccessFailedCountAsync((await users.FindByEmailAsync(email))!));
  }
 }
}
