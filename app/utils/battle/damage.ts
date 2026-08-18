import type { BattleEffect } from '../../types/battle'
import type { Word } from '../../types/game'

/**
 * 攻撃解決の抽象化。
 * 攻撃は必ず kind 付きで、解決ロジックは attackResolvers レジストリ経由。
 * 必殺技の追加 = resolverを1エントリ足す + 発動条件をUI側に足すだけ。
 * 未知の kind / effect type は受信側で無視する(前方互換)。
 */

export interface AttackContext {
  word: Word
  /** この単語を打ち切った時点のコンボ数(この攻撃を含む) */
  combo: number
  /** 単語の打ち切りにかかったms */
  elapsedMs: number
}

export interface AttackOutcome {
  damage: number
  effects: BattleEffect[]
}

export type AttackKind = 'normal' // 将来: | 'special_deathblow'

/** バランス調整はここに集約 */
export const DAMAGE_CONFIG = {
  baseFlat: 6,
  /** 読み文字数 n 文字ごとに +1 */
  lengthDivisor: 3,
  /** 1コンボあたりの倍率上昇 */
  comboStep: 0.04,
  /** 倍率が上がるコンボの上限(15コンボで1.6倍) */
  comboCap: 15,
  /** screen_shake が付き始めるコンボ */
  shakeThreshold: 10,
} as const

export function baseDamage(word: Word): number {
  return DAMAGE_CONFIG.baseFlat + Math.floor(word.reading.length / DAMAGE_CONFIG.lengthDivisor)
}

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(combo, DAMAGE_CONFIG.comboCap) * DAMAGE_CONFIG.comboStep
}

export const attackResolvers: Record<string, (ctx: AttackContext) => AttackOutcome> = {
  normal: (ctx) => ({
    damage: Math.round(baseDamage(ctx.word) * comboMultiplier(ctx.combo)),
    effects:
      ctx.combo >= DAMAGE_CONFIG.shakeThreshold
        ? [{ type: 'screen_shake', power: 1 }]
        : [],
  }),
}

/** kind から攻撃を解決する。未知kindはダメージ0(前方互換: 新クライアントの技を旧クライアントが無視) */
export function resolveAttack(kind: string, ctx: AttackContext): AttackOutcome {
  const resolver = attackResolvers[kind]
  if (!resolver) return { damage: 0, effects: [] }
  return resolver(ctx)
}
