import { describe, expect, it } from 'vitest'
import { needsWebSearchHeuristic } from '../localWebIntent'

const NOW = new Date('2026-10-12T08:00:00Z')

describe('needsWebSearchHeuristic', () => {
  it.each([
    'album nhạc mới nhất của Jack',
    'giá vàng hôm nay bao nhiêu?',
    'thời tiết Hà Nội ngày mai',
    'kết quả trận MU tối qua',
    'tỷ giá USD hiện nay',
    'what is the latest version of Node.js?',
    'who is the current CEO of OpenAI',
    'bitcoin price right now',
    'weather in Tokyo',
    '東京の天気を教えて',
    '最新のiPhoneは？',
    'Giải thưởng Nobel 2026 trao cho ai?',
  ])('detects a time-sensitive question: %s', (question) => {
    expect(needsWebSearchHeuristic(question, NOW)).toBe(true)
  })

  it.each([
    'hôm nay là thứ mấy?',
    'mấy giờ rồi',
    'giải thích closure trong JavaScript',
    'viết hàm đảo ngược chuỗi bằng Python',
    'kết quả của phép tính 12 x 7 là gì',
    'recent changes in my own code are failing, why?',
    'Explain how photosynthesis works',
    'Nobel 1999 winner in physics',
    '日本語で自己紹介を書いて',
    '',
  ])('does not search for a stable or self-contained question: %s', (question) => {
    expect(needsWebSearchHeuristic(question, NOW)).toBe(false)
  })
})
