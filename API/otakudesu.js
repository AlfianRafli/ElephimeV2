const cheerio = require("cheerio");
const baseUrl = "https://otakudesu.best";

// =====================================================================
// 1. CONFIGURATION & CLIENT
// =====================================================================

const PREMIUM_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgdmlld0JveD0iMCAwIDMwMCA0NTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MF9saW5ZWFIiIHgxPSIwIiB5MT0iMCIgeDI9IjMwMCIgeTI9IjQ1MCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjMUExQTIwIi8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzBGMEYxMiIvPgo8L2xpbmVhckdyYWRpZW50Pgo8bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MV9saW5ZWFIiIHgxPSIxNTAiIHkxPSIxODAiIHgyPSIxNTAiIHkyPSIyNzAiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agc3RvcC1jb2xvcj0iI0ZGNDc1NyIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNFMzNBNEIiLz4KPC9saW5ZWFJHcmFkaWVudD4KPC9kZWZzPgo8cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0idXJsKCNwYWludDBfbGluWUFSKSIvPgo8cGF0aCBkPSJNMTUwIDIyNUwxMzAgMjA1SDE3MEwxNTAgMjI1WiIgZmlsbD0idXJsKCNwYWludDFfbGluWUFSKSIvPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTE1MCAxNTBDMTMwLjY3IDE1MCAxMTUgMTY1LjY3IDExNSAxODVWMTkwQzExNSAxOTIuNzYxIDExMi43NjEgMTk1IDExMCAxOTVWMTg1QzExMCAxNjIuOTA5IDEyNy45MDkgMTQ1IDE1MCAxNDVDMTcyLjA5MSAxNDUgMTkwIDE2Mi45MDkgMTkwIDE4NVYxOTVDMTg3LjIzOSAxOTUgMTkwIDE5Mi43NjEgMTkwIDE5MFYxODVDMTkwIDE2NS42NyAxNzQuMzMgMTUwIDE1MCAxNTBaTTEzNSAybDMwVzEzNSAybDIwQzEzNSAyMTcuMjM5IDEzMi43NjEgMjE1IDEzMCAyMTVWMjMwQzEzMi43NjEgMjMwIDEzNSAyMzIuMjM5IDEzNSAyMzVWMTkwWiIgZmlsbD0iIzMzMzMzMyIvPgo8Y2lyY2xlIGN4PSIxNTAiIGN5PSIxNTAiIHI9IjUiIGZpbGw9IiNGRjQ3NTciLz4KPHRleHQgeD0iMTUwIiB5PSIyNzAiIGZpbGw9IiM2NjY2NjYiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iNjAwIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBsZXR0ZXItc3BhY2luZz0iMiI+Tk8gU0lHTkFMPC90ZXh0Pgo8L3N2Zz4=";

let clientInstance = null;

// Menggunakan got-scraping (lebih kuat anti-bot dibanding axios biasa)
const getClient = async () => {
  if (clientInstance) return clientInstance;
  const { gotScraping } = await import("got-scraping");
  clientInstance = gotScraping.extend({
    prefixUrl: baseUrl,
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 110 }],
      devices: ['mobile', 'desktop'],
      locales: ['en-US', 'id-ID'],
    },
    http2: true, 
    timeout: { request: 15000 },
    retry: { limit: 3 }
  });
  return clientInstance;
};

// --- HELPER CLEANER (Fixed Title Issue) ---
const cleanText = (text) => (text || '').trim();

const cleanTitle = (text) => {
    if (!text) return "";
    return text
        .replace(/\[.*?\]/g, "")           // Hapus [Samehadaku], [Otakudesu]
        .replace(/\(.*?\)/g, "")           // Hapus (Sub Indo)
        .replace(/Subtitle Indonesia/gi, "") // Hapus text Subtitle Indonesia
        .replace(/Episode\s+\d+/gi, "")    // Hapus kata Episode X (biar bersih di judul anime)
        .replace(/\s*-\s*$/, "")           // Hapus strip di akhir
        .replace(/\s+/g, " ")              // Hapus spasi ganda
        .trim();
};

const getImage = ($el) => {
    let url = $el.attr("data-src") || 
              $el.attr("data-lazy-src") || 
              $el.attr("srcset")?.split(" ")[0] || 
              $el.attr("src");

    if (url && url.trim().length > 0 && !url.includes("data:image/gif")) {
        return url.trim();
    }
    return PREMIUM_PLACEHOLDER;
};

// =====================================================================
// 2. SCRAPER FUNCTIONS
// =====================================================================

const search = async (query = "", page = 1, options = {}) => {
  try {
    const client = await getClient();
    const { genres = [] } = options;
    let url = "";
    let isGenreSearch = false;

    if (query) {
        url = `?s=${encodeURIComponent(query)}&post_type=anime`;
    } else if (genres.length > 0) {
        let selectedGenre = genres[0].toLowerCase().replace(/\s+/g, '-');
        url = `genres/${selectedGenre}/page/${page}`;
        isGenreSearch = true;
    } else {
        return [];
    }

    const { body, request } = await client.get(url);

    if (request.redirectUrls && request.redirectUrls.length > 0 && request.redirectUrls[0] === baseUrl + "/") {
        return [];
    }

    const $ = cheerio.load(body);
    const results = [];

    if (isGenreSearch) {
        $(".col-anime").each((_, el) => {
            const $el = $(el);
            // Pakai cleanTitle untuk membersihkan judul di hasil search
            const rawTitle = cleanText($el.find(".col-anime-title a").text());
            
            results.push({
                title: cleanTitle(rawTitle) || rawTitle, // Fallback ke raw jika clean kosong
                url: $el.find(".col-anime-title a").attr("href"),
                image: getImage($el.find(".col-anime-cover img")),
                rating: cleanText($el.find(".col-anime-rating").text()),
                episodes: cleanText($el.find(".col-anime-eps").text()),
                status: "", 
                type: ""
            });
        });
    } else {
        $("ul.chivsrc li").each((_, el) => {
            const $el = $(el);
            const rawTitle = cleanText($el.find("h2 a").text());

            let status = "";
            let rating = "";
            $el.find(".set").each((i, s) => {
                const text = $(s).text();
                if (text.includes("Status")) status = text.replace("Status :", "").trim();
                if (text.includes("Rating")) rating = text.replace("Rating :", "").trim();
            });

            results.push({
                title: cleanTitle(rawTitle) || rawTitle,
                url: $el.find("h2 a").attr("href"),
                image: getImage($el.find("img")),
                status: status,
                rating: rating,
                type: ""
            });
        });
    }

    return results;

  } catch (error) {
    console.error(`Search error (Q:${query}):`, error.message);
    return [];
  }
};

const getHomePage = async (page = 1) => {
  try {
    const client = await getClient();
    const { body } = await client.get(`ongoing-anime/page/${page}`);
    const $ = cheerio.load(body);
    const results = [];

    $(".venz ul li").each((_, el) => {
      const $el = $(el);
      const episodeText = $el.find(".epz").text();
      const episodeMatch = episodeText.match(/Episode\s+(\d+(\.\d+)?)/i);
      const rawTitle = cleanText($el.find(".jdlflm").text());

      results.push({
        title: cleanTitle(rawTitle) || rawTitle,
        image: getImage($el.find("img")),
        url: $el.find("a").attr("href"), 
        episode: episodeMatch ? episodeMatch[1] : null,
        released: cleanText($el.find(".newnime").text())
      });
    });

    return results;
  } catch (error) {
    console.error('Get home page error:', error.message);
    return [];
  }
};

const getAnime = async (animeUrl) => {
  if (!animeUrl || !animeUrl.includes(`${baseUrl}/anime/`)) return null;

  try {
    const client = await getClient();
    const { body } = await client.get(animeUrl);
    const $ = cheerio.load(body);

    const info = {};
    const sinopsisRaw = [];
    $(".sinopc p").each((_, el) => sinopsisRaw.push(cleanText($(el).text())));
    
    // Standardisasi key ke 'synopsis'
    info.synopsis = sinopsisRaw.join("\n") || "Sinopsis tidak tersedia.";

    $("div.infozin div.infozingle p").each((_, el) => {
      const text = $(el).text();
      const keyMap = {
        "Judul": "title", "Skor": "rating", "Produser": "produser",
        "Status": "status", "Total Episode": "totalEpisode",
        "Durasi": "duration", "Tanggal Rilis": "released", "Studio": "studio"
      };

      for (const [indoKey, engKey] of Object.entries(keyMap)) {
          if (text.includes(indoKey)) {
              info[engKey] = text.replace(`${indoKey}`, "").replace(":", "").trim();
          }
      }
    });

    // Bersihkan judul detail anime
    if (info.title) info.title = cleanTitle(info.title) || info.title;

    info.image = getImage($(".fotoanime img"));

    info.genres = [];
    $("div.infozin div.infozingle a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.includes("/genres/")) {
        info.genres.push(cleanText($(el).text()));
      }
    });

    return info;
  } catch (error) {
    console.error('Get anime error:', error.message);
    return {};
  }
};

const getEpisodes = async (animeUrl) => {
  if (!animeUrl) return { title: null, episodes: [] };

  try {
    const client = await getClient();
    const { body } = await client.get(animeUrl);
    const $ = cheerio.load(body);

    const rawTitle = cleanText($(`p span:contains("Judul")`).text().replace("Judul :", ""));
    const title = cleanTitle(rawTitle) || rawTitle;

    const episodes = [];

    $("div.episodelist ul li a").each((_, el) => {
      const $el = $(el);
      const url = $el.attr("href");
      
      if (url && url.includes("/episode/")) {
        const episodeText = $el.text(); 
        const match = episodeText.match(/Episode\s+(\d+(\.\d+)?)/i);
        
        // Format judul episode "Episode X"
        const epTitle = match ? `Episode ${match[1]}` : episodeText;

        episodes.push({
          title: epTitle, 
          url: url
        });
      }
    });

    return { title, episodes: episodes };
  } catch (error) {
    console.error('Get episodes error:', error.message);
    return { title: null, episodes: [] };
  }
};

const getDownloadLink = async (episodeUrl) => {
  if (!episodeUrl) return {};

  try {
    const client = await getClient();
    const { body } = await client.get(episodeUrl);
    const $ = cheerio.load(body);

    const rawTitle = cleanText($("div.download h4").text());
    // Bersihkan judul di area download juga
    const title = rawTitle
                    .replace(/Subtitle Indonesia/gi, "")
                    .replace(/\[.*?\]/g, "")
                    .trim();

    const result = {
      title: title,
      resolutionAvailable: [],
      results: {}
    };

    $("div.download ul > li").each((_, el) => {
      const $el = $(el);
      const resolution = cleanText($el.find("strong").first().text());
      
      if (resolution) {
        result.resolutionAvailable.push(resolution);
        const links = [];
        $el.find("a").each((_, link) => {
          links.push({
            source: cleanText($(link).text()),
            link: $(link).attr("href")
          });
        });
        const key = resolution.split(" ")[1] || resolution;
        result.results[key] = links;
      }
    });

    return result;
  } catch (error) {
    console.error('Get download link error:', error.message);
    return {};
  }
};

const getDataContent = async (url) => {
  if (!url) return { "360p": [], "480p": [], "720p": [], nonce: null, action: null };

  try {
    const client = await getClient();
    const { body } = await client.get(url);
    const $ = cheerio.load(body);
    const result = { "360p": [], "480p": [], "720p": [] };

    // --- NONCE FALLBACK STRATEGY ---
    // Kita tidak perlu scrape script regex di sini karena sering berubah.
    // Kita akan gunakan AJAX call langsung di fungsi getVideos (seperti script axios kamu).
    
    const extractMirrors = (selector, key) => {
      $(selector).each((_, el) => {
        result[key].push({
          label: cleanText($(el).text()),
          dataContent: $(el).attr("data-content")
        });
      });
    };

    extractMirrors("div.mirrorstream ul.m360p a", "360p");
    extractMirrors("div.mirrorstream ul.m480p a", "480p");
    extractMirrors("div.mirrorstream ul.m720p a", "720p");

    return result;
  } catch (error) {
    console.error('Get data content error:', error.message);
    return { "360p": [], "480p": [], "720p": [] };
  }
};

// --- CRITICAL FIX: SINKRONISASI LOGIC GETVIDEOS ---
// Menggunakan logic fetch nonce via POST request (seperti file user)
// Tapi tetap pakai got-scraping untuk konsistensi session.

const getVideos = async (dataContent, keys = {}) => {
  if (!dataContent) return { iframe: null };

  try {
    const client = await getClient();
    
    // 1. Fetch Nonce (Action hash ini diambil dari file axios user yang working)
    // Otakudesu membutuhkan kita 'meminta' nonce dulu dengan action specific.
    const { body: nonceBody } = await client.post("wp-admin/admin-ajax.php", {
        body: "action=aa1208d27f29ca340c92c66d1926f13f", 
        headers: { 
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest"
        }
    });
    
    const nonceData = JSON.parse(nonceBody);
    const nonce = nonceData.data;

    if (!nonce) {
        console.error("[Otakudesu] Failed to get Nonce!");
        return { iframe: null };
    }

    // 2. Decode Data Content (Base64)
    // Pastikan dataContent valid sebelum di-parse
    if (typeof dataContent !== 'string') {
        console.error("[Otakudesu] dataContent is invalid/undefined");
        return { iframe: null };
    }

    const res = JSON.parse(Buffer.from(dataContent, "base64").toString("utf-8"));

    // 3. Request Iframe
    const requestData = new URLSearchParams();
    requestData.append('id', res.id);
    requestData.append('i', res.i);
    requestData.append('q', res.q);
    requestData.append('nonce', nonce);
    requestData.append('action', '2a3505c93b0035d3f455df82bf976b84'); // Action untuk ambil video

    const { body: responseBody } = await client.post("wp-admin/admin-ajax.php", {
        body: requestData.toString(),
        headers: { 
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest"
        }
    });

    const responseData = JSON.parse(responseBody);
    if (!responseData.data) return { iframe: null };

    const decodedData = Buffer.from(responseData.data, "base64").toString("utf-8");
    
    // Parse Iframe Src
    let iframeSrc = "";
    const srcMatch = decodedData.match(/src="([^"]+)"/);
    if (srcMatch) {
        iframeSrc = srcMatch[1];
    } else if (decodedData.startsWith("http")) {
        iframeSrc = decodedData;
    }

    return { iframe: iframeSrc };

  } catch (error) {
    console.error('Get videos error:', error.message);
    return { iframe: null };
  }
};

module.exports = {
  getHomePage,
  search,
  getAnime,
  getEpisodes,
  getDownloadLink,
  getDataContent,
  getVideos
};
