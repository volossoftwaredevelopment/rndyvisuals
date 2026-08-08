// Renders the admin access sheet to a PDF on the Desktop via headless Chrome
// (Chrome handles Cyrillic; the PDF base-14 fonts do not). The intermediate
// HTML holds the password, so it is written to a private temp path and removed
// immediately after the PDF is produced.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const cred = JSON.parse(readFileSync('.setup-credentials.json', 'utf8'))
const password = cred.password
if (!password) {
  console.error('В .setup-credentials.json нет пароля. Запустите: node scripts/setup-auth.mjs --reset')
  process.exit(1)
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const date = new Date().toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.55; }
  h1 { font-size: 19pt; margin: 0 0 2mm; letter-spacing: .5px; }
  .sub { color: #666; font-size: 9.5pt; margin-bottom: 8mm; }
  h2 { font-size: 12pt; margin: 7mm 0 2.5mm; padding-bottom: 1.5mm; border-bottom: 1px solid #ddd; }
  .box { border: 2px solid #111; border-radius: 6px; padding: 5mm 6mm; margin: 3mm 0 5mm; background: #fafafa; }
  .lbl { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 1.5mm; }
  .val { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 15pt; font-weight: 700; letter-spacing: 1.5px; }
  .url { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 11.5pt; font-weight: 600; }
  ol, ul { margin: 2mm 0; padding-left: 6mm; }
  li { margin-bottom: 1.5mm; }
  .warn { background: #fff8e1; border-left: 3px solid #f0a000; padding: 3mm 4mm; margin: 3mm 0; font-size: 10pt; }
  code { font-family: 'SF Mono', Menlo, Consolas, monospace; background: #f0f0f0; padding: 0.5mm 1.5mm; border-radius: 2px; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 2mm; }
  td { padding: 1.8mm 2mm; border-bottom: 1px solid #eee; vertical-align: top; }
  td:first-child { color: #666; width: 34%; }
  .foot { margin-top: 9mm; padding-top: 3mm; border-top: 1px solid #ddd; color: #888; font-size: 8.5pt; }
</style></head><body>

<h1>RNDY VISUALS — доступ в админку</h1>
<div class="sub">Сгенерировано ${esc(date)}</div>

<div class="box">
  <div class="lbl">Адрес админки</div>
  <div class="url">https://rndyvisuals.com/admin.html</div>
  <div style="height:4mm"></div>
  <div class="lbl">Пароль</div>
  <div class="val">${esc(password)}</div>
</div>

<h2>Как войти</h2>
<ol>
  <li>Откройте <span class="url">rndyvisuals.com/admin.html</span> — вас перебросит на страницу входа.</li>
  <li>Введите пароль из рамки выше (можно скопировать из этого PDF).</li>
  <li>Пройдите проверку «Verify you are human» — обычно достаточно одного клика.</li>
  <li>Нажмите «Войти». Сессия живёт 12 часов, потом вход заново.</li>
</ol>

<h2>Как сменить пароль</h2>
<ol>
  <li>Внутри админки — кнопка <b>«Сменить пароль»</b> в правом верхнем углу.</li>
  <li>Введите текущий пароль, затем новый (минимум 10 символов) дважды.</li>
  <li>После сохранения вход выполняется заново уже с новым паролем.</li>
</ol>
<div class="warn">
  <b>Важно:</b> новый пароль нигде не хранится в открытом виде — в базе только его
  необратимый хэш. Запишите его сразу. Если забудете — восстановить нельзя, только
  сбросить (см. ниже).
</div>

<h2>Если пароль забыт</h2>
<p style="margin:2mm 0">На компьютере, где лежит проект, в папке <code>IvanRudy/Web</code> выполнить:</p>
<p style="margin:2mm 0"><code>node scripts/setup-auth.mjs --reset</code></p>
<p style="margin:2mm 0">Команда выдаст новый пароль в файл <code>.setup-credentials.json</code>, после чего
этот PDF можно пересоздать: <code>node scripts/make-credentials-pdf.mjs</code></p>

<h2>Что где находится</h2>
<table>
  <tr><td>Сайт</td><td>https://rndyvisuals.com</td></tr>
  <tr><td>Админка</td><td>https://rndyvisuals.com/admin.html</td></tr>
  <tr><td>Хостинг</td><td>Vercel (деплой автоматом при коммите в GitHub)</td></tr>
  <tr><td>Домен и DNS</td><td>Cloudflare</td></tr>
  <tr><td>База данных</td><td>Neon PostgreSQL (Франкфурт)</td></tr>
  <tr><td>Хранилище видео</td><td>Cloudflare R2, бакет rndy-media</td></tr>
  <tr><td>Код</td><td>github.com/volossoftwaredevelopment/rndyvisuals</td></tr>
  <tr><td>Резервная копия</td><td>ветка backup-working и тег backup-*</td></tr>
</table>

<h2>Защита</h2>
<ul>
  <li>Пароль хранится только как scrypt-хэш — прочитать его нельзя даже из базы.</li>
  <li>Капча Cloudflare Turnstile на входе.</li>
  <li>После 8 неудачных попыток вход с этого IP блокируется на 15 минут.</li>
  <li>Админка отдаётся только с правильной подписанной сессией; на GitHub Pages её нет вовсе.</li>
</ul>

<div class="foot">
  Храните этот файл в надёжном месте. Лучше всего — перенести пароль в менеджер паролей
  (Связка ключей / 1Password), а PDF удалить с рабочего стола.
</div>

</body></html>`

const dir = mkdtempSync(join(tmpdir(), 'rndy-cred-'))
const htmlPath = join(dir, 'sheet.html')
const outPath = join(homedir(), 'Desktop', 'RNDY-доступ-в-админку.pdf')

writeFileSync(htmlPath, html, { mode: 0o600 })
try {
  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${outPath}`,
      `file://${htmlPath}`,
    ],
    { stdio: 'ignore', timeout: 90_000 },
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(existsSync(outPath) ? `PDF готов: ${outPath}` : 'PDF не создан')
