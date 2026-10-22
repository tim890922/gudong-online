import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * 6 位玩家各用一個瀏覽器 context（等同 6 支手機）從建房打到結算。
 * 只透過畫面操作，驗證整個流程可以在手機尺寸上完成。
 * 設定 E2E_SHOTS=<資料夾> 會在關鍵步驟截圖。
 */

const SHOTS = process.env.E2E_SHOTS

interface Options {
  chips?: boolean
  manual?: boolean
  prefix: string
}

test('six phones play a full game (host tally, random roles)', async ({ browser }) => {
  await playGame(browser, { prefix: '' })
})

test('online chips with public allocations and manual role cards', async ({ browser }) => {
  await playGame(browser, { chips: true, manual: true, prefix: 'chips-' })
})

async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext()
  return context.newPage()
}

function bottomButton(page: Page) {
  // 底部列的第一顆按鈕是主要操作
  return page.locator('.fixed.bottom-0 button').first()
}

async function playGame(browser: Browser, opts: Options) {
  const shot = async (page: Page, name: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${opts.prefix}${name}.png`, fullPage: true })
  }

  const host = await newPhone(browser)
  await host.goto('/')
  await shot(host, '01-home')
  await host.getByPlaceholder('例如：阿明').fill('房主')
  await host.getByRole('button', { name: '建立房間' }).click()
  await expect(host).toHaveURL(/\/r\/[A-Z0-9]{4}$/)
  const code = host.url().split('/').pop()!

  const phones: Page[] = [host]
  for (let i = 1; i < 6; i++) {
    const p = await newPhone(browser)
    await p.goto(`/r/${code}`)
    await p.getByPlaceholder('例如：阿明').fill(`玩家${i}`)
    await p.getByRole('button', { name: '加入', exact: true }).click()
    await expect(p.getByText('等待房主開始遊戲')).toBeVisible()
    phones.push(p)
  }
  await expect(host.getByRole('button', { name: /開始遊戲（6 人）/ })).toBeEnabled()
  if (opts.manual) {
    await host.getByRole('radio', { name: '輸入實體卡' }).click()
    await expect(phones[1].getByText('玩家輸入實體角色卡')).toBeVisible()
  }
  if (opts.chips) {
    await host.getByRole('radio', { name: '每人線上投' }).click()
    await expect(phones[1].getByText(/每人線上投籌碼/)).toBeVisible()
  }
  await shot(host, '02-lobby-host')
  await shot(phones[1], '03-lobby-player')
  await host.getByRole('button', { name: /開始遊戲/ }).click()

  // 角色
  if (opts.manual) {
    for (const p of phones) {
      await expect(p.getByRole('heading', { name: '選擇你的角色卡' })).toBeVisible()
      await p.locator('section[aria-label="角色清單"] button:not([disabled])').first().click()
      await p.getByRole('alertdialog').getByRole('button', { name: '就是這張' }).click()
      await expect(p.getByRole('button', { name: '準備好了' })).toBeEnabled()
      await p.getByRole('button', { name: '準備好了' }).click()
    }
  } else {
    for (const p of phones) await expect(p.getByRole('heading', { name: '確認你的角色' })).toBeVisible()
    await shot(phones[1], '04-roles-hidden')
    const card = phones[1].getByRole('button', { name: '按住查看你的角色' })
    await card.dispatchEvent('pointerdown')
    await shot(phones[1], '05-roles-revealed')
    await card.dispatchEvent('pointerup')
    for (const p of phones) await p.getByRole('button', { name: '準備好了' }).click()
  }

  for (let round = 0; round < 3; round++) {
    // 行動：輪到誰就在誰的手機上操作
    for (let turn = 0; turn < 6; turn++) {
      const actor = await findActor(phones)
      const capture = round === 0 && turn === 0
      if (capture) await shot(actor, '06-turn-identify')
      await playTurn(actor, capture ? shot : null)
    }
    await expect(host.getByRole('button', { name: '開始投票' })).toBeVisible()
    if (round === 0) await shot(host, '09-discussion')
    await host.getByRole('button', { name: '開始投票' }).click()

    if (opts.chips) {
      // 先讓每個人都分配好，再依序送出：別人送出時，自己分配到一半的籌碼不能被清掉
      const spends: number[] = []
      for (const [i, p] of phones.entries()) {
        await expect(p.getByText(/你有 \d+ 枚籌碼/)).toBeVisible()
        const plus = p.getByRole('button', { name: /加一$/ })
        // 第三回合要全部投完；前兩回合每人投 2 枚
        const spend = round === 2 ? Number((await p.getByText(/你有 \d+ 枚籌碼/).textContent())!.match(/你有 (\d+)/)![1]) : 2
        for (let k = 0; k < spend; k++) await plus.nth((i + k) % 4).click()
        spends.push(spend)
        if (round === 0 && i === 0) await shot(p, '10-chips-vote')
      }
      for (const [i, p] of phones.entries()) {
        await expect(p.getByText(`已投票 ${i} / 6`)).toBeVisible()
        await expect(p.getByText(new RegExp(`已分配 ${spends[i]} 枚`))).toBeVisible()
        await p.getByRole('button', { name: '送出投票' }).click()
        await p.getByRole('alertdialog').getByRole('button', { name: '送出' }).click()
        // 最後一位送出後直接進入投票結果
        if (i < phones.length - 1) await expect(p.getByText('你已經投票了')).toBeVisible()
      }
      await expect(host.getByRole('heading', { name: '誰投給誰' })).toBeVisible()
    } else {
      const plus = host.getByRole('button', { name: /加一$/ })
      await plus.nth(0).click()
      await plus.nth(0).click()
      await plus.nth(1).click()
      if (round === 0) await shot(host, '10-host-vote')
      await host.getByRole('button', { name: '送出投票' }).click()
      await host.getByRole('alertdialog').getByRole('button', { name: '送出' }).click()
    }
    await expect(host.getByText('入選，真假不公開')).toBeVisible()
    if (round === 0) await shot(host, '11-vote-result')
    await host.getByRole('button', { name: round < 2 ? '開始下一回合' : '進入鑑人' }).click()
  }

  // 鑑人：每人投第一個可以投的人
  for (const p of phones) {
    await expect(p.getByRole('heading', { name: '鑑人' })).toBeVisible()
    await p.locator('main ul.grid button:not([disabled])').first().click()
    await p.getByRole('button', { name: /^指認/ }).click()
    await p.getByRole('alertdialog').getByRole('button', { name: '送出' }).click()
  }
  for (const p of phones) await expect(p.getByText(/獲勝$/)).toBeVisible()
  await shot(host, '12-result')
}

async function findActor(phones: Page[]): Promise<Page> {
  for (let attempt = 0; attempt < 50; attempt++) {
    for (const p of phones) {
      if (await p.getByRole('list', { name: '行動步驟' }).isVisible()) return p
    }
    await phones[0].waitForTimeout(100)
  }
  throw new Error('找不到正在行動的玩家')
}

type Shot = (page: Page, name: string) => Promise<void>

async function playTurn(p: Page, shot: Shot | null) {
  const seals = p.locator('section.bg-paper [aria-hidden="true"].font-display')
  // 鑑定：一直選第一個可以按的目標直到完成
  for (let i = 0; i < 4; i++) {
    if (await p.getByRole('button', { name: '下一步' }).isVisible()) break
    await p
      .locator('section.bg-paper button[aria-pressed]:not([disabled]), section.bg-paper ul button:not([disabled])')
      .first()
      .click()
    const before = await seals.count()
    await bottomButton(p).click()
    // 等印章出現（或進入「下一步」）再繼續
    await expect
      .poll(async () => (await p.getByRole('button', { name: '下一步' }).isVisible()) || (await seals.count()) > before)
      .toBe(true)
  }
  if (shot) {
    await shot(p, '07-turn-result')
    // 行動到一半重新整理：身分與進度都要回來
    await p.reload()
    await expect(p.getByRole('button', { name: '下一步' })).toBeVisible()
  }
  await p.getByRole('button', { name: '下一步' }).click()

  // 技能：一律不使用
  await expect(p.getByRole('heading', { name: '使用技能' })).toBeVisible()
  const skip = p.getByRole('button', { name: /^(繼續|這回合不使用)$/ })
  if (await skip.isVisible()) {
    await skip.click()
  } else {
    // 老朝奉只有發動／不發動
    await p.getByRole('button', { name: '不發動' }).click()
    await bottomButton(p).click()
    await p.getByRole('alertdialog').getByRole('button', { name: '確定' }).click()
  }

  // 交棒
  await expect(p.getByRole('heading', { name: /交給下一位|最後一位/ })).toBeVisible()
  if (shot) await shot(p, '08-turn-pass')
  const last = p.getByRole('button', { name: '結束行動，開始討論' })
  if (await last.isVisible()) {
    await last.click()
    return
  }
  await p.locator('section.bg-paper .grid button').first().click()
  await bottomButton(p).click()
  await p.getByRole('alertdialog').getByRole('button', { name: '交棒' }).click()
  await expect(p.getByRole('list', { name: '行動步驟' })).toBeHidden()
}
