import type { DatabaseSync } from "node:sqlite";
import type { TelegramReportConfig } from "../server/telegram-reports";
export function reportStart(value: unknown): number;
export function freshTelegramConfig(db: DatabaseSync, input: unknown, now?: number, starts?: {daily: string; weekly: string}): TelegramReportConfig;
