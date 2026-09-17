using Xunit;
using Cortes;
using Microsoft.EntityFrameworkCore;
[CollectionDefinition("Database",DisableParallelization=true)] public class DbCollection {}
[Collection("Database")]
public class WalletIntegration {
 Database Open(){var connection=Environment.GetEnvironmentVariable("TEST_DATABASE_URL")??throw new InvalidOperationException("TEST_DATABASE_URL required, isolated test DB");if(!connection.Contains("Database=cortes_test",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Only cortes_test database permitted");return new Database(new DbContextOptionsBuilder<Database>().UseNpgsql(connection).Options);}
 [Fact] public async Task ReserveCaptureAndPartialRefundAreConserved(){
  await using var db=Open();await db.Database.EnsureCreatedAsync();var uid=Guid.NewGuid();db.Users.Add(new User{Id=uid,UserName=uid.ToString(),Email=uid+"@test.invalid",NormalizedUserName=uid.ToString()});db.Wallets.Add(new Wallet{Id=uid});await db.SaveChangesAsync();
  var service=new WalletService(db);await using(var tx=await db.Database.BeginTransactionAsync()){await db.LockWallet(uid);await service.Grant(uid,"PURCHASED",20,"seed:"+uid);await db.SaveChangesAsync();await tx.CommitAsync();}
  var project=new Project{UserId=uid};db.Projects.Add(project);var quote=new Quote{UserId=uid,ProjectId=project.Id,Total=12};db.Quotes.Add(quote);var run=new Run{UserId=uid,ProjectId=project.Id,QuoteId=quote.Id,Total=12,Modality="paid"};db.Runs.Add(run);await db.SaveChangesAsync();
  await using(var tx=await db.Database.BeginTransactionAsync()){await db.LockWallet(uid);await service.Reserve(run);await db.SaveChangesAsync();await tx.CommitAsync();}
  await using(var tx=await db.Database.BeginTransactionAsync()){await db.LockWallet(uid);await service.Capture(run);await service.Refund(run,"zoom",2,"Extra falhou");await db.SaveChangesAsync();await tx.CommitAsync();}
  await using(var tx=await db.Database.BeginTransactionAsync()){await db.LockWallet(uid);await service.Refund(run,"zoom",2,"Evento repetido");await db.SaveChangesAsync();await tx.CommitAsync();}
  var w=await db.Wallets.FindAsync(uid);Assert.Equal(10,w!.Available);Assert.Equal(0,w.Reserved);Assert.Equal(2,run.Refunded);
  Assert.All(await db.Lots.Where(x=>x.UserId==uid).ToListAsync(),lot=>Assert.Null(lot.ExpiresAt));
 }
}
