import { chromium } from 'playwright'
import { bench } from '../tests/helpers.mjs'
import { startServer } from '../apps/api/server.mjs'
const b = await bench()
const app = await startServer(b.service)
let browser, page
try {
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1200, height: 850 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(app.origin)
  await page.getByRole('heading', { name: 'Chief', exact: true }).waitFor()
  await page.getByLabel('Message', { exact: true }).fill('read note')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByText('Approval required', { exact: true }).waitFor()
  await page.locator('#approvals select').selectOption('allow_once')
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await page.getByText('Shared note: this workspace belongs only to this conversation participant.', { exact: true }).waitFor()
  await page.reload()
  await page.getByText('Shared note: this workspace belongs only to this conversation participant.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Team', exact: true }).click()
  await page.getByLabel('Message', { exact: true }).fill('prepare a report')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByText('Chief summary: the worker returned a result.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Chief', exact: true }).click()
  await page.getByLabel('Message', { exact: true }).fill('hang')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.locator('#stop:enabled').waitFor()
  await page.getByRole('button', { name: 'Stop current exchange' }).click()
  await page.getByText('reply · cancelled', { exact: true }).waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Mobile layout overflows horizontally')
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('PASS browser: approval, persisted reload, group exchange, cancellation, mobile layout; no page errors')
} finally { await browser?.close(); await app.close(); await b.close() }
