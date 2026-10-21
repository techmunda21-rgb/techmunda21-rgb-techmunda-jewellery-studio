import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { loadEnv } from '@techmunda/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: loadEnv().JWT_ACCESS_SECRET, signOptions: { expiresIn: loadEnv().ACCESS_TOKEN_TTL as any } }) })],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
