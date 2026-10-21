import { execSync } from 'child_process';
import path from 'path';

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://techmunda:techmunda_dev@localhost:5432/jewellery_studio_test?schema=public';
  execSync('npx prisma migrate deploy', { cwd: path.resolve(__dirname, '../../../packages/database'), env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
}
