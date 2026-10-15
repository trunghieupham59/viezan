import { isIP } from 'node:net'

const GITHUB_RELEASES_PATH = '/trunghieupham59/viezan/releases'
const MACOS_SCREEN_RECORDING_PREFS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

const ALLOWED_SYSTEM_PREFERENCE_URLS = new Set([
  MACOS_SCREEN_RECORDING_PREFS,
])

const BLOCKED_HOST_SUFFIXES = [
  '.example',
  '.home',
  '.internal',
  '.invalid',
  '.lan',
  '.local',
  '.localhost',
  '.test',
  '.example.com',
  '.example.net',
  '.example.org',
]

const BLOCKED_HOSTS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'localhost',
])

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true

  const [a, b, c] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  )
}

/** Expand an IPv6 literal (optionally with embedded dotted IPv4) into 8 hextets. */
function parseIpv6Hextets(host: string): number[] | null {
  let text = host.split('%')[0]
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (dotted) {
    const octets = dotted.split('.').map((part) => Number.parseInt(part, 10))
    if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null
    const hi = ((octets[0] << 8) | octets[1]).toString(16)
    const lo = ((octets[2] << 8) | octets[3]).toString(16)
    text = `${text.slice(0, -dotted.length)}${hi}:${lo}`
  }

  const halves = text.split('::')
  if (halves.length > 2) return null
  const parse = (part: string): number[] | null => {
    if (!part) return []
    const groups = part.split(':').map((group) => (/^[0-9a-f]{1,4}$/i.test(group) ? Number.parseInt(group, 16) : Number.NaN))
    return groups.some(Number.isNaN) ? null : groups
  }
  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  if (!head || !tail) return null

  if (halves.length === 1) return head.length === 8 ? head : null
  const missing = 8 - head.length - tail.length
  if (missing < 1) return null
  return [...head, ...new Array<number>(missing).fill(0), ...tail]
}

function hextetsToIpv4(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

function isPrivateIpv6(host: string): boolean {
  const hextets = parseIpv6Hextets(host)
  // Unparseable literal: fail closed.
  if (!hextets) return true

  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets
  const firstFiveZero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0

  // :: (unspecified) and ::1 (loopback)
  if (firstFiveZero && h5 === 0 && h6 === 0 && (h7 === 0 || h7 === 1)) return true
  // IPv4-mapped (::ffff:a.b.c.d, which URL normalizes to ::ffff:xxxx:xxxx)
  if (firstFiveZero && h5 === 0xffff) return isPrivateIpv4(hextetsToIpv4(h6, h7))
  // IPv4-compatible (::a.b.c.d, deprecated)
  if (firstFiveZero && h5 === 0) return isPrivateIpv4(hextetsToIpv4(h6, h7))
  // NAT64 well-known prefix 64:ff9b::/96
  if (h0 === 0x64 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
    return isPrivateIpv4(hextetsToIpv4(h6, h7))
  }
  // 6to4 2002::/16 embeds an IPv4 in hextets 1-2
  if (h0 === 0x2002 && isPrivateIpv4(hextetsToIpv4(h1, h2))) return true
  // Documentation 2001:db8::/32
  if (h0 === 0x2001 && h1 === 0x0db8) return true

  return (
    (h0 >= 0xfc00 && h0 <= 0xfdff) ||
    (h0 >= 0xfe80 && h0 <= 0xfebf) ||
    (h0 >= 0xfec0 && h0 <= 0xfeff) ||
    (h0 >= 0xff00 && h0 <= 0xffff)
  )
}

function isBlockedWebHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host) return true

  const ipVersion = isIP(host)
  if (ipVersion === 4) return isPrivateIpv4(host)
  if (ipVersion === 6) return isPrivateIpv6(host)

  if (BLOCKED_HOSTS.has(host)) return true
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true

  return !host.includes('.')
}

export function isAllowedExternalUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (url.protocol === 'x-apple.systempreferences:') {
    return ALLOWED_SYSTEM_PREFERENCE_URLS.has(rawUrl.trim())
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (url.username || url.password) return false

  const host = url.hostname.toLowerCase()
  if (host === 'github.com') {
    const pathname = url.pathname.toLowerCase()
    if (pathname === GITHUB_RELEASES_PATH || pathname.startsWith(`${GITHUB_RELEASES_PATH}/`)) {
      return true
    }
  }

  return !isBlockedWebHost(host)
}
