using Xunit;
using Cortes;
public class DomainTests {
 [Fact] public void CpfNormalizesAndValidates()=>Assert.Equal("52998224725",Cpf.Normalize("529.982.247-25"));
 [Theory][InlineData("11111111111")][InlineData("52998224726")][InlineData("abc")]
 public void InvalidCpfRejected(string value)=>Assert.Throws<DomainError>(()=>Cpf.Normalize(value));
 [Fact] public void HmacDependsOnSecret(){Assert.NotEqual(Cpf.Digest("52998224725","secret1"),Cpf.Digest("52998224725","secret2"));}
 [Fact] public void QuoteItemIsPerRun(){var item=new QuoteItem("zoom","Zoom",2,"PER_RUN","zoom");Assert.Equal("PER_RUN",item.Unit);}
 [Fact] public void RequiredNotificationAlwaysEmails(){
  var n=new Notification{EmailPolicy="REQUIRED",Category="SECURITY"};
  var p=new NotificationPreference{ProcessingEmail=false,SupportEmail=false,LowBalanceEmail=false,MarketingEmail=false};
  Assert.True(NotificationEndpoints.WantsEmail(n,p));
 }
 [Fact] public void LowBalanceEmailIsOptIn(){
  var n=new Notification{EmailPolicy="OPTIONAL_OFF",Category="LOW_BALANCE"};
  Assert.False(NotificationEndpoints.WantsEmail(n,new NotificationPreference()));
  Assert.True(NotificationEndpoints.WantsEmail(n,new NotificationPreference{LowBalanceEmail=true}));
 }
 [Fact] public void ProcessingEmailRespectsPreference(){
  var n=new Notification{EmailPolicy="DEFAULT_ON",Category="PROCESSING"};
  Assert.True(NotificationEndpoints.WantsEmail(n,null));
  Assert.False(NotificationEndpoints.WantsEmail(n,new NotificationPreference{ProcessingEmail=false}));
 }
}
