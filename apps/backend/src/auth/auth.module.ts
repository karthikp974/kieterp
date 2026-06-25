import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { getJwtAccessSecret } from "../common/jwt-secret.util";
import { EmailModule } from "../email/email.module";
import { SpectatorModule } from "../spectator/spectator.module";
import { AuditIdentityService } from "./audit-identity.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    EmailModule,
    SpectatorModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtAccessSecret(config),
        signOptions: { expiresIn: "15m" }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuditIdentityService],
  exports: [AuthService, AuditIdentityService]
})
export class AuthModule {}
