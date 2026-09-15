import { DatabaseSync } from "node:sqlite";
import { provisionAdministrator, ADMIN_USERNAME } from "../server/accounts";
// Read credentials from stdin, never command-line arguments or checked-in config.
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 4096) throw Error("输入过长");
}
const settings = JSON.parse(input);
const db = new DatabaseSync(process.env.DATABASE_PATH ?? "data/mahjong.sqlite");
try {
  await provisionAdministrator(db, {
    username: ADMIN_USERNAME,
    password: settings.password,
  });
  console.log("管理员账号已初始化，首次登录需设置新密码。");
} finally {
  db.close();
}
