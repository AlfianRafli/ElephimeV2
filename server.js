const express = require("express");
const path = require("path");
const https = require("https");
const fs = require("fs");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const NodeCache = require("node-cache");

// Import Config & Scraper
const config = require("./config.json");
const samehadaku = require("./API/samehadaku");

const app = express();
const myCache = new NodeCache({ stdTTL: 600, checkperiod: 120 }); // Cache 10 Menit

// ==========================================
// 1. SECURITY & PERFORMANCE MIDDLEWARE
// ==========================================

app.set("trust proxy", 1); // Wajib jika di deploy di belakang Nginx/Cloudflare

// Helmet: Mengamankan HTTP Headers
app.use(helmet({
    contentSecurityPolicy: false, // Diset false agar inline script/css (single file) tetap jalan
    crossOriginEmbedderPolicy: false,
}));

// Compression: Mengompres response body (Gzip)
app.use(compression());

// CORS: Hanya izinkan domain sendiri (Ganti elephant.my.id saat produksi)
app.use(cors({
    origin: config.domain || "*", 
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiter: Mencegah DDoS / Spam Request
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 menit
    max: 100, // Maksimal 100 request per IP per menit
    message: {
        status: 429,
        error: "Too many requests, please slow down."
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use("/API", apiLimiter);

// ==========================================
// 2. CACHING STRATEGY
// ==========================================
// Middleware untuk cache response API agar tidak membebani server Samehadaku
const cacheMiddleware = (req, res, next) => {
    if (req.method !== 'GET') return next();
    
    const key = "__express__" + (req.originalUrl || req.url);
    const cachedBody = myCache.get(key);

    if (cachedBody) {
        return res.json(cachedBody);
    } else {
        res.sendResponse = res.json;
        res.json = (body) => {
            // Jangan cache jika terjadi error
            if (res.statusCode === 200 && body) {
                myCache.set(key, body);
            }
            res.sendResponse(body);
        };
        next();
    }
};

// ==========================================
// 3. STATIC FILES ROUTING
// ==========================================

// Serve static files (assets, etc)
app.use(express.static(path.join(__dirname, "public")));

// Route Halaman Utama (Home)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Route Halaman Anime Details
app.get("/anime", (req, res) => {
    // Validasi sederhana: Jangan load jika tidak ada query URL (opsional, bisa dihandle frontend)
    res.sendFile(path.join(__dirname, "public", "anime.html"));
});

// Route Halaman Nonton (Watch)
app.get("/watch", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "watch.html"));
});

// ==========================================
// 4. API ENDPOINTS (Samehadaku Integration)
// ==========================================

// A. Get Home Data (Latest + Top 10)
app.get("/API/home", cacheMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        
        // Parallel request biar cepat (ambil list anime & top 10 berbarengan)
        const [latest, topTen] = await Promise.all([
            samehadaku.getAnimeList(page),
            page === 1 ? samehadaku.getTopTenWeek() : Promise.resolve([]) // Top 10 cuma butuh di page 1
        ]);

        res.json({
            status: true,
            data: {
                latest: latest,
                topTen: topTen
            }
        });
    } catch (error) {
        console.error("Home API Error:", error.message);
        res.status(500).json({ status: false, message: "Failed to fetch home data" });
    }
});

// B. Search Anime
app.get("/API/search", async (req, res) => {
    try {
        const query = req.query.q || ""; // Default kosong jika cuma filter
        
        const options = {
            status: req.query.status || "",
            type: req.query.type || "",
            order: req.query.order || "title",
            genres: req.query['genres[]'] || [] // Express baca array query sbg variable[]
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

// C. Get Anime Details
app.get("/API/anime-details", cacheMiddleware, async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: "URL parameter is required" });

        const result = await samehadaku.getAnime(url);
        if (!result) return res.status(404).json({ status: false, message: "Anime not found" });

        res.json({ status: true, data: result });
    } catch (error) {
        console.error("Detail API Error:", error.message);
        res.status(500).json({ status: false, message: "Failed to fetch details" });
    }
});

// D. Get Episode & Stream Links
app.get("/API/episode", cacheMiddleware, async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: "URL parameter is required" });

        const result = await samehadaku.getEpisode(url);
        if (!result) return res.status(404).json({ status: false, message: "Episode data not found" });

        res.json({ status: true, data: result });
    } catch (error) {
        console.error("Episode API Error:", error.message);
        res.status(500).json({ status: false, message: "Failed to fetch episode" });
    }
});

// E. Image Proxy (Untuk menghindari Mixed Content / Hotlink protection)
app.get("/API/proxy-image", async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).send("URL required");

    try {
        const { gotScraping } = await import("got-scraping");
        
        // Mulai streaming request
        const stream = gotScraping.stream(imageUrl);

        // --- BAGIAN PENTING: FILTER HEADER ---
        stream.on("response", (response) => {
            // Hapus header HTTP/2 (pseudo-headers) agar tidak crash di Express
            delete response.headers[":status"];
            delete response.headers[":method"];
            delete response.headers[":path"];
            delete response.headers[":scheme"];
            delete response.headers[":authority"];

            // Set Cache agar gambar tidak didownload ulang terus menerus
            res.setHeader("Cache-Control", "public, max-age=86400");
            
            // Set Content-Type yang benar dari sumber (misal image/jpeg)
            if (response.headers["content-type"]) {
                res.setHeader("Content-Type", response.headers["content-type"]);
            }
        });

        // Handle jika gambar gagal didownload (404/500 dari sumber)
        stream.on("error", (err) => {
            console.error("Proxy Stream Error:", err.message);
            // Pastikan header belum terkirim sebelum mengirim fallback
            if (!res.headersSent) {
                res.sendFile(path.join(__dirname, "public", "assets", "placeholder.png"));
            }
        });

        // Salirkan data gambar ke respon express
        stream.pipe(res);

    } catch (error) {
        console.error("Proxy Setup Error:", error.message);
        if (!res.headersSent) {
             res.sendFile(path.join(__dirname, "public", "assets", "placeholder.png"));
        }
    }
});

// Route Halaman Search
app.get("/search", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "search.html"));
});

// ==========================================
// 5. SERVER START
// ==========================================

// 404 Handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

if (config.https) {
    try {
        const options = {
            key: fs.readFileSync(config.key),
            cert: fs.readFileSync(config.cert)
        };
        https.createServer(options, app).listen(443, () => {
            console.log("SECURE Server running on https://localhost:443");
        });
    } catch (e) {
        console.error("SSL Configuration Failed:", e.message);
    }
} else {
    app.listen(config.port || 3000, () =>
        console.log(`Server running on http://localhost:${config.port || 3000}`)
    );
}
