/**
 * 有道正式 API 已生成的美式/英式本地试听。
 * node tools/preview-youdao.mjs [port]
 * 只监听本机；播放已保存的音频，不调用生成 API。
 * 全量生成中优先试听已通过校验的本地缓存。
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fingerprint, VOICES } from './lib/youdao-tts.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.argv[2] || 4190)
const WORDS = [
  { word: 'ear', id: 'ear', zh: '耳朵' },
  { word: 'hair', id: 'hair', zh: '头发' },
  { word: 'near', id: 'opp-near', zh: '近的' },
  { word: 'year', id: 'year', zh: '年' },
  { word: 'mouth', id: 'mouth', zh: '嘴巴' },
  { word: 'tooth', id: 'tooth', zh: '牙齿' },
  { word: 'three', id: 'three', zh: '三' },
  { word: 'watermelon', id: 'watermelon', zh: '西瓜' },
]
const files = new Map(WORDS.flatMap(({ id, word }) => Object.entries(VOICES).map(([accent, voice]) => [`/audio/${accent}/${id}.mp3`, {
  cache: path.join(ROOT, 'tmp/youdao-en', fingerprint(word, voice) + '.mp3'),
  published: path.join(ROOT, 'src/static', accent === 'gb' ? 'audio-gb' : 'audio', id + '.mp3'),
}])))
const html = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>有道发音对照</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f3ee;color:#242a29;font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif}
main{max-width:900px;margin:0 auto;padding:44px 24px}header{border-bottom:1px solid #d8dcd6;padding-bottom:24px;margin-bottom:28px}
.eyebrow{font-size:13px;color:#52645c;letter-spacing:2px}h1{font-size:28px;margin:8px 0}p{margin:8px 0;color:#59645f}
.words{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:24px}button{font:inherit;cursor:pointer;border:1px solid #cbd3cd;border-radius:9px;background:#fff;color:inherit;padding:10px 17px}
button:hover{border-color:#257b61}button:focus-visible,a:focus-visible{outline:3px solid #3b9278;outline-offset:3px}
.words button[aria-pressed=true]{background:#235b49;color:#fff;border-color:#235b49}.sample{background:#fff;border:1px solid #d8dcd6;border-radius:14px;padding:30px}
.word{font-size:48px;font-weight:650;line-height:1.2;overflow-wrap:anywhere}.meaning{color:#59645f;margin-top:6px}
.options{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:28px 0 20px}.options button{text-align:left;padding:19px 16px;min-height:100px}
.options strong,.options span{display:block}.options span{font-size:13px;color:#68756e;margin-top:8px}.options button[data-playing=true]{background:#e8f3ed;border-color:#257b61}
.status{min-height:30px;color:#235b49;font-size:14px}audio{width:100%;margin-top:12px}.actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:20px}
.primary{background:#235b49;color:white;border-color:#235b49}a{color:#235b49;text-underline-offset:3px}.note{font-size:13px;margin-top:22px}
@media(max-width:560px){main{padding:24px 16px}.sample{padding:22px 18px}.options{grid-template-columns:1fr;gap:9px;margin-top:22px}.options button{min-height:0;padding:12px 16px}.options span{margin-top:2px}.word{font-size:38px}}
</style>
<main>
<header><div class="eyebrow">快乐学园 / 发音试听</div><h1>有道发音对照</h1><p>先听「ear」的收尾，再比较其他单词。选择最适合孩子跟读的一组声音。</p></header>
<nav class="words" aria-label="选择试听单词">${WORDS.map((w, i) => `<button data-word="${i}" aria-pressed="${i === 0}">${w.word}</button>`).join('')}</nav>
<section class="sample" aria-label="读音对照">
<div class="word" id="word">ear</div><div class="meaning" id="meaning">耳朵</div>
<div class="options">
<button data-source="gb"><strong>播放有道英式</strong><span>有小英 · 本地音频</span></button>
<button data-source="us"><strong>播放有道美式</strong><span>有雅婷 · 本地音频</span></button>
</div>
<div id="status" class="status" role="status" aria-live="polite">点击上方按钮开始试听</div>
<audio id="player" controls preload="none" aria-label="当前样音播放器"></audio>
<div class="actions"><button class="primary" id="compare">连续对比：美式 → 英式</button><button id="stop">停止</button><a id="dictionary" href="https://dict.youdao.com/result?word=ear&lang=en" target="_blank" rel="noopener noreferrer">查看有道词条</a></div>
</section>
<p class="note">两种发音均使用有道正式 API 生成，以原始语速和音量播放，便于比较发音。课程中的音量会单独校准。</p>
<p class="note">播放本地文件不会再次调用生成接口。全量生成期间，个别样音尚未准备好时可稍后重试。</p>
</main>
<script>
const words=${JSON.stringify(WORDS)};
const player=document.getElementById('player');
const status=document.getElementById('status');
const labels={gb:'英式 · 有小英',us:'美式 · 有雅婷'};
let current=0,token=0,gap=null,source=null;
function highlight(key){document.querySelectorAll('[data-source]').forEach(b=>b.dataset.playing=String(b.dataset.source===key));}
function stop(){token++;clearTimeout(gap);player.onended=null;player.onerror=null;player.pause();highlight(null);status.textContent='已停止';}
function url(key){return '/audio/'+key+'/'+words[current].id+'.mp3';}
function play(key,run,onDone){if(run!==token)return;source=key;highlight(key);status.textContent='正在加载 '+labels[key]+' · '+words[current].word;
player.onended=()=>{if(run!==token)return;highlight(null);status.textContent=labels[key]+' 播放完成';if(onDone)onDone();};
player.onerror=()=>{if(run!==token)return;highlight(null);status.textContent='音频加载失败，请重试或打开有道词条试听';};
player.src=url(key);player.playbackRate=1;player.volume=1;
player.play().catch(()=>{if(run===token){highlight(null);status.textContent='未能开始播放，请再次点击播放按钮';}});}
player.addEventListener('playing',()=>{highlight(source);status.textContent='正在播放 '+labels[source]+' · '+words[current].word;});
player.addEventListener('pause',()=>highlight(null));
document.querySelectorAll('[data-source]').forEach(b=>b.onclick=()=>{stop();play(b.dataset.source,token);});
document.querySelectorAll('[data-word]').forEach(b=>b.onclick=()=>{stop();current=Number(b.dataset.word);source=null;player.removeAttribute('src');player.load();document.getElementById('word').textContent=words[current].word;document.getElementById('meaning').textContent=words[current].zh;document.getElementById('dictionary').href='https://dict.youdao.com/result?word='+encodeURIComponent(words[current].word)+'&lang=en';document.querySelectorAll('[data-word]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));status.textContent='点击上方按钮开始试听';});
document.getElementById('compare').onclick=()=>{stop();const run=token;play('us',run,()=>{status.textContent='即将播放有道英式';gap=setTimeout(()=>play('gb',run),500);});};
document.getElementById('stop').onclick=stop;
</script></html>`

http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(html)
  }
  const entry = files.get(pathname)
  const metadata = path.join(ROOT, 'tools/youdao-audio-manifest.json')
  const published = entry && fs.existsSync(metadata) && JSON.parse(fs.readFileSync(metadata, 'utf8')).files[path.relative(ROOT, entry.published).replaceAll('\\', '/')]
  const file = entry && (fs.existsSync(entry.cache) ? entry.cache : published ? entry.published : null)
  if (file && fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': fs.statSync(file).size })
    return fs.createReadStream(file).pipe(res)
  }
  res.writeHead(404)
  res.end('Not found')
}).listen(PORT, '127.0.0.1', () => console.log(`有道发音对照：http://127.0.0.1:${PORT}`))
