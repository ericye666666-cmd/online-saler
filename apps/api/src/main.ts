import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      process.env.STORE_FRONT_URL ?? "http://localhost:3000",
      process.env.OPERATIONS_URL ?? "http://localhost:3001",
      process.env.ADMIN_URL ?? "http://localhost:3002"
    ],
    credentials: true
  });

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
