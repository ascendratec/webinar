import { readFileSync } from 'fs';
import { join } from 'path';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { RDSClient, DescribeDBClustersCommand, EnableHttpEndpointCommand } from '@aws-sdk/client-rds';
import { fromIni } from '@aws-sdk/credential-providers';

// ---------------------------------------------------------------------------
// Parse arguments: npx tsx scripts/apply-schema.ts --profile=<profile> [--region=<region>] [--stack=<stack>]
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const PROFILE = args.find(a => a.startsWith('--profile='))?.split('=')[1] || process.env.AWS_PROFILE;
const REGION = args.find(a => a.startsWith('--region='))?.split('=')[1] || process.env.AWS_REGION || 'us-east-1';
const STACK_NAME = args.find(a => a.startsWith('--stack='))?.split('=')[1] || 'eventhub-webinar';

if (!PROFILE) {
  console.error('Error: --profile is required.');
  console.error('');
  console.error('Usage: npx tsx scripts/apply-schema.ts --profile=<aws-profile> [--region=<region>] [--stack=<stack-name>]');
  process.exit(1);
}

const credentials = fromIni({ profile: PROFILE });
const rdsClient = new RDSClient({ region: REGION, credentials });
const rdsDataClient = new RDSDataClient({ region: REGION, credentials });

async function getClusterInfo(): Promise<{ clusterArn: string; secretArn: string }> {
  const clusterId = `${STACK_NAME}-aurora-cluster`;
  const response = await rdsClient.send(new DescribeDBClustersCommand({
    DBClusterIdentifier: clusterId,
  }));

  const cluster = response.DBClusters?.[0];
  if (!cluster) throw new Error(`Aurora cluster ${clusterId} not found`);

  const clusterArn = cluster.DBClusterArn!;
  const secretArn = cluster.MasterUserSecret?.SecretArn;
  if (!secretArn) throw new Error('MasterUserSecret ARN not found on cluster');

  return { clusterArn, secretArn };
}

async function enableDataApi(clusterArn: string): Promise<void> {
  try {
    await rdsClient.send(new EnableHttpEndpointCommand({
      ResourceArn: clusterArn,
    }));
    console.log('✅ Data API (HTTP endpoint) enabled');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already enabled') || msg.includes('HttpEndpoint is already')) {
      console.log('ℹ️  Data API already enabled');
    } else {
      throw error;
    }
  }
}

async function executeSQL(clusterArn: string, secretArn: string, sql: string): Promise<void> {
  await rdsDataClient.send(new ExecuteStatementCommand({
    resourceArn: clusterArn,
    secretArn: secretArn,
    database: 'postgres',
    sql,
  }));
}

async function applySchema(): Promise<void> {
  console.log(`🔑 Profile: ${PROFILE}`);
  console.log(`🌎 Region:  ${REGION}`);
  console.log(`📦 Stack:   ${STACK_NAME}`);
  console.log('');

  console.log('🔍 Fetching Aurora cluster info...');
  const { clusterArn, secretArn } = await getClusterInfo();
  console.log(`📡 Cluster: ${clusterArn}`);
  console.log('');

  // Ensure Data API is enabled
  console.log('🔌 Ensuring Data API is enabled...');
  await enableDataApi(clusterArn);
  console.log('');

  // Read schema file
  const schemaPath = join(__dirname, '..', 'sql', 'schema.sql');
  const schemaContent = readFileSync(schemaPath, 'utf-8');
  console.log(`📄 Schema file: sql/schema.sql (${schemaContent.length} bytes)`);
  console.log('');

  // Split by semicolons and execute each statement individually
  // (RDS Data API executes one statement at a time)
  // Remove comment-only lines but keep inline comments within statements
  const statements = schemaContent
    .split(';')
    .map(s => s.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').trim())
    .filter(s => s.length > 0);

  console.log(`🚀 Applying ${statements.length} statements via RDS Data API...`);
  console.log('');

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const firstLine = stmt.split('\n').find(l => l.trim().length > 0) || stmt.substring(0, 60);
    try {
      await executeSQL(clusterArn, secretArn, stmt);
      console.log(`  ✅ [${i + 1}/${statements.length}] ${firstLine.trim().substring(0, 70)}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('already exists')) {
        console.log(`  ⏭️  [${i + 1}/${statements.length}] Already exists — skipping`);
      } else {
        console.error(`  ❌ [${i + 1}/${statements.length}] Failed: ${msg}`);
        throw error;
      }
    }
  }

  console.log('');
  console.log('✅ Schema applied successfully!');

  // Verify tables
  const verifyResult = await rdsDataClient.send(new ExecuteStatementCommand({
    resourceArn: clusterArn,
    secretArn: secretArn,
    database: 'postgres',
    sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  }));

  console.log('');
  console.log('📋 Tables in database:');
  for (const record of verifyResult.records || []) {
    console.log(`   - ${record[0]?.stringValue}`);
  }
}

applySchema().catch((error) => {
  console.error('❌ Failed to apply schema:', error.message);
  process.exit(1);
});
