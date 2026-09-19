export type PreviewMotion = { speed: number; action: string; run: number };

/** Only local playback speed and read-only diagnostics live here. The production
 * class owns all tile flights, effects, controls and state-channel updates. */
export async function installTableMotionPreview(iframe: HTMLIFrameElement) {
  const win = iframe.contentWindow as any;
  let scene: any;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (win?.__JINLING_TABLE_READY__ && win.System) {
      const cc = await win.System.import('cc');
      scene = cc.director.getScene()?.getChildByName('Canvas')?.getComponent('TableScene');
      if (scene) break;
    }
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  if (!scene) throw new Error('真实牌桌尚未加载完成');
  let alive = true;
  const previousScale = scene.motionScale;
  const handle = {
    sync(meta: PreviewMotion) {
      if (!alive || !scene.isValid) return;
      scene.motionScale = Number.isFinite(meta.speed) ? Math.max(.5, Math.min(4, meta.speed)) : 1;
      win.__JINLING_MOTION_PREVIEW__ = { ...meta, speed: scene.motionScale, realCocos: true, productionRenderer: true };
    },
    destroy() {
      if (!alive) return;
      alive = false;
      if (scene.isValid) scene.motionScale = previousScale ?? 1;
      delete win.__JINLING_MOTION_PREVIEW__;
    },
  };
  return handle;
}
