import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { validationExceptionFactory } from "./common/validation-error.util";

async function bootstrap() {
  console.log("Bootstrapping ERP backend...");
  const app = await NestFactory.create(AppModule);
  console.log("ERP backend modules loaded.");
  const config = app.get(ConfigService);
  // CORS locked to the known frontend origin. UPDATE THIS to the production
  // domain at deploy (and add any staging origins). credentials:true allows
  // cookie-based auth if introduced; current auth is Bearer-token.
  app.enableCors({
    origin: [config.get<string>("PUBLIC_APP_URL") ?? "http://localhost:5173"],
    credentials: true
  });
  // Security headers: keep the default CSP and X-Content-Type-Options: nosniff,
  // but relax Cross-Origin-Resource-Policy so the separate-origin SPA can read
  // API responses and download exports.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory
    })
  );

  const port = config.get<number>("BACKEND_PORT") ?? 4000;
  await app.listen(port, "0.0.0.0");
  console.log(`ERP backend listening on http://localhost:${port}/api (all interfaces :${port})`);
}

void bootstrap();
