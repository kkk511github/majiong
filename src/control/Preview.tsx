import {
  Bell,
  BookOpen,
  CircleUserRound,
  Clock3,
  Grid2X2,
  House,
  X,
} from "lucide-react";
import { controlAsset } from "./api";
import { displayTime } from "./model";

export interface PreviewContent {
  kind: "announcement" | "release";
  title: string;
  body: string;
  publishedAt?: number | null;
  build?: string;
  platform?: "android" | "ios";
}

export function AppPreview({ content }: { content: PreviewContent }) {
  return (
    <section className="control-preview-section" aria-label="APP 效果预览">
      <div className="control-section-title">
        <h2>APP 效果预览</h2>
        <span className="control-caption">横屏 · 仅预览</span>
      </div>
      <div
        className="control-phone-preview"
        style={{ backgroundImage: `url(${controlAsset("lobby-scene.png")})` }}
      >
        <div className="control-preview-lobby" aria-hidden="true">
          <div className="control-preview-brand">
            <img src={controlAsset("brand-icon.png")} alt="" />
            <strong>金陵麻将</strong>
            <Bell size={18} />
          </div>
          <h3>南京麻将</h3>
          <p>碰杠不吃 · 二十张花 · 四人约局</p>
          <span className="control-preview-entry">进入牌桌大厅　›</span>
          <div className="control-preview-tabs">
            <span>
              <House />
              牌桌
            </span>
            <span>
              <Grid2X2 />
              约局
            </span>
            <span>
              <Clock3 />
              战绩
            </span>
            <span>
              <BookOpen />
              玩法
            </span>
            <span>
              <CircleUserRound />
              我的
            </span>
          </div>
        </div>
        <div className="control-preview-dim" />
        <div className="control-app-dialog">
          <div className="control-app-dialog-label">
            <span />
            {content.kind === "announcement" ? "公告" : "版本更新"}
            <span />
            <X size={15} />
          </div>
          <h3>
            {content.title ||
              (content.kind === "announcement" ? "填写公告标题" : "发现新版本")}
          </h3>
          {content.kind === "announcement" ? (
            <time>
              {content.publishedAt
                ? displayTime(content.publishedAt)
                : "发布时显示实际时间"}
            </time>
          ) : (
            <div className="control-app-build">
              {content.build ? `Build ${content.build}` : "上传后读取 Build"}
            </div>
          )}
          <div
            className={`control-app-dialog-body${!content.body ? " control-preview-placeholder" : ""}`}
          >
            {content.body ||
              (content.kind === "announcement"
                ? "填写正文后，在这里查看成员阅读效果。"
                : "填写更新说明后，在这里查看提示效果。")}
          </div>
          {content.kind === "release" && (
            <p className="control-app-install-note">
              {content.platform === "ios"
                ? "前往安装页，按页面指引完成安装。"
                : "下载完成后，按系统提示确认安装。"}
            </p>
          )}
          <div className="control-app-dialog-actions" aria-hidden="true">
            {content.kind === "release" && (
              <span className="control-app-secondary">稍后更新</span>
            )}
            <span>
              {content.kind === "announcement"
                ? "我知道了"
                : content.platform === "ios"
                  ? "前往安装"
                  : "下载更新"}
            </span>
          </div>
        </div>
      </div>
      <p className="control-preview-footnote">
        预览不会推送给成员。正文支持分段，长文可在卡片内滚动。
      </p>
    </section>
  );
}
