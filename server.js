const express = require("express");
const path = require("path");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const NodeCache = require("node-cache");

// Import Config & Scrapers
const config = require("./config.json");
const samehadaku = require("./API/samehadaku");
const otakudesu = require("./API/otakudesu");

const app = express();
const myCache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // Cache 10 Menit

// ==========================================
// 1. SECURITY & PERFORMANCE MIDDLEWARE
// ==========================================

app.set("trust proxy", 1); 

// Helmet: Security Headers (CSP disabled agar inline script/style jalan)
app.use(helmet({
    contentSecurityPolicy: false, 
    crossOriginEmbedderPolicy: false,
}));

// Compression: Gzip response
app.use(compression());

// CORS
app.use(cors({
    origin: config.domain || "*", 
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiter
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 menit
    max: 300, 
    message: { status: 429, error: "Too many requests, please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use("/API", apiLimiter);

// ==========================================
// 2. CACHING STRATEGY
// ==========================================
const cacheMiddleware = (req, res, next) => {
    if (req.method !== 'GET') return next();
    
    const key = "__express__" + (req.originalUrl || req.url);
    const cachedBody = myCache.get(key);

    if (cachedBody) {
        return res.json(cachedBody);
    } else {
        res.sendResponse = res.json;
        res.json = (body) => {
            // Cache hanya jika sukses (status 200) dan ada body
            if (res.statusCode === 200 && body) {
                myCache.set(key, body);
            }
            res.sendResponse(body);
        };
        next();
    }
};

// ==========================================
// 3. STATIC FILES & PAGE ROUTING
// ==========================================

// Serve static assets
app.use(express.static(path.join(__dirname, "public")));

// Route Pages (Sesuai Struktur ZIP)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/search", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "search.html"));
});

app.get("/anime", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "anime.html"));
});

app.get("/watch", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "watch.html"));
});

// ==========================================
// 4. API ENDPOINTS
// ==========================================

// --- A. Home Data (Default: Samehadaku) ---
app.get("/API/home", cacheMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const [latest, topTen] = await Promise.all([
            samehadaku.getAnimeList(page),
            page === 1 ? samehadaku.getTopTenWeek() : Promise.resolve([]) 
        ]);

        res.json({
            status: true,
            data: { latest, topTen }
        });
    } catch (error) {
        console.error("Home API Error:", error.message);
        res.status(500).json({ status: false, message: "Failed to fetch home data" });
    }
});

// --- B. Search (Samehadaku) ---
app.get("/API/search", async (req, res) => {
    try {
        const query = req.query.q || "";
        const options = {
            status: req.query.status || "",
            type: req.query.type || "",
            order: req.query.order || "title",
            genres: req.query['genres[]'] || []
        };

        if (options.genres && !Array.isArray(options.genres)) {
            options.genres = [options.genres];
        }

        const result = await samehadaku.search(query, 1, options);
        res.json({ status: true, results: result });
    } catch (error) {
        console.error("Search API Error:", error.message);
        res.status(500).json({ status: false, message: "Search failed" });
    }
});

// --- C. Otakudesu Search (Alternative Source) ---
app.get("/API/ODSearch", async (req, res) => {
    try {
        const query = req.query.q || "";
        const page = parseInt(req.query.page) || 1;
        let genres = req.query['genres[]'] || req.query.genre || [];
        
        if (!Array.isArray(genres)) genres = [genres];

        const result = await otakudesu.search(query, page, { genres });
        
        res.json({ status: true, source: "otakudesu", results: result });
    } catch (error) {
        console.error("ODSearch API Error:", error.message);
        res.status(500).json({ status: false, message: "Otakudesu search failed" });
    }
});

// --- D. Anime Details (Dynamic: Samehadaku OR Otakudesu) ---
app.get("/API/anime-details", cacheMiddleware, async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: "URL required" });

        let result = null;

        if (url.includes("otakudesu")) {
            const [animeInfo, episodesData] = await Promise.all([
                otakudesu.getAnime(url),
                otakudesu.getEpisodes(url)
            ]);
            if (animeInfo && Object.keys(animeInfo).length > 0) {
                result = { ...animeInfo, episodes: episodesData.episodes || [], title: animeInfo.title || episodesData.title };
            }
        } else {
            result = await samehadaku.getAnime(url);
        }

        if (!result || Object.keys(result).length === 0) {
            return res.status(404).json({ status: false, message: "Data not found" });
        }

        res.json({ status: true, data: result });
    } catch (error) {
        console.error("Detail API Error:", error.message);
        res.status(500).json({ status: false, message: "Failed to fetch details" });
    }
});

// --- E. Episode Streams (Dynamic: Samehadaku OR Otakudesu) ---
app.get("/API/episode", cacheMiddleware, async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: "URL required" });

        let result = null;
	if (url.includes("otakudesu")) {
            // Otakudesu Logic: Fetch Download & Stream Data
            const [downloadData, streamData] = await Promise.all([
                otakudesu.getDownloadLink(url),
                otakudesu.getDataContent(url) // Ini sekarang return mirrors + keys (nonce/action)
            ]);

            const downloads = [];
            if (downloadData.results) {
                for (const [res, links] of Object.entries(downloadData.results)) {
                    links.forEach(link => {
                        downloads.push({
                            format: "MKV/MP4", resolution: res, server: link.source, url: link.link
                        });
                    });
                }
            }

            // Extract dynamic keys from scraping result
            const dynamicKeys = {
                action: streamData.action,
                nonce: streamData.nonce
            };

            const streamPromises = [];
            // Loop mirrors dan pass dynamicKeys ke getVideos
            const resolutions = ["360p", "480p", "720p"];
            for (const res of resolutions) {
                if (streamData[res]) {
                    streamData[res].forEach(mirror => {
                        streamPromises.push(
                            otakudesu.getVideos(mirror.dataContent, dynamicKeys)
                                .then(videoRes => videoRes && videoRes.iframe ? { server: `${mirror.label} [${res}]`, iframe: videoRes.iframe } : null)
                                .catch(() => null)
                        );
                    });
                }
            }

            const resolvedStreams = await Promise.all(streamPromises);
            
            result = {
                title: downloadData.title || "Episode Title",
                release_date: "Unknown", 
                prev_episode: null, next_episode: null, all_episodes_link: null,
                downloads: downloads,
                stream_servers: resolvedStreams.filter(s => s !== null)
            }
        } else {
            // Samehadaku Logic
            result = await samehadaku.getEpisode(url);
        }

        if (!result) return res.status(404).json({ status: false, message: "Episode not found" });

        res.json({ status: true, data: result });
    } catch (error) {
        console.error("Episode API Error:", error.message);
        res.status(500).json({ status: false, message: "Failed to fetch episode" });
    }
});

// --- F. Image Proxy ---
app.get("/API/proxy-image", async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send("URL required");

    try {
        const { gotScraping } = await import("got-scraping");
        const stream = gotScraping.stream(imageUrl);

        stream.on("response", (response) => {
            delete response.headers[":status"];
            delete response.headers[":method"];
            delete response.headers[":path"];
            delete response.headers[":scheme"];
            delete response.headers[":authority"];
            res.setHeader("Cache-Control", "public, max-age=86400");
            if (response.headers["content-type"]) res.setHeader("Content-Type", response.headers["content-type"]);
        });

        stream.on("error", (err) => {
            if (!res.headersSent) res.sendFile(path.join(__dirname, "public", "assets", "placeholder.png"));
        });

        stream.pipe(res);
    } catch (error) {
        if (!res.headersSent) res.sendFile(path.join(__dirname, "public", "assets", "placeholder.png"));
    }
});

// --- G. Settings ---
app.get("/API/settings", (req, res) => {
    res.json({ giscus: config.giscus });
});

// ==========================================
// 5. SERVER START
// ==========================================

// 404 Handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

app.listen(config.port || 3000, () => console.log(`Server running on http://localhost:${config.port || 3000}`));
