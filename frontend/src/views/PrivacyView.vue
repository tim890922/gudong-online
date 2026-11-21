<script setup lang="ts">
// App Store 與 Google Play 都要求提供隱私權政策網址：/privacy
const UPDATED = '2026-11-21'
const ISSUES = 'https://github.com/tim890922/gudong-online/issues'
</script>

<template>
  <main class="mx-auto max-w-lg px-4 pt-6 pb-12">
    <RouterLink to="/" class="text-sm text-mist hover:text-paper">回首頁</RouterLink>
    <h1 class="mt-3 font-display text-4xl">隱私權政策</h1>
    <p class="mt-1 text-sm text-mist">最後更新：{{ UPDATED }}</p>

    <div class="mt-6 space-y-6 leading-relaxed [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-gilt [&_li]:ml-5 [&_li]:list-disc">
      <section>
        <p>
          「古董局中局」（網頁版與 iOS／Android App，以下稱「本服務」）不需要註冊帳號，也不會要求你提供
          姓名、Email、電話等可以直接識別你的資料。
        </p>
      </section>

      <section>
        <h2>我們會處理的資料</h2>
        <ul class="space-y-2">
          <li>
            <strong>房間與遊戲資料</strong>：你輸入的暱稱、座位顏色，以及你在遊戲中的操作（鑑定、技能、投票等）。
            這些資料存在伺服器上，用來讓同一個房間的玩家一起進行遊戲；房間閒置 12 小時後會自動刪除。
          </li>
          <li>
            <strong>聊天訊息（只有遠端遊玩的房間）</strong>：你在聊天室送出的文字，同房間的玩家都看得到。
            伺服器只保留每個房間最近 100 則，房間刪除時一併刪除。
          </li>
          <li>
            <strong>存在你手機上的資料</strong>：你的暱稱、最近加入的房號，以及一組隨機產生的房間通行碼，
            用來在重新整理或斷線後自動回到房間。這些資料只存在你的瀏覽器或 App 裡，清除網站資料或刪除 App
            就會一併刪除。
          </li>
          <li>
            <strong>連線紀錄</strong>：為了維運與除錯，主機服務會記錄連線的技術資訊（例如 IP 位址、時間、要求的網址），
            只保留數天。
          </li>
          <li>
            <strong>相機（只有 App）</strong>：使用「掃描 QR code 加入」時才會開啟相機。畫面只在你的手機上辨識，
            不會拍照、錄影或上傳。
          </li>
        </ul>
      </section>

      <section>
        <h2>我們不會做的事</h2>
        <ul class="space-y-2">
          <li>不放廣告，不使用追蹤或分析工具，不建立你的個人檔案。</li>
          <li>不出售、出租或分享你的資料給任何人。</li>
        </ul>
      </section>

      <section>
        <h2>第三方服務</h2>
        <ul class="space-y-2">
          <li><strong>Cloudflare</strong>：本服務的主機與資料庫。</li>
          <li><strong>Google Fonts</strong>：載入畫面使用的字型，Google 會因此收到你的 IP 位址。</li>
        </ul>
      </section>

      <section>
        <h2>兒童</h2>
        <p>本服務不是專為兒童設計，也不會刻意蒐集兒童的個人資料。</p>
      </section>

      <section>
        <h2>政策變更與聯絡方式</h2>
        <p>
          政策有變動時會更新本頁並修改上方的日期。有任何問題，請到
          <a class="text-gilt underline" :href="ISSUES" target="_blank" rel="noopener">GitHub Issues</a>
          留言。
        </p>
      </section>
    </div>
  </main>
</template>
