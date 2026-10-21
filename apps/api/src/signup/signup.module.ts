import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

/** OTP delivery (OTP_DELIVERY) is provided by the global SecurityModule alongside the SMTP mailer. */
@Module({ imports: [AuthModule], controllers: [SignupController], providers: [SignupService] })
export class SignupModule {}
