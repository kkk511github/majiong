import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { mkdirSync, readFileSync } from "node:fs";
import { act, createGame, newPlayer, seats, viewFor } from "../shared/engine";
import { normalizeTableSettings } from "../shared/table-settings";
import type { Game } from "../shared/types";
const voice = JSON.parse(readFileSync("src/nanjing-male.json", "utf8"));
const female = JSON.parse(readFileSync("src/nanjing-female.json", "utf8"));

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`南京话独立音量、试听与静音 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      localStorage.setItem("jinling:music", "false");
      localStorage.setItem("jinling:sound", "false");
      localStorage.setItem("jinling:voice", "true");
      const Base = window.AudioContext;
      (window as any).__voiceStarts = [];
      window.AudioContext = class extends Base {
        constructor(options?: AudioContextOptions) {
          super(options);
          const analyser = this.createAnalyser();
          analyser.fftSize = 2048;
          const connect = AudioNode.prototype.connect;
          const destination = this.destination;
          AudioNode.prototype.connect = function (
            this: AudioNode,
            ...args: any[]
          ) {
            const result = (connect as any).apply(this, args);
            if (args[0] === destination) (connect as any).call(this, analyser);
            return result;
          } as typeof AudioNode.prototype.connect;
          (window as any).__voiceAudio = { context: this, analyser };
          const create = this.createBufferSource.bind(this);
          this.createBufferSource = () => {
            const source = create(),
              start = source.start.bind(source);
            source.start = (...args: Parameters<typeof source.start>) => {
              if (source.buffer && source.buffer.duration > 10)
                (window as any).__voiceStarts.push(args);
              start(...args);
            };
            return source;
          };
        }
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "南京男声", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("switch", { name: "南京话报牌", exact: true }),
    ).toBeChecked();
    const preview = page.getByRole("button", {
      name: "试听南京话",
      exact: true,
    });
    await preview.scrollIntoViewIfNeeded();
    const hit = await preview.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        r.right <= innerWidth &&
        el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        )
      );
    });
    expect(hit).toBe(true);
    await page.evaluate(() => (window as any).__voiceAudio.context.suspend());
    await preview.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__voiceStarts.length))
      .toBe(1);
    const starts = await page.evaluate(() => (window as any).__voiceStarts);
    expect(starts[0]).toEqual([0, ...voice.actions["自摸"]]);
    const peak = () =>
      page.evaluate(() => {
        const analyser = (window as any).__voiceAudio.analyser;
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        return Math.max(...data.map(Math.abs));
      });
    await expect.poll(peak, { intervals: [20, 30, 50] }).toBeGreaterThan(0.001);
    await page.getByRole("button", { name: "南京女声", exact: true }).click();
    await preview.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__voiceStarts.length))
      .toBe(2);
    expect(await page.evaluate(() => (window as any).__voiceStarts[1])).toEqual(
      [0, ...female.actions["自摸"]],
    );
    await expect.poll(peak, { intervals: [20, 30, 50] }).toBeGreaterThan(0.001);
    await page.getByRole("switch", { name: "南京话报牌", exact: true }).click();
    await expect(preview).toBeDisabled();
    await expect.poll(peak).toBeLessThan(0.0001);
    await page.getByRole("switch", { name: "南京话报牌", exact: true }).click();
    await page.getByRole("slider", { name: "南京话报牌音量" }).fill("35");
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/voice-settings-${width}.png`,
    });
    await page.reload();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "南京女声", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("slider", { name: "南京话报牌音量" }),
    ).toHaveValue("35");
    await expect(
      page.getByRole("switch", { name: "游戏音效", exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("switch", { name: "背景音乐", exact: true }),
    ).not.toBeChecked();
  });
}

function voiceWinningGame(claim: boolean): Game {
  const game=createGame("528613",claim?"voice-claim":"voice-self",{rounds:4,turnSeconds:0});
  game.players=seats.map(seat=>newPlayer(seat===0?"me":`voice-${seat}`,`牌友${seat}`,seat!==0));
  game.table={creatorId:"me",groupId:"voice-focus",number:1,createdAt:0,
    settings:{...normalizeTableSettings({}),openingAnimation:false}};
  game.phase="playing";game.round=1;game.turn=0;game.canSelfWin=true;
  game.deadline=Date.now()+600000;
  game.players[0]!.hand=[0,4,8,12,16,20,36,40,44,72,76,80,108,109];
  game.lastDraw=109;
  if(claim){
    game.players[0]!.hand.pop();
    game.turn=1;game.phase="claiming";
    game.pending={tile:109,from:1,kind:"discard",openedAtRevision:0,
      offers:{0:["hu","pass"]},replies:{}};
    game.players[1]!.discards=[109];
  }
  return game;
}

test("父页面与牌桌切换焦点后，自摸和点炮胡都真正播放胡了录音", async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem("jinling:music", "false");
    localStorage.setItem("jinling:sound", "false");
    localStorage.setItem("jinling:voice", "true");
    localStorage.setItem("jinling:voiceVolume", "0.85");
    localStorage.setItem("jinling:voiceGender", '"male"');
    const Base=window.AudioContext;
    (window as any).__huStarts=[];
    (window as any).__huPeak=0;
    window.AudioContext=class extends Base {
      constructor(options?:AudioContextOptions){
        super(options);
        (window as any).__huContext=this;
        const analyser=this.createAnalyser(),destination=this.destination;
        const connect=AudioNode.prototype.connect;
        AudioNode.prototype.connect=function(this:AudioNode,...args:any[]){
          const result=(connect as any).apply(this,args);
          if(args[0]===destination)(connect as any).call(this,analyser);
          return result;
        } as typeof AudioNode.prototype.connect;
        const data=new Float32Array(analyser.fftSize);
        const measure=()=>{analyser.getFloatTimeDomainData(data);(window as any).__huPeak=Math.max((window as any).__huPeak,...data.map(Math.abs));requestAnimationFrame(measure);};
        requestAnimationFrame(measure);
        const create=this.createBufferSource.bind(this);
        this.createBufferSource=()=>{const source=create(),start=source.start.bind(source);source.start=(...args:Parameters<typeof source.start>)=>{if(source.buffer&&source.buffer.duration>10)(window as any).__huStarts.push(args);start(...args);};return source;};
      }
    };
  });
  let game=voiceWinningGame(false),socket:WebSocketRoute;
  const push=()=>socket.send(JSON.stringify({type:"state",state:viewFor(game,0),serverNow:Date.now()}));
  await page.routeWebSocket("**/ws",ws=>{
    socket=ws;
    const server=ws.connectToServer();
    ws.onMessage(raw=>{
      const message=JSON.parse(String(raw));
      if(message.type==="action"&&message.action?.type==="hu"){
        game=act(game,0,{type:"hu"},Date.now());
        ws.send(JSON.stringify({type:"ack",requestId:message.requestId}));
        push();
      }else server.send(raw);
    });
    server.onMessage(raw=>{
      const message=JSON.parse(String(raw));
      if(message.type==="session"){
        ws.send(JSON.stringify({...message,roomCode:game.code}));
        push();
      }else ws.send(raw);
    });
  });
  await page.goto("/");
  const iframe=page.locator("#cocos-table-board iframe");
  await expect(iframe).toBeVisible();
  await expect(page.getByRole("navigation",{name:"牌桌工具"})).toBeVisible();
  await expect.poll(()=>page.frames().find(frame=>frame.url().includes("/cocos-table/index.html"))
    ?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);

  for(const [index,claim] of [false,true].entries()){
    if(claim){
      game=voiceWinningGame(true);
      push();
    }
    const hu=page.getByRole("button",{name:claim?"胡":"自摸",exact:true});
    await expect(hu).toBeVisible();
    await iframe.focus();
    expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe("IFRAME");
    await hu.focus();
    expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe("BUTTON");
    await hu.click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__huStarts.length)).toBe(index+1);
    expect(await page.evaluate(()=>(window as any).__huStarts)).toEqual(
      Array.from({length:index+1},()=>[0,...voice.actions["胡了"]]));
    await expect.poll(()=>page.evaluate(()=>(window as any).__huPeak),
      {intervals:[20,30,50]}).toBeGreaterThan(.001);
    if(index===0) await page.evaluate(()=>{(window as any).__firstHuContext=(window as any).__huContext;});
    else expect(await page.evaluate(()=>(window as any).__huContext===(window as any).__firstHuContext)).toBe(true);
  }
});
