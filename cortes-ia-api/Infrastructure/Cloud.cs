using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Amazon.SQS;
using Amazon.SQS.Model;
namespace Cortes;
public class Cloud {
 public AmazonS3Client S3 {get;} public AmazonS3Client PublicS3 {get;} public AmazonSQSClient Sqs {get;}
 public string Bucket {get;} public string JobsQueue {get;} public string EventsQueue {get;}
 public Cloud(IConfiguration c) {
  var region=c["AWS_REGION"]??"us-east-1";var endpoint=c["AWS_ENDPOINT_URL"];
  Bucket=c["MEDIA_BUCKET"]??"cortes-local";JobsQueue=c["JOBS_QUEUE_URL"]??"";EventsQueue=c["EVENTS_QUEUE_URL"]??"";
  var sc=new AmazonS3Config{RegionEndpoint=RegionEndpoint.GetBySystemName(region),ForcePathStyle=!string.IsNullOrEmpty(endpoint)};
  var pc=new AmazonS3Config{RegionEndpoint=RegionEndpoint.GetBySystemName(region),ForcePathStyle=!string.IsNullOrEmpty(endpoint)};
  var qc=new AmazonSQSConfig{RegionEndpoint=RegionEndpoint.GetBySystemName(region)};
  if(!string.IsNullOrEmpty(endpoint)){sc.ServiceURL=endpoint;pc.ServiceURL=c["S3_PUBLIC_ENDPOINT"]??endpoint;qc.ServiceURL=endpoint;sc.AuthenticationRegion=region;pc.AuthenticationRegion=region;qc.AuthenticationRegion=region;}
  S3=new AmazonS3Client(sc);PublicS3=new AmazonS3Client(pc);Sqs=new AmazonSQSClient(qc);
 }
 public string Download(string key)=>PublicS3.GetPreSignedURL(new GetPreSignedUrlRequest{BucketName=Bucket,Key=key,Verb=HttpVerb.GET,Expires=DateTime.UtcNow.AddMinutes(5)});
 public string Part(string key,string uploadId,int part)=>PublicS3.GetPreSignedURL(new GetPreSignedUrlRequest{BucketName=Bucket,Key=key,Verb=HttpVerb.PUT,UploadId=uploadId,PartNumber=part,Expires=DateTime.UtcNow.AddMinutes(15)});
 public async Task Queue(Guid job)=>await Sqs.SendMessageAsync(new SendMessageRequest{QueueUrl=JobsQueue,MessageBody=Json.Write(new{schemaVersion=1,jobId=job})});
}
