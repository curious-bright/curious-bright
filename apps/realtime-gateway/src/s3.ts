import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const isProd = process.env.NODE_ENV === 'production';

const s3Config = {
  region: process.env.AWS_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT || (isProd ? '' : 'http://localhost:9000'),
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
  },
  forcePathStyle: true,
};

export const s3 = new S3Client(s3Config);
export const BUCKET_NAME = process.env.S3_BUCKET || process.env.AWS_BUCKET_NAME || 'curious-bright';

export async function uploadWhiteboardSnapshot(roomId: string, state: Uint8Array): Promise<string> {
  const key = `whiteboards/${roomId}-snapshot.bin`;
  
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: Buffer.from(state),
    ContentType: 'application/octet-stream',
  });

  await s3.send(command);
  
  const publicUrl = isProd 
    ? `https://${process.env.PUBLIC_S3_DOMAIN}/${key}`
    : `http://localhost:9000/${BUCKET_NAME}/${key}`;
    
  return publicUrl;
}
