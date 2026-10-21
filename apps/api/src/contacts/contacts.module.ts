import { Module } from '@nestjs/common';

/** Contact endpoints (consent withdrawal) live in LeadsController because a contact is always reached through a lead. */
@Module({})
export class ContactsModule {}
