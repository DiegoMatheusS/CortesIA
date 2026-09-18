using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
namespace Cortes;
public class DomainError(string code,int status=400):Exception(code) { public int Status {get;}=status; }
public static class Cpf {
 public static string Normalize(string value) {
  var n=new string(value.Where(char.IsAsciiDigit).ToArray());
  if(n.Length!=11 || n.Distinct().Count()==1)throw new DomainError("INVALID_CPF");
  for(var len=9;len<=10;len++) {var sum=0;for(var i=0;i<len;i++)sum+=(n[i]-'0')*(len+1-i);var d=(sum*10)%11;if(d==10)d=0;if(n[len]-'0'!=d)throw new DomainError("INVALID_CPF");}
  return n;
 }
 public static string Digest(string value,string secret)=>Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret),Encoding.UTF8.GetBytes(Normalize(value))));
}
public class Policy(Database db,IConfiguration cfg) {
 public async Task<long> Number(string key,long fallback)=>long.TryParse(await db.Settings.Where(x=>x.Key==key).Select(x=>x.Value).SingleOrDefaultAsync(),out var n)?n:fallback;
 public async Task<bool> Enabled(string key,bool fallback=false)=>bool.TryParse(await db.Settings.Where(x=>x.Key==key).Select(x=>x.Value).SingleOrDefaultAsync(),out var b)?b:fallback;
 public async Task<QuoteItem[]> Price(long ms,VideoConfig c) {
  if(ms<=0||ms>await Number("maxDurationMs",25_200_000))throw new DomainError("INVALID_DURATION",422);
  if(c.Quantity<1||c.Quantity>await Number("maxClips",20))throw new DomainError("INVALID_QUANTITY");
  if(!new[]{"UP_TO_1_MIN","ONE_TO_TWO_MIN","TWO_TO_THREE_MIN","AUTO"}.Contains(c.DurationMode))throw new DomainError("INVALID_DURATION_MODE");
  if((c.Formats??["9:16"]).Except(new[]{"9:16","4:5","1:1","16:9","original"}).Any())throw new DomainError("INVALID_FORMAT");
  if(ms>5_400_000&&!Development&&!await Enabled("longVideoPricingApproved",await Enabled("tier180Approved")))throw new DomainError("TIER_PRICE_PENDING_APPROVAL",409);
  long basis=ms<=1_800_000?10:ms<=5_400_000?30:60;
  var items=new List<QuoteItem>{new("base","Processamento com legenda simples",basis)};
  var prices=new Dictionary<string,long>{{"dynamic_captions",3},{"zoom",2},{"blur",3},{"tracking",2},{"cover",2}};
  foreach(var code in (c.Features??[]).Distinct()) {
   if(code=="tracking"){
    var trackingEnabled=bool.TryParse(cfg["TRACKING_ENABLED"],out var enabled)&&enabled;
    if(!trackingEnabled)throw new DomainError("FEATURE_IMPLEMENTATION_PENDING",409);
   }
   if(!prices.TryGetValue(code,out var price))throw new DomainError("UNKNOWN_FEATURE");
   items.Add(new(code,code,await Number("price."+code,price),"PER_RUN",code));
  }
  return items.ToArray();
 }
 public bool Development=>cfg["ASPNETCORE_ENVIRONMENT"]=="Development";
}
