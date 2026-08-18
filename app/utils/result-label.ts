import type { ResultCode } from '../types/results'

export const RESULT_LABEL: Record<ResultCode, { text: string; class: string }> = {
  win: { text: '勝利', class: 'text-amber-300' },
  forfeit_win: { text: '不戦勝', class: 'text-amber-300' },
  loss: { text: '敗北', class: 'text-slate-400' },
  forfeit_loss: { text: '不戦敗', class: 'text-slate-400' },
  draw: { text: '引分', class: 'text-sky-300' },
}
