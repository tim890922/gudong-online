# 古董局中局 多人手機輔助

面對面玩《古董局中局》桌遊時，每個人用自己的手機加入同一個房間：鑑定獸首、使用技能、投票、鑑人，最後自動計分。不用註冊，房主建房後把 4 碼房號或 QR code 給大家就能加入。

> 粉絲製作的非官方工具。遊戲規則參考自 [pride829/gudong](https://github.com/pride829/gudong)（單機傳手機版），本專案以 TypeScript／Vue 重新實作，跑在 Cloudflare Workers 上；另有一份功能相同的 Python 後端可以自己架。

## 功能

- **房間**：建房、房號／QR code／分享連結加入、選座位顏色、房主踢人與移交房主、同一批人再來一局
- **斷線不怕**：每人的身分存在瀏覽器裡，重新整理、鎖屏、斷網回來會自動重連；房間狀態存在伺服器的資料庫裡，重新部署或重啟也能接著玩
- **隱藏資訊**：伺服器只把「公開資訊＋你自己的資訊」送到你的手機，私密內容要按住才顯示
- **角色分配**：房主可選「系統隨機發」或「輸入實體角色卡」
- **鑑寶投票**：房主輸入總票數，或每人線上投籌碼（公開誰投給誰）
- **粉絲角色**：大眼賊、藥來、劉局、魔藥不然
- 輪到你時手機震動、遊戲中螢幕保持常亮（需 HTTPS）、可加到主畫面

## 技術

| | |
|---|---|
| 前端 | Vue 3、Vite、TypeScript、Pinia、Vue Router、Tailwind CSS v4 |
| 後端（線上版） | Cloudflare Workers ＋ Durable Objects（TypeScript、WebSocket hibernation、SQLite storage） |
| 後端（自架版） | Python 3.13、FastAPI、uvicorn（原生 WebSocket）、SQLite |
| 套件管理 | npm、uv（Python 虛擬環境） |
| 部署 | Cloudflare Workers 免費方案；或 Docker ＋ Cloudflare Tunnel 自架 |

```
cloudflare/src/
  engine/      規則引擎（TypeScript，和 backend/app/engine 逐行對應）
  room.ts      房間的 Durable Object：WebSocket、存檔、閒置清房
  index.ts     Worker 入口：REST、把 WebSocket 轉給房間、其餘交給前端靜態檔
backend/app/
  engine/      規則引擎（純 Python，不依賴 FastAPI）
    game.py    所有玩家操作：大廳、角色、鑑定、技能、投票、鑑人
    views.py   把完整狀態投影成「某位玩家看得到的內容」← 防止資訊外洩的唯一關口
    scoring.py 計分
  rooms.py     房間管理：每房一把鎖、WebSocket 廣播、SQLite 保存、閒置清房
  api.py       REST：建房、加入、房間摘要、靜態資料
  main.py      FastAPI app、WebSocket 端點、SPA fallback
frontend/src/
  views/       首頁、房間頁、規則頁
  components/  大廳、各遊戲階段畫面、共用元件
  stores/room.ts  WebSocket 連線（自動重連＋心跳）與伺服器狀態
```

## 本機開發

需要 Node.js 22.12 以上。

```bash
# 後端（Cloudflare Worker，本機用 workerd 模擬）
cd frontend && npm install && npm run build    # Worker 會 serve frontend/dist
cd cloudflare && npm install
npm run dev        # http://localhost:8787

# 前端熱更新（另開一個終端機）
cd frontend
BACKEND_URL=http://localhost:8787 npm run dev   # http://localhost:5173
```

要跑 Python 版後端的話，另外需要 [uv](https://docs.astral.sh/uv/)：

```bash
# 後端（Python 虛擬環境）
cd backend
uv venv            # 建立 .venv（uv 會自動下載 Python 3.13）
uv sync            # 依 uv.lock 安裝，含測試套件
uv run uvicorn app.main:app --reload --port 8000

# 前端（另開一個終端機）
cd frontend
npm install
npm run dev        # http://localhost:5173，/api 和 /ws 會 proxy 到 8000
```

不想用 uv 的話：`python3.13 -m venv .venv && source .venv/bin/activate && pip install fastapi "uvicorn[standard]" pydantic pytest httpx2`。

用手機連開發機測試：`npm run dev` 已經監聽所有網卡，手機連同一個 Wi-Fi 後打開 `http://<電腦 IP>:5173`。

## 測試

```bash
# Worker：規則、計分、資訊洩漏（隨機機器人打完整局），以及在本機 workerd 跑的 REST／WebSocket 流程
cd frontend && npm run build
cd cloudflare && npm test && npm run typecheck

# Python 版
cd backend && uv run pytest && uv run ruff check .

# 端對端：6 支模擬手機從建房打到結算（兩種投票模式、兩種角色分配）
cd cloudflare && npm run dev &                                   # 或 Python 版的 uvicorn（port 8000）
cd frontend && npx playwright install chromium
E2E_BASE_URL=http://localhost:8787 npx playwright test
E2E_BASE_URL=https://<你的網址> npx playwright test --timeout=420000   # 也可以直接測線上版
```

**規則引擎有兩份**（`cloudflare/src/engine` 和 `backend/app/engine`），改規則時兩邊要一起改，兩邊的測試也要一起改。

## 部署到 Cloudflare（免費方案）

網址是 `https://gudong-online.<你的子網域>.workers.dev`。前端是 Workers 的靜態資源（不算請求數），每個房間是一個 Durable Object。

```bash
cd frontend && npm run build
cd cloudflare
export CLOUDFLARE_ACCOUNT_ID=<帳戶 ID>
export CLOUDFLARE_API_TOKEN=<API token>   # 或改用 npx wrangler login
npm run deploy
npx wrangler tail                         # 看即時 log
```

- 免費方案每天 10 萬次請求，Durable Object 另有每天 10 萬次寫入的額度。一局大約幾百次，同時開很多桌也用不完。前端的心跳由 Cloudflare 直接回覆，不吵醒 Durable Object，也不算額度。
- 房間閒置 12 小時（`wrangler.jsonc` 的 `ROOM_TTL_HOURS`）後由 alarm 清除。重新部署不會影響進行中的房間，連線會自動重連。
- 要用自己的網域時，在 Cloudflare 後台幫 Worker 加 Custom Domain，並把 `PUBLIC_BASE_URL` 設成那個網址（影響邀請連結和 QR code）。

## 自架：用 Docker 跑 Python 版

```bash
cp .env.example .env
docker compose up -d --build      # http://localhost:8000
docker compose logs -f app
```

資料存在 `gudong-data` volume。只能跑單一 worker（房間狀態在記憶體裡），這個規模同時開好幾桌都沒問題。

## 自架版對外公開（Cloudflare Tunnel）

### 方式一：Named Tunnel（固定網址，推薦）

需要一個放在 Cloudflare 的網域。

1. Cloudflare 後台 → Zero Trust → Networks → Tunnels → Create a tunnel → 選 Cloudflared
2. 複製 token，填到 `.env` 的 `TUNNEL_TOKEN`
3. 在 tunnel 的 Public Hostname 新增一個主機名稱（例如 `gudong.example.com`），Service 填 `http://app:8000`
4. `.env` 設定 `PUBLIC_BASE_URL=https://gudong.example.com`
5. `docker compose --profile tunnel up -d`

### 方式二：Quick Tunnel（免網域，測試用）

```bash
docker compose up -d
docker compose run --rm cloudflared tunnel --url http://app:8000
```

終端機會印出一個隨機的 `https://xxxx.trycloudflare.com` 網址，每次重啟都會變。

### 方式三：純區網

大家連同一個 Wi-Fi，`.env` 設 `PUBLIC_BASE_URL=http://<主機 IP>:8000`，QR code 就會指向區網網址。沒有 HTTPS 時，螢幕常亮和分享按鈕會自動停用，其餘功能正常。

**WSL2 使用者**：要讓區網手機連進來，請用 Docker Desktop（記得在 Settings → Resources → WSL integration 開啟你的發行版），或在 `%UserProfile%\.wslconfig` 加上 `networkingMode=mirrored`，並在 Windows 防火牆開放 8000 port。走 Tunnel 不受影響。

## 規則說明

規則以原 app 的實際行為為準，以下幾點有調整：

- **找出老朝奉**：原 app 只要有人達到門檻票數就算（多人達標時取最後一位）。這裡改成「得票最多且唯一，並超過許願陣營人數一半」，門檻在 `app/engine/scoring.py`。
- **劉局的鑑人投票**：原 app 禁止劉局投給許願和方震兩人，等於透露了另一人的身分。這裡只禁止投給劉局知道的那一位。
- **投票同分**：依十二生肖順序決定名次。
- **線上籌碼**：每人每回合 2 枚，沒用完的累積到下回合，第三回合必須全部投完。

## 授權

本專案的程式碼以 [MIT](LICENSE) 授權釋出，歡迎 fork。

原專案 pride829/gudong 沒有授權條款，本專案沒有複製其原始碼或文字。遊戲《古董局中局》的相關權利屬於原作者與出版社，不在本專案的授權範圍內。

發現資安問題請看 [SECURITY.md](SECURITY.md)，不要開公開的 issue。
