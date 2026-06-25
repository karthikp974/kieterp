import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { validationExceptionFactory } from "./common/validation-error.util";

async function bootstrap() {
  console.log("Bootstrapping ERP backend...");
  const app = await NestFactory.create(AppModule, { cors: true });
  console.log("ERP backend modules loaded.");
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory
    })
  );

  const config = app.get(ConfigService);
  const port = config.get<number>("BACKEND_PORT") ?? 4000;
  await app.listen(port, "0.0.0.0");
  console.log(`ERP backend listening on http://localhost:${port}/api (all interfaces :${port})`);
}

void bootstrap();
