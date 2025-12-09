import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"), // Yeh CLI ke liye direct use karega
  },
});
