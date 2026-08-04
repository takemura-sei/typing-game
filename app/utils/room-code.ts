/** 6桁のルームコードを生成(先頭0も許容) */
export function generateRoomCode(): string {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

export function isValidRoomCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}
