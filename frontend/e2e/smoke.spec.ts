/**
 * Phase 2 端到端验收。
 *
 * 后端需先跑起来（scripts\start-backend.ps1），三套剧本全部走 Mock。
 * 每个用例都会收集 console 错误与未捕获异常，任何一条都判失败——
 * P2-6 要求「三套剧本全流程无 console 报错」，靠肉眼看控制台不可靠。
 */

import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

const SHOTS = 'e2e/screenshots'

/** 收集 console.error 与 pageerror，返回一个可在断言时读取的数组。 */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

/** 等一轮回答结束：阶段时间线出现「合计」即代表收到 done 事件。 */
async function waitForDone(page: Page) {
  await expect(page.locator('.stage.total').last()).toBeVisible({ timeout: 40_000 })
}

/**
 * 整页不该出现滚动条：三列各自内部滚动，头部与输入区必须始终可见。
 * 曾因 antd <App> 多插一层 div 截断 height:100% 继承链而退化过，故留作回归断言。
 */
async function expectNoDocumentScroll(page: Page) {
  const overflowing = await page.evaluate(() => {
    const root = document.scrollingElement!
    return root.scrollHeight > root.clientHeight
  })
  expect(overflowing, '整页出现了纵向滚动条').toBe(false)
}

async function newConversation(page: Page) {
  await page.getByRole('button', { name: /新建会话/ }).click()
  await expect(page.locator('.message-scroll .state-title')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.app-title')).toBeVisible()
})

test('布局与后端连通', async ({ page }) => {
  const errors = watchErrors(page)

  await expect(page.locator('.panel')).toHaveCount(3)
  await expect(page.locator('.dot.ok')).toBeVisible()
  await expect(page.locator('.health')).toContainText('Mock 数据')
  await expect(page.locator('.message-scroll .state-title')).toContainText('用自然语言问一个数据问题')
  await expect(page.locator('.chart-area .state-title')).toContainText('还没有图表')

  await expectNoDocumentScroll(page)
  await page.screenshot({ path: `${SHOTS}/01-empty.png`, fullPage: false })
  expect(errors).toEqual([])
})

test('剧本一：分类聚合出柱状图', async ({ page }) => {
  const errors = watchErrors(page)
  await newConversation(page)

  await page.getByRole('button', { name: '各品类销售额' }).click()

  // 流式期间应能看到中止按钮
  await expect(page.getByRole('button', { name: '中止' })).toBeVisible()
  await waitForDone(page)

  await expect(page.locator('.sql-block')).toHaveCount(1)
  await expect(page.locator('.result-meta').first()).toContainText('2 列 × 6 行')
  await expect(page.locator('.chart-area canvas')).toBeVisible()
  await expect(page.locator('.summary')).toContainText('数码')
  await expect(page.locator('.panel-head').nth(2)).toContainText('柱状图')

  await page.screenshot({ path: `${SHOTS}/02-bar.png` })
  expect(errors).toEqual([])
})

test('剧本二：时序趋势出折线图', async ({ page }) => {
  const errors = watchErrors(page)
  await newConversation(page)

  await page.getByRole('button', { name: '近一年趋势' }).click()
  await waitForDone(page)

  await expect(page.locator('.result-meta').first()).toContainText('2 列 × 12 行')
  await expect(page.locator('.chart-area canvas')).toBeVisible()
  await expect(page.locator('.panel-head').nth(2)).toContainText('折线图')

  await page.screenshot({ path: `${SHOTS}/03-line.png` })
  expect(errors).toEqual([])
})

test('剧本三：SQL 报错后自动重试并出图', async ({ page }) => {
  const errors = watchErrors(page)
  await newConversation(page)

  await page.getByRole('button', { name: '区域排名' }).click()
  await waitForDone(page)

  // 两次 SQL 尝试，第一次带失败标记
  await expect(page.locator('.sql-block')).toHaveCount(2)
  await expect(page.locator('.sql-badge')).toHaveCount(1)
  await expect(page.locator('.sql-badge')).toContainText('执行失败，已重试')
  await expect(page.locator('.sql-error')).toContainText('no such column: o.amount')

  // 可恢复错误不应让整条消息进入失败态
  await expect(page.locator('.state-block.error')).toHaveCount(0)
  await expect(page.locator('.chart-area canvas')).toBeVisible()

  await expectNoDocumentScroll(page)
  await page.screenshot({ path: `${SHOTS}/04-retry.png` })
  expect(errors).toEqual([])
})

test('切换图表类型基于本地数据重算', async ({ page }) => {
  const errors = watchErrors(page)
  await newConversation(page)

  await page.getByRole('button', { name: '各品类销售额' }).click()
  await waitForDone(page)

  const requestsAfterSwitch: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requestsAfterSwitch.push(request.url())
  })

  for (const label of ['折线图', '饼图', '散点图']) {
    await page.locator('.chart-toolbar').getByText(label, { exact: true }).click()
    await expect(page.locator('.chart-area canvas')).toBeVisible()
    await expect(page.locator('.panel-head').nth(2)).toContainText(label)
  }

  await page.screenshot({ path: `${SHOTS}/05-pie.png` })

  // 切表格视图
  await page.locator('.chart-toolbar').getByText('表格', { exact: true }).click()
  await expect(page.locator('.chart-area .result-table')).toBeVisible()

  // 关键断言：整个切换过程一次后端请求都不该发出
  expect(requestsAfterSwitch).toEqual([])
  expect(errors).toEqual([])
})

test('会话增删改与历史图表回看', async ({ page }) => {
  const errors = watchErrors(page)

  await newConversation(page)
  await page.getByRole('button', { name: '各品类销售额' }).click()
  await waitForDone(page)

  // 首次提问后会话应自动按问题命名
  await expect(page.locator('.session-item.active .session-title')).toContainText('各品类')

  // 同一会话里再问一次，右侧出现历史图表切换条
  await page.getByRole('button', { name: '近一年趋势' }).click()
  await waitForDone(page)
  await expect(page.locator('.history-chip')).toHaveCount(2)

  await page.locator('.history-chip').first().click()
  await expect(page.locator('.history-chip.active')).toHaveCount(1)
  await expect(page.locator('.chart-area canvas')).toBeVisible()

  await page.screenshot({ path: `${SHOTS}/06-history.png` })

  // 重命名
  const active = page.locator('.session-item.active')
  await active.hover()
  await active.locator('.icon-button', { hasText: '✎' }).click()
  await page.locator('.session-item input').fill('重命名后的会话')
  await page.locator('.session-item input').press('Enter')
  await expect(page.locator('.session-item.active .session-title')).toHaveText('重命名后的会话')

  // 删除（二次确认）
  const before = await page.locator('.session-item').count()
  await active.hover()
  await active.locator('.icon-button.danger').click()
  await page.getByRole('button', { name: '删除' }).click()
  await expect(page.locator('.session-item')).toHaveCount(before - 1)

  expect(errors).toEqual([])
})

test('中止流式回答', async ({ page }) => {
  const errors = watchErrors(page)
  await newConversation(page)

  await page.getByRole('button', { name: '区域排名' }).click()
  await page.getByRole('button', { name: '中止' }).click()

  await expect(page.locator('.state-block').filter({ hasText: '已中止' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重新提问' })).toBeEnabled()

  // 中止不应留下未捕获异常
  expect(errors).toEqual([])
})
