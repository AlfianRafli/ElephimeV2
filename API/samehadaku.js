const cheerio = require("cheerio");
const baseUrl = "https://v1.samehadaku.how";

const PREMIUM_PLACEHOLDER = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgdmlld0JveD0iMCAwIDMwMCA0NTAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MF9saW5ZWFIiIHgxPSIwIiB5MT0iMCIgeDI9IjMwMCIgeTI9IjQ1MCIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25Vc2UiPgo8c3RvcCBzdG9wLWNvbG9yPSIjMUExQTIwIi8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzBGMEYxMiIvPgo8L2xpbmVhckdyYWRpZW50Pgo8bGluZWFyR3JhZGllbnQgaWQ9InBhaW50MV9saW5ZWFIiIHgxPSIxNTAiIHkxPSIxODAiIHgyPSIxNTAiIHkyPSIyNzAiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KPHN0b3Agc3RvcC1jb2xvcj0iI0ZGNDc1NyIvPgo8c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiNFMzNBNEIiLz4KPC9saW5ZWFJHcmFkaWVudD4KPC9kZWZzPgo8cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQ1MCIgZmlsbD0idXJsKCNwYWludDBfbGluWUFSKSIvPgo8cGF0aCBkPSJNMTUwIDIyNUwxMzAgMjA1SDE3MEwxNTAgMjI1WiIgZmlsbD0idXJsKCNwYWludDFfbGluWUFSKSIvPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTE1MCAxNTBDMTMwLjY3IDE1MCAxMTUgMTY1LjY3IDExNSAxODVWMTkwQzExNSAxOTIuNzYxIDExMi43NjEgMTk1IDExMCAxOTVWMTg1QzExMCAxNjIuOTA5IDEyNy45MDkgMTQ1IDE1MCAxNDVDMTcyLjA5MSAxNDUgMTkwIDE2Mi45MDkgMTkwIDE4NVYxOTVDMTg3LjIzOSAxOTUgMTkwIDE5Mi43NjEgMTkwIDE5MFYxODVDMTkwIDE2NS42NyAxNzQuMzMgMTUwIDE1MCAxNTBaTTEzNSAybDMwVzEzNSAybDIwQzEzNSAyMTcuMjM5IDEzMi43NjEgMjE1IDEzMCAyMTVWMjMwQzEzMi43NjEgMjMwIDEzNSAyMzIuMjM5IDEzNSAyMzVWMTkwWiIgZmlsbD0iIzMzMzMzMyIvPgo8Y2lyY2xlIGN4PSIxNTAiIGN5PSIxNTAiIHI9IjUiIGZpbGw9IiNGRjQ3NTciLz4KPHRleHQgeD0iMTUwIiB5PSIyNzAiIGZpbGw9IiM2NjY2NjYiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iNjAwIiBmb250LXNpemU9IjE0IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBsZXR0ZXItc3BhY2luZz0iMiI+Tk8gU0lHTkFMPC90ZXh0Pgo8L3N2Zz4=";

let clientInstance = null;

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

const cleanText = (text) => (text || '').trim();

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

const getTopTenWeek = async () => {
  try {
    const client = await getClient();
    const { body } = await client.get("");
    
    const $ = cheerio.load(body);
    const results = [];

    $(".topten-animesu ul li").each((_, el) => {
      const $el = $(el);
      const imgEl = $el.find("img");
      
      results.push({
        title: cleanText($el.find(".judul").text()),
        url: $el.find("a.series").attr("href"),
        image: getImage(imgEl),
        rating: cleanText($el.find(".rating").text()) || "?",
        rank: cleanText($el.find(".is-topten b").last().text())
      });
    });

    return results;
  } catch (error) {
    console.error('Get Top 10 error:', error.message);
    return [];
  }
};

const getAnimeList = async (page = 1) => {
  try {
    const client = await getClient();
    const path = page === 1 ? "anime-terbaru/" : `anime-terbaru/page/${page}/`;
    
    const { body } = await client.get(path);

    const $ = cheerio.load(body);
    const results = [];

    $(".post-show ul li").each((_, el) => {
      const $el = $(el);
      const imgEl = $el.find(".thumb img");

      results.push({
        title: cleanText($el.find(".entry-title a").text()),
        url: $el.find(".entry-title a").attr("href"),
        image: getImage(imgEl),
        episode: cleanText($el.find("span:contains('Episode') author").text()),
        postedBy: cleanText($el.find("span.author.vcard author").text()),
        released: cleanText($el.find("span:contains('Released on')").text().replace("Released on:", ""))
      });
    });

    return results;
  } catch (error) {
    console.error(`Get Anime List Page ${page} error:`, error.message);
    return [];
  }
};

const search = async (query = "", page = 1, options = {}) => {
  try {
    const client = await getClient();
    const {
      status = "",
      type = "",
      order = "title",
      genres = [] 
    } = options;

    const path = page === 1 ? "daftar-anime-2/" : `daftar-anime-2/page/${page}/`;

    const searchParams = new URLSearchParams();
    searchParams.append("title", query);
    searchParams.append("status", status);
    searchParams.append("type", type);
    searchParams.append("order", order);
    
    if (Array.isArray(genres)) {
      genres.forEach(g => searchParams.append("genre[]", g));
    }

    const { body } = await client.get(path, { searchParams });
    const $ = cheerio.load(body);
    const results = [];

    $(".animpost").each((_, el) => {
      const $el = $(el);
      const imgEl = $el.find(".content-thumb img");

      // FIX: Rating Logic untuk Search
      let rating = cleanText($el.find(".score").text());
      if (!rating) rating = cleanText($el.find(".content-thumb .score").text());
      if (!rating) rating = "?";

      results.push({
        title: cleanText($el.find(".title h2").text()),
        url: $el.find("a").attr("href"),
        image: getImage(imgEl),
        rating: rating,
        type: cleanText($el.find(".content-thumb .type").text()),
        status: cleanText($el.find(".data .type").text()),
        synopsis: cleanText($el.find(".stooltip .ttls").text()),
        genres: $el.find(".stooltip .genres .mta a").map((_, g) => $(g).text()).get()
      });
    });

    return results;
  } catch (error) {
    console.error(`Search error on page ${page}:`, error.message);
    return [];
  }
};

const getAnime = async (url) => {
  try {
    const client = await getClient();
    const { body } = await client.get(url);
    const $ = cheerio.load(body);

    const info = {};
    
    info.title = cleanText($("h1.entry-title").text());
    info.image = getImage($(".thumb img")); 
    
    // FIX: Rating Logic untuk Halaman Detail
    // Coba ambil dari beberapa kemungkinan selector
    let rating = cleanText($(".rtg .skor").text()); // Prioritas 1
    if (!rating) rating = cleanText($(".rating strong").text()); // Prioritas 2
    if (!rating) rating = cleanText($("span[itemprop='ratingValue']").text()); // Prioritas 3
    if (!rating) rating = "?";
    
    info.rating = rating;

    info.synopsis = cleanText($(".desc").text() || $(".entry-content").text());
    info.status = "Unknown"; // Default

    $(".spe span").each((_, el) => {
      const text = $(el).text();
      
      // Deteksi Status
      if (text.toLowerCase().includes("status")) {
         info.status = text.replace(/status/i, "").replace(":", "").trim();
      }
      
      const splitIndex = text.indexOf(":");
      if (splitIndex !== -1) {
        const keyRaw = cleanText(text.substring(0, splitIndex));
        const key = keyRaw.toLowerCase().replace(/\s+/g, '_');
        const value = cleanText(text.substring(splitIndex + 1));
        
        if (key && value) {
           info[key] = value;
        }
      }
    });

    info.genres = $(".genre-info a").map((_, el) => cleanText($(el).text())).get();

    const episodes = [];
    $(".lstepsiode ul li").each((_, el) => {
      const $el = $(el);
      episodes.push({
        title: cleanText($el.find(".lchx a").text()), 
        url: $el.find(".lchx a").attr("href"),
        date: cleanText($el.find(".date").text())
      });
    });

    info.episodes = episodes;
    info.total_episodes = episodes.length;

    return info;
  } catch (error) {
    console.error(`Get Anime Detail error:`, error.message);
    return null;
  }
};

const getEpisode = async (url) => {
  try {
    const client = await getClient();
    const { body } = await client.get(url);
    const $ = cheerio.load(body);
    
    const episodeData = {
      title: cleanText($("h1.entry-title").text()),
      release_date: cleanText($(".time-post").text().replace("Posted by", "").trim()),
      prev_episode: $(".nvs a[href]").first().attr("href") || null,
      next_episode: $(".nvs.rght a[href]").attr("href") || null,
      all_episodes_link: $(".nvs.nvsc a[href]").attr("href") || null,
      downloads: [],
      stream_servers: []
    };

    $(".download-eps").each((_, el) => {
      const format = cleanText($(el).find("p").text());
      $(el).find("ul li").each((_, li) => {
        const resolution = cleanText($(li).find("strong").text());
        $(li).find("span a").each((_, a) => {
          episodeData.downloads.push({
            format,
            resolution,
            server: cleanText($(a).text()),
            url: $(a).attr("href")
          });
        });
      });
    });

    const serverList = [];
    $("#server ul li div").each((_, el) => {
      const $el = $(el);
      serverList.push({
        name: cleanText($el.find("span").text()),
        post: $el.attr("data-post"),
        nume: $el.attr("data-nume"),
        type: $el.attr("data-type")
      });
    });

    const streamPromises = serverList.map(async (server) => {
        try {
            const formData = new URLSearchParams();
            formData.append("action", "player_ajax");
            formData.append("post", server.post);
            formData.append("nume", server.nume);
            formData.append("type", server.type);

            const { body: ajaxBody } = await client.post("wp-admin/admin-ajax.php", {
                body: formData.toString(),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Requested-With": "XMLHttpRequest"
                }
            });
            
            const $ajax = cheerio.load(ajaxBody);
            const iframeSrc = $ajax("iframe").attr("src");

            return {
                server: server.name,
                iframe: iframeSrc || null
            };
        } catch (e) {
            return { server: server.name, iframe: null };
        }
    });

    episodeData.stream_servers = await Promise.all(streamPromises);

    return episodeData;

  } catch (error) {
    console.error(`Get Episode error:`, error.message);
    return null;
  }
};

const getSchedule = async () => {
  try {
    const client = await getClient();
    console.log("[Schedule] Fetching: jadwal-rilis/");
    const { body } = await client.get("jadwal-rilis/");
    
    const $ = cheerio.load(body);
    const results = [];

    const days = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"];

    days.forEach(day => {
        const $dayContainer = $(`#${day}`);
        
        if ($dayContainer.length > 0) {
            const animeList = [];
            
            $dayContainer.find(".items .item").each((_, item) => {
                const $item = $(item);
                const imgEl = $item.find(".thumb img");

                animeList.push({
                    title: cleanText($item.find(".name").text()),
                    url: $item.find(".name").attr("href"),
                    time: cleanText($item.find(".time").text()),
                    image: getImage(imgEl), 
                    genres: [] 
                });
            });

            if (animeList.length > 0) {
                results.push({ 
                    day: day.toUpperCase(), 
                    list: animeList 
                });
            }
        }
    });
    
    return results;

  } catch (error) {
    console.error('[Schedule] Error:', error.message);
    return [];
  }
};

module.exports = {
  getTopTenWeek,
  getAnimeList,
  search,
  getAnime,
  getEpisode,
  getSchedule
};
