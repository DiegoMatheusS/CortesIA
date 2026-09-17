using Microsoft.EntityFrameworkCore;
namespace Cortes;
// All writes require the caller's transaction and wallet lock. No distributed cache lock.
public class WalletService(Database db) {
 public async Task Grant(Guid user,string kind,long amount,string op,Guid? purchase=null) {
  if(amount<=0)return;
  if(await db.Ledger.AnyAsync(x=>x.Operation==op))return;
  var wallet=await db.Wallets.SingleAsync(x=>x.Id==user);
  var lot=new CreditLot{UserId=user,Kind=kind,Available=amount,PurchaseId=purchase};db.Lots.Add(lot);
  wallet.Available+=amount;
  db.Ledger.Add(new Ledger{UserId=user,LotId=lot.Id,Kind="GRANT",Operation=op,AvailableDelta=amount,Reason=kind});
 }
 public async Task Reserve(Run run) {
  var w=await db.Wallets.SingleAsync(x=>x.Id==run.UserId);
  var now=DateTimeOffset.UtcNow;
  var lots=await db.Lots.Where(x=>x.UserId==run.UserId&&x.Available>0&&(x.ExpiresAt==null||x.ExpiresAt>now)).OrderBy(x=>x.ExpiresAt==null).ThenBy(x=>x.ExpiresAt).ThenBy(x=>x.CreatedAt).ThenBy(x=>x.Id).ToListAsync();
  lots=lots.Where(x=>run.Modality=="trial"?x.Kind=="TRIAL":x.Kind is "PURCHASED" or "PURCHASE_BONUS").ToList();
  if(lots.Sum(x=>x.Available)<run.Total)throw new DomainError("INSUFFICIENT_CREDITS",409);
  long remaining=run.Total;
  foreach(var lot in lots) {
   var n=Math.Min(remaining,lot.Available);if(n==0)break;
   lot.Available-=n;lot.Reserved+=n;remaining-=n;
   db.Reservations.Add(new ReservationLine{RunId=run.Id,LotId=lot.Id,Credits=n});
   db.Ledger.Add(new Ledger{UserId=run.UserId,LotId=lot.Id,RunId=run.Id,Kind="RESERVE",Operation=$"reserve:{run.Id}",AvailableDelta=-n,ReservedDelta=n,Reason="Cotação confirmada"});
  }w.Available-=run.Total;w.Reserved+=run.Total;
 }
 public async Task Capture(Run run) {
  if(run.FinancialState!="RESERVED")return;
  var w=await db.Wallets.SingleAsync(x=>x.Id==run.UserId);
  foreach(var line in await db.Reservations.Where(x=>x.RunId==run.Id).ToListAsync()) {
   var lot=await db.Lots.SingleAsync(x=>x.Id==line.LotId);lot.Reserved-=line.Credits;
   db.Ledger.Add(new Ledger{UserId=run.UserId,LotId=lot.Id,RunId=run.Id,Kind="CAPTURE",Operation=$"capture:{run.Id}",ReservedDelta=-line.Credits,Reason="Previews úteis entregues"});
  }w.Reserved-=run.Total;run.FinancialState="CAPTURED";
 }
 public async Task Refund(Run run,string code,long requested,string reason) {
  var operation=$"refund:{run.Id}:{code}";
  if(await db.Ledger.AnyAsync(x=>x.Operation==operation)||run.FinancialState=="RELEASED")return;
  if(requested<=0||requested>run.Total-run.Refunded)throw new DomainError("REFUND_LIMIT",409);
  bool release=run.FinancialState=="RESERVED";
  if(release&&requested!=run.Total)throw new DomainError("PARTIAL_RELEASE_NOT_ALLOWED",409);
  var w=await db.Wallets.SingleAsync(x=>x.Id==run.UserId);long remaining=requested;
  foreach(var line in await db.Reservations.Where(x=>x.RunId==run.Id).OrderBy(x=>x.Id).ToListAsync()) {
   var n=Math.Min(remaining,line.Credits-line.Refunded);if(n<=0)continue;
   var lot=await db.Lots.SingleAsync(x=>x.Id==line.LotId);
   lot.Available+=n;line.Refunded+=n;remaining-=n;
   if(release)lot.Reserved-=n;
   db.Ledger.Add(new Ledger{UserId=run.UserId,LotId=lot.Id,RunId=run.Id,ItemCode=code,Kind=release?"RELEASE":"REFUND",Operation=operation,AvailableDelta=n,ReservedDelta=release?-n:0,Reason=reason});
  }
  if(remaining!=0)throw new InvalidOperationException("Reservation reconciliation failed");
  w.Available+=requested;if(release)w.Reserved-=requested;
  run.Refunded+=requested;if(release)run.FinancialState="RELEASED";
 }
}
