import { Module } from '@nestjs/common';

/** Tenant profile reads are served by UsersController (`/tenants/current`); tenant provisioning is a platform-ops task (see docs/DEPLOYMENT.md). */
@Module({})
export class TenantsModule {}
