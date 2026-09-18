using Microsoft.AspNetCore.Identity;
using System.Text.Json;
namespace Cortes;
public static class Json {
 public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
 public static string Write<T>(T x)=>JsonSerializer.Serialize(x,Options);
 public static T Read<T>(string x)=>JsonSerializer.Deserialize<T>(x,Options)!;
}
public class User:IdentityUser<Guid> {
 public string Name {get;set;}=""; public string CpfLastTwo {get;set;}="";
 public bool Blocked {get;set;} public DateTimeOffset LastActive {get;set;}=DateTimeOffset.UtcNow;
 public int ActivityEpoch {get;set;}=1;
}
public class Wallet { public Guid Id {get;set;} public long Available {get;set;} public long Reserved {get;set;} }
public class CreditLot {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;}
 public string Kind {get;set;}="TRIAL"; public long Available {get;set;} public long Reserved {get;set;}
 public DateTimeOffset? ExpiresAt {get;set;} public Guid? PurchaseId {get;set;}
 public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
}
public class Ledger {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public Guid LotId {get;set;}
 public string Operation {get;set;}=""; public string Kind {get;set;}="";
 public long AvailableDelta {get;set;} public long ReservedDelta {get;set;}
 public Guid? RunId {get;set;} public string? ItemCode {get;set;} public string Reason {get;set;}="";
 public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
}
public class TrialClaim { public string CpfHmac {get;set;}=""; public Guid UserId {get;set;} public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow; }
public class ReservationLine { public Guid Id {get;set;}=Guid.NewGuid(); public Guid RunId {get;set;} public Guid LotId {get;set;} public long Credits {get;set;} public long Refunded {get;set;} }
public class Project {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public string Title {get;set;}="";
 public string Status {get;set;}="ENVIANDO"; public string? Outcome {get;set;}
 public long DurationMs {get;set;} public string? SourceAssetKey {get;set;} public string? MasterAssetKey {get;set;}
 public string? SourceUrl {get;set;} public int Generation {get;set;}=1; public int Version {get;set;}=1;
 public string Configuration {get;set;}=Json.Write(new VideoConfig());
 public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
 public DateTimeOffset? FirstProcessedAt {get;set;} public DateTimeOffset? DeletedAt {get;set;}
}
public record VideoConfig(int Quantity=5,string DurationMode="UP_TO_1_MIN",string Style="BASIC",string[]? Features=null,string[]? Formats=null);
public record QuoteItem(string Code,string Description,long Credits,string Unit="PER_RUN",string? Feature=null,int CatalogVersion=1);
public class Quote {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public Guid ProjectId {get;set;}
 public int Version {get;set;} public string Items {get;set;}="[]"; public long Total {get;set;}
 public string Modality {get;set;}="trial"; public string Configuration {get;set;}="{}";
 public DateTimeOffset ExpiresAt {get;set;}=DateTimeOffset.UtcNow.AddMinutes(15);
}
public class Run {
 public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public Guid ProjectId {get;set;}
 public Guid QuoteId {get;set;} public long Total {get;set;} public long Refunded {get;set;}
 public string FinancialState {get;set;}="RESERVED"; public string? Outcome {get;set;}
 public string Items {get;set;}="[]"; public string Configuration {get;set;}="{}"; public string Modality {get;set;}="trial";
}
public class Job {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid ProjectId {get;set;} public Guid? RunId {get;set;}
 public string Stage {get;set;}="INGEST"; public string State {get;set;}="QUEUED"; public int Generation {get;set;}
 public int Attempts {get;set;} public int Fence {get;set;}
 public string ProgressPhase {get;set;}="QUEUED"; public int ProgressPercent {get;set;}
 public string Payload {get;set;}="{}"; public DateTimeOffset? LeaseUntil {get;set;}
 public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow; public string? Error {get;set;}
}
public class Outbox {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid JobId {get;set;}
 public DateTimeOffset? PublishedAt {get;set;} public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
}
public class Inbox { public Guid Id {get;set;} public DateTimeOffset At {get;set;}=DateTimeOffset.UtcNow; }
public class Idempotency {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public string Scope {get;set;}="";
 public string Key {get;set;}=""; public string BodyHash {get;set;}=""; public string Response {get;set;}="";
}
public class Media {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public Guid ProjectId {get;set;}
 public string Key {get;set;}=""; public string Kind {get;set;}="ORIGINAL"; public long Size {get;set;}
 public string DeletionState {get;set;}="ACTIVE"; public string RetentionReason {get;set;}="PROJECT_ACTIVITY";
 public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow; public DateTimeOffset? ExpiresAt {get;set;} public DateTimeOffset? DeletedAt {get;set;}
}
public class Upload {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid ProjectId {get;set;} public Guid UserId {get;set;}
 public string Key {get;set;}=""; public string MultipartId {get;set;}=""; public long Size {get;set;}
 public string State {get;set;}="UPLOADING"; public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
}
public record RevisionSegment(long StartMs,long EndMs);
public record CropSpec(double X=0,double Y=0,double Width=1,double Height=1);
public class Clip {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid ProjectId {get;set;} public Guid RunId {get;set;}
 public string Title {get;set;}=""; public string Reason {get;set;}=""; public long StartMs {get;set;} public long EndMs {get;set;}
 public string Selection {get;set;}="SUGGESTED"; public int Revision {get;set;}=1;
 public string Segments {get;set;}="[]"; public string Subtitles {get;set;}="[]"; public string Style {get;set;}="simple";
 public string CaptionPreset {get;set;}="Clean"; public string CaptionOverrides {get;set;}="{}";
 public string VisualStyle {get;set;}="Cinema"; public string VisualOverrides {get;set;}="{}";
 public string Aspect {get;set;}="9:16"; public string Crop {get;set;}=Json.Write(new CropSpec());
 public string? PreviewKey {get;set;} public int PreviewRevision {get;set;} public string? CoverKey {get;set;}
}
public class ClipRevision {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid ClipId {get;set;} public Guid ProjectId {get;set;}
 public int Number {get;set;} public string Title {get;set;}=""; public string Selection {get;set;}="SUGGESTED";
 public long StartMs {get;set;} public long EndMs {get;set;}
 public string Segments {get;set;}="[]"; public string Subtitles {get;set;}="[]"; public string Style {get;set;}="simple";
 public string CaptionPreset {get;set;}="Clean"; public string CaptionOverrides {get;set;}="{}";
 public string VisualStyle {get;set;}="Cinema"; public string VisualOverrides {get;set;}="{}";
 public string Aspect {get;set;}="9:16"; public string Crop {get;set;}=Json.Write(new CropSpec());
 public string? CoverKey {get;set;} public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
}
public class Export {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid ClipId {get;set;} public Guid ProjectId {get;set;}
 public Guid JobId {get;set;} public int Revision {get;set;} public string Format {get;set;}="9:16";
 public string State {get;set;}="QUEUED"; public string? Key {get;set;}
}
public class Purchase {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public string Package {get;set;}="";
 public long Credits {get;set;} public long Bonus {get;set;} public long AmountMinor {get;set;}
 public string State {get;set;}="PENDING"; public string? ProviderId {get;set;} public string? CheckoutUrl {get;set;}
 public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
}
public class PaymentEvent { public string Id {get;set;}=""; public string PaymentId {get;set;}=""; public DateTimeOffset ReceivedAt {get;set;}=DateTimeOffset.UtcNow; public DateTimeOffset? ProcessedAt {get;set;} }
public class Audit {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid? Actor {get;set;} public string Action {get;set;}="";
 public string Target {get;set;}=""; public string Reason {get;set;}="";
 public DateTimeOffset At {get;set;}=DateTimeOffset.UtcNow;
}
public class Notification {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public string Dedupe {get;set;}="";
 public string Subject {get;set;}=""; public string Body {get;set;}=""; public DateTimeOffset? SentAt {get;set;}
}
public class Setting { public string Key {get;set;}=""; public string Value {get;set;}=""; }
public class Ticket {
 public Guid Id {get;set;}=Guid.NewGuid(); public Guid UserId {get;set;} public Guid? ProjectId {get;set;}
 public string Subject {get;set;}=""; public string Message {get;set;}=""; public string Status {get;set;}="OPEN";
 public string? Reply {get;set;} public DateTimeOffset CreatedAt {get;set;}=DateTimeOffset.UtcNow;
}
