import { makeServer } from "./service";
const service = makeServer({
  port: Number(process.env.PORT ?? 8787),
  database: process.env.DATABASE_PATH,
});
service
  .listen()
  .then((port) => console.log(`金陵麻将对局服务：http://127.0.0.1:${port}`));
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    service.close().then(() => process.exit(0));
  });
