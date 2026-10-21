import { Global, Module } from '@nestjs/common';
import { loadEnv } from '@techmunda/core';
import { OTP_DELIVERY, ProviderOtpDelivery } from '../signup/otp-delivery';
import { IpBanService } from './ip-ban.service';
import { MailService } from './mail.service';
import { OpsController } from './ops.controller';
import { SecurityService } from './security.service';

@Global()
@Module({ controllers: [OpsController], providers: [MailService, IpBanService, SecurityService, { provide: OTP_DELIVERY, inject: [MailService], useFactory: (mail: MailService) => new ProviderOtpDelivery(loadEnv(), mail) }], exports: [MailService, IpBanService, SecurityService, OTP_DELIVERY] })
export class SecurityModule {}
