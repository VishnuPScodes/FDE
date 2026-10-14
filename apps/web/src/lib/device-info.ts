/**
 * Collect device and browser info for login event logging (R4).
 * All data comes from browser APIs — never sent to third parties.
 */
export interface DeviceInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: 'desktop' | 'tablet' | 'mobile';
  deviceModel: string;
  screenW: number;
  screenH: number;
  dpr: number;
  viewportW: number;
  viewportH: number;
  language: string;
  timezone: string;
  touch: boolean;
  userAgentRaw: string;
}

export function collectDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const parsed = parseUserAgent(ua);

  return {
    browser: parsed.browser,
    browserVersion: parsed.browserVersion,
    os: parsed.os,
    osVersion: parsed.osVersion,
    deviceType: getDeviceType(),
    deviceModel: getDeviceModel(),
    screenW: screen.width,
    screenH: screen.height,
    dpr: window.devicePixelRatio || 1,
    viewportW: window.innerWidth,
    viewportH: window.innerHeight,
    language: navigator.language || 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    userAgentRaw: ua,
  };
}

function getDeviceType(): 'desktop' | 'tablet' | 'mobile' {
  const ua = navigator.userAgent.toLowerCase();
  // Check User-Agent Client Hints first (Chrome/Edge)
  const mobile =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).userAgentData?.mobile === true;
  if (mobile) return 'mobile';

  // Fallback to UA string
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) return 'mobile';
  return 'desktop';
}

function getDeviceModel(): string {
  // Try User-Agent Client Hints (Chrome 90+)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uaData = (navigator as any).userAgentData;
  if (uaData) {
    // Low-entropy hints available synchronously
    return uaData.platform || '';
  }
  // Fallback: extract from UA string
  const ua = navigator.userAgent;
  const match =
    ua.match(/\((.*?)\)/) ?? [];
  return match[1]?.split(';')[0]?.trim() ?? '';
}

interface ParsedUA {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
}

function parseUserAgent(ua: string): ParsedUA {
  let browser = 'Unknown';
  let browserVersion = '';
  let os = 'Unknown';
  let osVersion = '';

  // Browser detection
  if (ua.includes('Edg/')) {
    browser = 'Edge';
    browserVersion = ua.match(/Edg\/([\d.]+)/)?.[1] ?? '';
  } else if (ua.includes('Chrome/') && !ua.includes('Chromium/')) {
    browser = 'Chrome';
    browserVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] ?? '';
  } else if (ua.includes('Firefox/')) {
    browser = 'Firefox';
    browserVersion = ua.match(/Firefox\/([\d.]+)/)?.[1] ?? '';
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    browser = 'Safari';
    browserVersion = ua.match(/Version\/([\d.]+)/)?.[1] ?? '';
  }

  // OS detection
  if (ua.includes('Windows NT')) {
    os = 'Windows';
    const ntVersion = ua.match(/Windows NT ([\d.]+)/)?.[1] ?? '';
    const windowsVersionMap: Record<string, string> = {
      '10.0': '10/11',
      '6.3': '8.1',
      '6.2': '8',
      '6.1': '7',
    };
    osVersion = windowsVersionMap[ntVersion] ?? ntVersion;
  } else if (ua.includes('Mac OS X')) {
    os = 'macOS';
    osVersion = ua.match(/Mac OS X ([\d_.]+)/)?.[1]?.replace(/_/g, '.') ?? '';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
    if (ua.includes('Android')) {
      os = 'Android';
      osVersion = ua.match(/Android ([\d.]+)/)?.[1] ?? '';
    }
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
    osVersion = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') ?? '';
  } else if (ua.includes('CrOS')) {
    os = 'ChromeOS';
  }

  return { browser, browserVersion, os, osVersion };
}
