# Isolated local bot table

Entry: `/tests/previews/local-bots.html` (development server only).

- One human at seat 0, three `bot:true` players, dealt by the existing `startRound` engine.
- Uses the official Cocos table, action controls, model layout and insertion feedback.
- Original `botAction` / `act` implement bot decisions and game rules. Human thinking time is unlimited (`turnSeconds:0`, an existing supported rule setting); bots advance at a readable 700 ms cadence.
- The page pauses when hidden, during loading or when the user presses Pause. Pung/kong/hu/pass choices remain human-controlled unless the user explicitly enables trustee.
- State is kept only in this tab's `sessionStorage` key `jinling:isolated-local-bots-v1`. There is no server room, account mutation, online invitation or production record write.
- The retired `GameClient.practice()` entry remains closed; this does not restore a production practice entrance.
- Tests verify three bots, hidden opponent hands, actual bot progression after a human discard, pause behavior and absence of game API/WebSocket requests.
# 两把完整流程补充（2026-09-25）

打开 `/tests/previews/local-bots.html?rounds=2` 可从准备开始，经过正式开局、单把结算、下一把及最终结算。使用正式听牌提示、扣分、胡牌结果与结算组件，不连接真实服务器。两把上限仅属于本地演示；正常正式规则及托管策略不变。完整迁移检查见 `table-display-migration-20260925.md`。
