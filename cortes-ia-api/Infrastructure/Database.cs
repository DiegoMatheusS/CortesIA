using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
namespace Cortes;
public class Database(DbContextOptions<Database> options):IdentityDbContext<User,IdentityRole<Guid>,Guid>(options) {
 public DbSet<Wallet> Wallets=>Set<Wallet>(); public DbSet<CreditLot> Lots=>Set<CreditLot>();
 public DbSet<Ledger> Ledger=>Set<Ledger>(); public DbSet<TrialClaim> TrialClaims=>Set<TrialClaim>();
 public DbSet<ReservationLine> Reservations=>Set<ReservationLine>(); public DbSet<Project> Projects=>Set<Project>();
 public DbSet<Quote> Quotes=>Set<Quote>(); public DbSet<Run> Runs=>Set<Run>(); public DbSet<Job> Jobs=>Set<Job>();
 public DbSet<Outbox> Outbox=>Set<Outbox>(); public DbSet<Inbox> Inbox=>Set<Inbox>();
 public DbSet<Idempotency> Idempotency=>Set<Idempotency>(); public DbSet<Media> Media=>Set<Media>();
 public DbSet<Upload> Uploads=>Set<Upload>(); public DbSet<Clip> Clips=>Set<Clip>(); public DbSet<Export> Exports=>Set<Export>();
 public DbSet<Purchase> Purchases=>Set<Purchase>(); public DbSet<PaymentEvent> PaymentEvents=>Set<PaymentEvent>();
 public DbSet<Audit> Audit=>Set<Audit>(); public DbSet<Notification> Notifications=>Set<Notification>();
 public DbSet<Setting> Settings=>Set<Setting>(); public DbSet<Ticket> Tickets=>Set<Ticket>();
 protected override void OnModelCreating(ModelBuilder b) {
  base.OnModelCreating(b);
  b.Entity<TrialClaim>().HasKey(x=>x.CpfHmac); b.Entity<Setting>().HasKey(x=>x.Key);
  b.Entity<Idempotency>().HasIndex(x=>new{x.UserId,x.Scope,x.Key}).IsUnique();
  b.Entity<Ledger>().HasIndex(x=>new{x.Operation,x.LotId}).IsUnique();
  b.Entity<Media>().HasIndex(x=>x.Key).IsUnique(); b.Entity<Run>().HasIndex(x=>x.QuoteId).IsUnique();
  b.Entity<Notification>().HasIndex(x=>x.Dedupe).IsUnique();
  b.Entity<Export>().HasIndex(x=>new{x.ClipId,x.Revision,x.Format}).IsUnique();
  b.Entity<Project>().HasIndex(x=>new{x.UserId,x.CreatedAt}); b.Entity<Job>().HasIndex(x=>new{x.State,x.LeaseUntil});
  b.Entity<CreditLot>().ToTable(t=>t.HasCheckConstraint("lots_no_expiry", "\"Kind\" NOT IN ('PURCHASED','PURCHASE_BONUS') OR \"ExpiresAt\" IS NULL"));
  b.Entity<CreditLot>().ToTable(t=>t.HasCheckConstraint("lots_nonnegative", "\"Available\">=0 AND \"Reserved\">=0"));
  b.Entity<Wallet>().ToTable(t=>t.HasCheckConstraint("wallet_nonnegative", "\"Available\">=0 AND \"Reserved\">=0"));
  b.Entity<Run>().ToTable(t=>t.HasCheckConstraint("refund_cap", "\"Refunded\">=0 AND \"Refunded\"<=\"Total\""));
  b.Entity<CreditLot>().HasOne<Wallet>().WithMany().HasForeignKey(x=>x.UserId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Project>().HasOne<User>().WithMany().HasForeignKey(x=>x.UserId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Quote>().HasOne<Project>().WithMany().HasForeignKey(x=>x.ProjectId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Run>().HasOne<Quote>().WithMany().HasForeignKey(x=>x.QuoteId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Job>().HasOne<Project>().WithMany().HasForeignKey(x=>x.ProjectId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Media>().HasOne<Project>().WithMany().HasForeignKey(x=>x.ProjectId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Clip>().HasOne<Run>().WithMany().HasForeignKey(x=>x.RunId).OnDelete(DeleteBehavior.Restrict);
  b.Entity<Ledger>().HasOne<CreditLot>().WithMany().HasForeignKey(x=>x.LotId).OnDelete(DeleteBehavior.Restrict);
  foreach(var entity in b.Model.GetEntityTypes())
   foreach(var p in entity.GetProperties().Where(p=>p.ClrType==typeof(string)))
    if(p.Name is "Payload" or "Configuration" or "Items" or "Subtitles")p.SetColumnType("jsonb");
 }
 public async Task LockWallet(Guid id,CancellationToken ct=default) {
  await Wallets.FromSqlInterpolated($"SELECT * FROM \"Wallets\" WHERE \"Id\"={id} FOR UPDATE").LoadAsync(ct);
 }
 public async Task LockProject(Guid id,CancellationToken ct=default) {
  await Projects.FromSqlInterpolated($"SELECT * FROM \"Projects\" WHERE \"Id\"={id} FOR UPDATE").LoadAsync(ct);
 }
}
