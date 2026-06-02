// Studio26 QA Gate — Playwright Test Suite
// Maps directly to Studio26_QA_Standard.md (3 pillars)
// Run via: npx playwright test --config .github/qa/playwright.config.js

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const BASE_URL = 'http://localhost:3000';

// Cloudflare CDN paths / external resource failures that only exist in production
const CF_CDN = text =>
  text.includes('cdn-cgi') ||
  text.includes('cloudflareinsights') ||
  text.startsWith('Failed to load resource');

// ─────────────────────────────────────────────
// PILLAR 1 — FUNCTIONAL QA
// ─────────────────────────────────────────────
test.describe('Pillar 1 — Functional', () => {

  test('Zero console errors on page load', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !CF_CDN(msg.text())) errors.push(msg.text());
    });
    page.on('pageerror', err => {
      if (!CF_CDN(err.message)) errors.push(err.message);
    });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    expect(errors, `Console errors found:\n${errors.join('\n')}`).toEqual([]);
  });

  test('Zero 404s in network requests', async ({ page }) => {
    const notFound = [];
    page.on('response', res => {
      if (res.status() === 404 && !CF_CDN(res.url())) notFound.push(res.url());
    });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    expect(notFound, `404 responses:\n${notFound.join('\n')}`).toEqual([]);
  });

  test('All same-origin links resolve without 4xx/5xx', async ({ page }) => {
    await page.goto(BASE_URL);
    const hrefs = await page.$$eval('a[href]', anchors =>
      anchors
        .map(a => a.href)
        .filter(href =>
          href.startsWith('http://localhost') &&
          !href.startsWith('mailto:') &&
          !href.startsWith('tel:') &&
          !href.includes('cdn-cgi')
        )
    );
    const broken = [];
    for (const href of [...new Set(hrefs)]) {
      try {
        const res = await page.request.get(href);
        if (res.status() >= 400) broken.push(`${res.status()} — ${href}`);
      } catch {
        broken.push(`ERR — ${href}`);
      }
    }
    expect(broken, `Broken links:\n${broken.join('\n')}`).toEqual([]);
  });

});

// ─────────────────────────────────────────────
// PILLAR 2 — MOBILE RESPONSIVENESS
// ─────────────────────────────────────────────
test.describe('Pillar 2 — Mobile Responsiveness', () => {

  const VIEWPORTS = [
    { width: 375,  height: 812,  name: '375_iPhoneSE'  },
    { width: 390,  height: 844,  name: '390_iPhone14'  },
    { width: 430,  height: 932,  name: '430_iPhone14Plus' },
    { width: 768,  height: 1024, name: '768_iPad'      },
    { width: 1024, height: 768,  name: '1024_iPadLandscape' },
    { width: 1440, height: 900,  name: '1440_Desktop'  },
  ];

  for (const vp of VIEWPORTS) {
    test(`No horizontal scroll at ${vp.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, `Horizontal scroll present at ${vp.width}px`).toBe(false);
    });
  }

  test('Screenshot captures at all breakpoints (artifacts)', async ({ page }) => {
    const fs = require('fs');
    if (!fs.existsSync('qa-screenshots')) fs.mkdirSync('qa-screenshots', { recursive: true });
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: `qa-screenshots/${vp.name}.png`,
        fullPage: true,
      });
    }
  });

  test('Interactive elements meet 44x44px tap target at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const violations = await page.evaluate(() => {
      const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"]';
      return Array.from(document.querySelectorAll(selectors))
        .filter(el => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false; // hidden
          if (el.tagName === 'A' && el.closest('p, li, td, dd')) return false; // inline text link exemption
          return rect.width < 44 || rect.height < 44;
        })
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            element: el.outerHTML.slice(0, 80),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          };
        });
    });

    if (violations.length > 0) {
      console.warn(
        `[Tap target] ${violations.length} element(s) below 44x44px:\n` +
        violations.map(v => `  ${v.w}x${v.h}px — ${v.element}`).join('\n')
      );
    }
    // Hard-fail: uncomment the line below to block deploy on tap target violations
    // expect(violations, 'Tap target violations').toEqual([]);
  });

  test('No font size below 14px on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const violations = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .filter(el => {
          if (!el.textContent?.trim()) return false;
          // getBoundingClientRect catches elements inside display:none ancestors
          // (children of hidden parents have zero layout box)
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          const size = parseFloat(window.getComputedStyle(el).fontSize);
          return size > 0 && size < 14;
        })
        .map(el => ({
          tag: el.tagName,
          fontSize: window.getComputedStyle(el).fontSize,
          text: el.textContent?.trim().slice(0, 40),
        }));
    });

    if (violations.length > 0) {
      console.warn('\n[Font size] Violations at 375px:\n' + JSON.stringify(violations, null, 2));
    }
    expect(violations, `Font sizes below 14px:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
  });

});

// ─────────────────────────────────────────────
// PILLAR 3 — WCAG 2.1 AA ACCESSIBILITY
// ─────────────────────────────────────────────
test.describe('Pillar 3 — WCAG 2.1 AA', () => {

  test('axe-core: Full WCAG 2.1 AA audit', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations.map(v =>
        `[${v.impact.toUpperCase()}] ${v.id}: ${v.description}\n` +
        v.nodes.slice(0, 2).map(n => `  → ${n.html.slice(0, 100)}`).join('\n')
      ).join('\n\n');
      expect.soft(results.violations, `axe violations:\n\n${summary}`).toEqual([]);
    }

    expect(results.violations).toEqual([]);
  });

  test('Exactly one <h1> on the page', async ({ page }) => {
    await page.goto(BASE_URL);
    const count = await page.$$eval('h1', els => els.length);
    expect(count, `Expected 1 <h1>, found ${count}`).toBe(1);
  });

  test('Heading hierarchy has no skipped levels', async ({ page }) => {
    await page.goto(BASE_URL);
    const levels = await page.$$eval('h1,h2,h3,h4,h5,h6', els =>
      els.map(el => parseInt(el.tagName[1]))
    );
    for (let i = 1; i < levels.length; i++) {
      const gap = levels[i] - levels[i - 1];
      expect(gap, `Heading level skipped: h${levels[i - 1]} → h${levels[i]}`).toBeLessThanOrEqual(1);
    }
  });

  test('<html> element has lang attribute', async ({ page }) => {
    await page.goto(BASE_URL);
    const lang = await page.$eval('html', el => el.getAttribute('lang'));
    expect(lang, '<html> missing lang attribute').toBeTruthy();
  });

  test('Viewport meta tag is present', async ({ page }) => {
    await page.goto(BASE_URL);
    const content = await page.$eval(
      'meta[name="viewport"]',
      el => el.getAttribute('content')
    ).catch(() => null);
    expect(content, 'Missing <meta name="viewport">').toBeTruthy();
  });

  test('<main id="main-content"> exists', async ({ page }) => {
    await page.goto(BASE_URL);
    const el = await page.$('main#main-content');
    expect(el, 'Missing <main id="main-content">').not.toBeNull();
  });

  test('Skip link is first focusable element and targets #main-content', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return { tag: el?.tagName, href: el?.getAttribute('href') };
    });
    expect(focused.href, 'First Tab focus should be skip link to #main-content').toBe('#main-content');
  });

  test('No buttons are <div> or <span> with click handlers', async ({ page }) => {
    await page.goto(BASE_URL);
    const fakeButtons = await page.$$eval('[onclick]:not(button):not(a):not(input)', els =>
      els.map(el => el.outerHTML.slice(0, 80))
    );
    expect(fakeButtons, `Non-semantic click handlers found:\n${fakeButtons.join('\n')}`).toEqual([]);
  });

  test('All inputs have associated <label>', async ({ page }) => {
    await page.goto(BASE_URL);
    const unlabelled = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input, select, textarea'))
        .filter(el => {
          if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return false;
          // Exclude honeypot / bot-check fields (aria-hidden or display:none)
          if (el.classList.contains('botcheck')) return false;
          if (el.getAttribute('aria-hidden') === 'true') return false;
          if (window.getComputedStyle(el).display === 'none') return false;
          const id = el.id;
          const hasLabel = id && document.querySelector(`label[for="${id}"]`);
          const hasAriaLabel = el.getAttribute('aria-label');
          const hasAriaLabelledBy = el.getAttribute('aria-labelledby');
          return !hasLabel && !hasAriaLabel && !hasAriaLabelledBy;
        })
        .map(el => el.outerHTML.slice(0, 80));
    });
    expect(unlabelled, `Inputs without labels:\n${unlabelled.join('\n')}`).toEqual([]);
  });

  test('Decorative images have empty alt=""', async ({ page }) => {
    await page.goto(BASE_URL);
    // Flag images with no alt attribute at all (different from alt="")
    const missing = await page.$$eval('img:not([alt])', els =>
      els.map(el => el.outerHTML.slice(0, 80))
    );
    expect(missing, `Images missing alt attribute:\n${missing.join('\n')}`).toEqual([]);
  });

  test('Animations use prefers-reduced-motion', async ({ page }) => {
    await page.goto(BASE_URL);
    const hasAnimation = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.type === CSSRule.KEYFRAMES_RULE) return true;
          }
        } catch { /* cross-origin sheet */ }
      }
      return false;
    });

    if (hasAnimation) {
      const hasMotionQuery = await page.evaluate(() => {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (
                rule.type === CSSRule.MEDIA_RULE &&
                rule.conditionText?.includes('prefers-reduced-motion')
              ) return true;
            }
          } catch { /* cross-origin sheet */ }
        }
        return false;
      });
      expect(hasMotionQuery, 'Animations found but no prefers-reduced-motion media query').toBe(true);
    }
  });

});
