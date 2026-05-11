import fs from "fs";
import axios from "axios";
import HttpsProxyAgent from "https-proxy-agent";
import { execSync } from "child_process";

const THREADS = 20;
const BASE = "https://dosyaload.com/m3u/";
const JSON_FILE = "series.json";

// İstersen buraya kendi proxy’lerini eklersin
let proxies = [
  "http://185.199.229.156:7492",
  "http://45.91.92.45:8080",
  "http://103.152.112.145:80",
  "http://51.159.0.236:3128",
  "http://8.219.97.248:80"
];

function randomProxy() {
  return proxies[Math.floor(Math.random() * proxies.length)];
}

function randomToken(length = 180) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let t = "";
  for (let i = 0; i < length; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

// Dizi adı çıkarma
function extractSeriesName(m3uText) {
  const match = m3uText.match(/tvg-name="([^"]+)"/);
  if (match) return match[1].trim();

  const title = m3uText.match(/#EXTINF:-1.*,(.*)/);
  return title ? title[1].trim() : "Unknown";
}

// M3U içinden sezon/bölüm çıkarma
function parseM3USeasons(m3uText) {
  const lines = m3uText.split(/\r?\n/);
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#EXTINF")) {
      const info = line;
      const url = lines[i + 1] || "";

      const titleMatch = info.match(/,(.*)/);
      const title = titleMatch ? titleMatch[1].trim() : "Unknown";

      // S01E02, S1E2, 1x02, 1. Sezon 2. Bölüm gibi pattern’ler
      let season = 1;
      let episode = null;

      const reList = [
        /S(\d{1,2})E(\d{1,2})/i,
        /(\d{1,2})x(\d{1,2})/i,
        /(\d+)\.\s*Sezon\s*(\d+)\.\s*Bölüm/i,
        /Sezon\s*(\d+)\s*Bölüm\s*(\d+)/i
      ];

      for (const re of reList) {
        const m = title.match(re);
        if (m) {
          season = parseInt(m[1], 10);
          episode = parseInt(m[2], 10);
          break;
        }
      }

      // Hiçbir şey bulunamazsa sırayla numaralandırmak istersen
      if (!episode) {
        episode = entries.length + 1;
      }

      entries.push({
        season,
        episode,
        title,
        stream_url: url.trim()
      });
    }
  }

  // Sezonlara göre grupla
  const seasonsMap = new Map();
  for (const e of entries) {
    if (!seasonsMap.has(e.season)) {
      seasonsMap.set(e.season, []);
    }
    seasonsMap.get(e.season).push({
      episode: e.episode,
      title: e.title,
      stream_url: e.stream_url
    });
  }

  const seasons = [];
  for (const [seasonNumber, eps] of seasonsMap.entries()) {
    eps.sort((a, b) => a.episode - b.episode);
    seasons.push({
      season: seasonNumber,
      episodes: eps
    });
  }

  seasons.sort((a, b) => a.season - b.season);
  return seasons;
}

// JSON yükle
function loadJSON() {
  if (!fs.existsSync(JSON_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
  } catch {
    return [];
  }
}

// JSON kaydet
function saveJSON(data) {
  fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2));
}

// Dizi kaydet / güncelle
function saveSeries(url, name, seasons) {
  let data = loadJSON();

  let existing = data.find((s) => s.url === url || s.name === name);
  if (!existing) {
    existing = {
      name,
      url,
      found_at: new Date().toISOString(),
      seasons: []
    };
    data.push(existing);
  }

  // Sezonları merge et
  for (const newSeason of seasons) {
    let targetSeason = existing.seasons.find((s) => s.season === newSeason.season);
    if (!targetSeason) {
      existing.seasons.push(newSeason);
    } else {
      const existingEpisodes = new Set(
        targetSeason.episodes.map((e) => `${e.episode}-${e.stream_url}`)
      );
      for (const ep of newSeason.episodes) {
        const key = `${ep.episode}-${ep.stream_url}`;
        if (!existingEpisodes.has(key)) {
          targetSeason.episodes.push(ep);
        }
      }
      targetSeason.episodes.sort((a, b) => a.episode - b.episode);
    }
  }

  existing.seasons.sort((a, b) => a.season - b.season);

  saveJSON(data);
  autoGitPush();
}

// GitHub auto-push
function autoGitPush() {
  try {
    execSync("git add .", { stdio: "ignore" });
    execSync('git commit -m "auto update series.json"', { stdio: "ignore" });
    execSync("git push", { stdio: "ignore" });
    console.log("✅ GitHub push tamamlandı.");
  } catch (e) {
    // Commit edecek bir şey yoksa vs. sessiz geç
  }
}

async function checkToken(token) {
  try {
    const url = BASE + token;
    const proxy = randomProxy();
    const agent = new HttpsProxyAgent(proxy);

    const res = await axios.get(url, {
      timeout: 7000,
      httpsAgent: agent,
      httpAgent: agent
    });

    if (typeof res.data === "string" && res.data.includes("#EXTM3U")) {
      const name = extractSeriesName(res.data);
      const seasons = parseM3USeasons(res.data);

      console.log("🔥 Dizi bulundu:", name, "→", url);
      console.log("   Sezon sayısı:", seasons.length);

      saveSeries(url, name, seasons);
    }
  } catch (e) {
    // Sessiz geç
  }
}

async function worker(id) {
  console.log(`🧵 Thread ${id} çalışıyor...`);
  while (true) {
    const token = randomToken();
    await checkToken(token);
  }
}

async function start() {
  console.log("🚀 Dosyaload Ultra Tarayıcı (Sezon/Bölüm + JSON + GitHub)");

  for (let i = 0; i < THREADS; i++) {
    worker(i);
  }
}

start();
