import fs from "fs";
import axios from "axios";

const BASE = "https://prx-1316-ant.vmwesa.online/hls2/01/";
const START = 2300;   // 02300
const END = 2400;     // 02400
const JSON_FILE = "dizi.json";   // <-- BURASI DEĞİŞTİ

function loadJSON() {
    if (!fs.existsSync(JSON_FILE)) return [];
    return JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
}

function saveJSON(data) {
    fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2));
}

function extractTitle(m3uText) {
    const lines = m3uText.split("\n");
    for (const line of lines) {
        if (line.includes("#EXT-X-MEDIA")) {
            const match = line.match(/NAME="([^"]+)"/);
            if (match) return match[1];
        }
    }
    return "Unknown";
}

async function checkID(id) {
    const folder = id.toString().padStart(5, "0");
    const url = `${BASE}${folder}/index-v1-a1.m3u8`;

    try {
        const res = await axios.get(url, { timeout: 5000 });

        if (res.status === 200 && res.data.includes("#EXTM3U")) {
            const title = extractTitle(res.data);

            console.log("🔥 Bulundu:", folder, "→", title);

            let data = loadJSON();
            data.push({
                id: folder,
                url,
                title,
                found_at: new Date().toISOString()
            });
            saveJSON(data);
        }
    } catch (e) {
        // 404 veya timeout → yok say
    }
}

async function start() {
    console.log("🚀 100 içerik taraması başlıyor...");

    for (let i = START; i <= END; i++) {
        await checkID(i);
    }

    console.log("✅ Tarama tamamlandı.");
}

start();
