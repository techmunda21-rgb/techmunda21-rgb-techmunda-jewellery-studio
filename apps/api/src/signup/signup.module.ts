import { Module } from '@nestjs/common';
import { loadEnv } from '@techmunda/core';
import { AuthModule } from '../auth/auth.module';
import { OTP_DELIVERY, ProviderOtpDelivery } from './otp-delivery';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

@Module({ imports: [AuthModule], controllers: [SignupController], providers: [SignupService, { provide: OTP_DELIVERY, useFactory: () => new ProviderOtpDelivery(loadEnv()) }] })
export class SignupModule {}
