export type BattleOutcome = 'win' | 'loss' | 'draw'

export interface BattleResult {
  outcome: BattleOutcome
  reason: 'hp_zero' | 'forfeit'
}

export type BattleEffect =
  | { type: 'screen_shake'; power: number }
  | { type: 'cutin'; id: string }
