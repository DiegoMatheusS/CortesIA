using System.Net;
using System.Net.Mail;
namespace Cortes;
public class Mailer(IConfiguration c) {
 public async Task Send(string to,string subject,string body) {
  using var client=new SmtpClient(c["SMTP_HOST"]??"mailpit",int.Parse(c["SMTP_PORT"]??"1025"));
  client.EnableSsl=bool.TryParse(c["SMTP_TLS"],out var tls)&&tls;
  if(!string.IsNullOrEmpty(c["SMTP_USER"]))client.Credentials=new NetworkCredential(c["SMTP_USER"],c["SMTP_PASSWORD"]);
  using var mail=new MailMessage(c["SMTP_FROM"]??"no-reply@cortes.local",to,subject,body);await client.SendMailAsync(mail);
 }
}
