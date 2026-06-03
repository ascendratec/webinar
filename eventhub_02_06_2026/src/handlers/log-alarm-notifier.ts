import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { gunzipSync } from 'zlib';

const snsClient = new SNSClient({});
const TOPIC_ARN = process.env.ALARM_TOPIC_ARN!;

interface CloudWatchLogsEvent {
  awslogs: {
    data: string;
  };
}

interface LogEvent {
  id: string;
  timestamp: number;
  message: string;
}

interface DecodedLogData {
  logGroup: string;
  logStream: string;
  logEvents: LogEvent[];
}

export const handler = async (event: CloudWatchLogsEvent): Promise<void> => {
  // Decode and decompress the CloudWatch Logs payload
  const payload = Buffer.from(event.awslogs.data, 'base64');
  const decompressed = gunzipSync(payload);
  const logData: DecodedLogData = JSON.parse(decompressed.toString('utf-8'));

  const { logGroup, logEvents } = logData;

  // Build a concise notification message
  const errorMessages = logEvents
    .map(e => {
      try {
        const parsed = JSON.parse(e.message);
        return parsed.message || e.message;
      } catch {
        return e.message;
      }
    })
    .slice(0, 5); // Limit to 5 messages to avoid SNS size limit

  const subject = `⚠️ CRITICAL ERROR — EventHub`;
  const message = [
    `🚨 Erro crítico detectado em tempo real`,
    ``,
    `Log Group: ${logGroup}`,
    `Timestamp: ${new Date().toISOString()}`,
    `Erros detectados: ${logEvents.length}`,
    ``,
    `--- Mensagens ---`,
    ...errorMessages,
  ].join('\n');

  await snsClient.send(new PublishCommand({
    TopicArn: TOPIC_ARN,
    Subject: subject.substring(0, 100),
    Message: message,
  }));
};
