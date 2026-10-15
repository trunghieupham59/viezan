// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isAllowedExternalUrl } from '../externalUrl'

describe('isAllowedExternalUrl', () => {
  it('allows ordinary public https URLs and the GitHub releases page', () => {
    expect(isAllowedExternalUrl('https://example.org.evil.io/page')).toBe(true)
    expect(isAllowedExternalUrl('https://github.com/trunghieupham59/viezan/releases/latest')).toBe(true)
    expect(isAllowedExternalUrl('https://[2606:4700:4700::1111]/')).toBe(true)
  })

  it('rejects non-web protocols, credentials and junk', () => {
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('https://user:pw@evil.io/')).toBe(false)
    expect(isAllowedExternalUrl('not a url')).toBe(false)
    expect(isAllowedExternalUrl('')).toBe(false)
    expect(isAllowedExternalUrl(undefined as unknown as string)).toBe(false)
  })

  it('rejects private, loopback and local IPv4 hosts', () => {
    for (const host of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '0.0.0.0']) {
      expect(isAllowedExternalUrl(`http://${host}/`)).toBe(false)
    }
    expect(isAllowedExternalUrl('http://localhost:3000/')).toBe(false)
    expect(isAllowedExternalUrl('http://printer.local/')).toBe(false)
  })

  it('rejects IPv6 loopback, unspecified and unique-local addresses', () => {
    for (const host of ['[::1]', '[::]', '[fc00::1]', '[fd12:3456::1]', '[fe80::1]', '[ff02::1]']) {
      expect(isAllowedExternalUrl(`http://${host}/`)).toBe(false)
    }
  })

  it('rejects IPv4-mapped IPv6 literals that URL normalizes to hex form', () => {
    // new URL('http://[::ffff:127.0.0.1]/').hostname === '[::ffff:7f00:1]'
    for (const url of [
      'http://[::ffff:7f00:1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:a00:1]/',
      'http://[::ffff:c0a8:101]/',
      'http://[::ffff:ac10:1]/',
      'http://[::ffff:a9fe:a9fe]/',
      'http://[0:0:0:0:0:ffff:7f00:1]/',
      'http://[::ffff:0:0]/',
    ]) {
      expect(isAllowedExternalUrl(url), url).toBe(false)
    }
  })

  it('allows IPv4-mapped IPv6 literals that wrap a public IPv4 address', () => {
    expect(isAllowedExternalUrl('http://[::ffff:808:808]/')).toBe(true)
  })

  it('rejects other IPv6 forms that embed private IPv4 addresses', () => {
    expect(isAllowedExternalUrl('http://[64:ff9b::7f00:1]/')).toBe(false)
    expect(isAllowedExternalUrl('http://[2002:7f00:1::]/')).toBe(false)
    expect(isAllowedExternalUrl('http://[::7f00:1]/')).toBe(false)
  })

  it('allows only the macOS screen recording settings deep link', () => {
    expect(isAllowedExternalUrl('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')).toBe(true)
    expect(isAllowedExternalUrl('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera')).toBe(false)
  })
})
