// ============================================================
// MOVIEBUZZ SERVER
// Free Gemini + Free Wikimedia poster search
// No database
// No IMDb API
// No TMDB API
// ============================================================

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));


// ============================================================
// GEMINI API
// ============================================================

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is missing from .env");
}

const ai = new GoogleGenAI({
    apiKey: API_KEY
});


// ============================================================
// COMMON SETTINGS
// ============================================================

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

const REQUEST_HEADERS = {
    "User-Agent":
        "MovieBuzz/1.0 (movie information website)"
};


// ============================================================
// SMALL HELPER
// ============================================================

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function getWords(text) {
    return normalizeText(text)
        .split(" ")
        .filter(word => word.length >= 3);
}


function stripHTML(text) {
    return String(text || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}


function makeAbsoluteUrl(url) {
    if (!url) {
        return "";
    }

    if (url.startsWith("//")) {
        return "https:" + url;
    }

    return url;
}


// ============================================================
// FETCH JSON SAFELY
// ============================================================

async function fetchJSON(url) {

    const response = await fetch(url, {
        headers: REQUEST_HEADERS
    });

    if (!response.ok) {
        throw new Error(
            `Request failed with HTTP ${response.status}`
        );
    }

    return await response.json();
}


// ============================================================
// POSTER SCORING
// ============================================================
//
// We do NOT simply take the first image.
//
// We score the image based on:
// - movie title match
// - words like "poster"
// - "theatrical release poster"
// - portrait shape
// - high resolution
// - avoiding actor/director/portrait/still images
// ============================================================

function scorePosterImage(image, movieTitle) {

    if (!image) {
        return -9999;
    }

    const requestedWords = getWords(movieTitle);

    const fileName = normalizeText(
        image.title || image.fileName || ""
    );

    const description = normalizeText(
        stripHTML(image.description || "")
    );

    const combined =
        `${fileName} ${description}`;

    let score = 0;


    // --------------------------------------------------------
    // Movie title matching
    // --------------------------------------------------------

    for (const word of requestedWords) {

        if (combined.includes(word)) {
            score += 15;
        }
    }


    // Exact movie name
    const normalizedMovie =
        normalizeText(movieTitle);

    if (
        normalizedMovie &&
        combined.includes(normalizedMovie)
    ) {
        score += 80;
    }


    // --------------------------------------------------------
    // Strong poster words
    // --------------------------------------------------------

    const posterWords = [
        "poster",
        "theatrical poster",
        "theatrical release poster",
        "film poster",
        "movie poster",
        "official poster",
        "release poster",
        "first look poster"
    ];

    for (const word of posterWords) {

        if (combined.includes(normalizeText(word))) {
            score += 100;
        }
    }


    // --------------------------------------------------------
    // Positive movie-image words
    // --------------------------------------------------------

    const positiveWords = [
        "film",
        "movie",
        "theatrical",
        "release",
        "first look",
        "official",
        "cover"
    ];

    for (const word of positiveWords) {

        if (combined.includes(normalizeText(word))) {
            score += 12;
        }
    }


    // --------------------------------------------------------
    // BAD WORDS
    //
    // These commonly indicate that the image is a person
    // rather than the actual movie poster.
    // --------------------------------------------------------

    const badWords = [
        "actor",
        "actress",
        "director",
        "producer",
        "singer",
        "composer",
        "choreographer",
        "portrait",
        "headshot",
        "person",
        "celebrity",
        "selfie",
        "interview",
        "premiere",
        "award",
        "wedding",
        "birthday",
        "behind the scenes",
        "behind scenes",
        "still",
        "scene",
        "screenshot",
        "event",
        "press meet",
        "press conference",
        "instagram",
        "twitter",
        "facebook"
    ];

    for (const word of badWords) {

        if (combined.includes(normalizeText(word))) {
            score -= 100;
        }
    }


    // --------------------------------------------------------
    // IMAGE DIMENSIONS
    // --------------------------------------------------------

    const width =
        Number(image.width) || 0;

    const height =
        Number(image.height) || 0;


    if (width > 0 && height > 0) {

        const ratio = width / height;


        // Movie posters are usually vertical.
        if (ratio >= 0.50 && ratio <= 0.85) {
            score += 70;
        }

        // Very vertical poster.
        if (ratio >= 0.55 && ratio <= 0.75) {
            score += 30;
        }

        // Landscape image is less likely to be a poster.
        if (ratio > 1.20) {
            score -= 70;
        }


        // Resolution bonus.
        const pixels = width * height;

        if (pixels >= 1000000) {
            score += 30;
        }

        if (pixels >= 2000000) {
            score += 20;
        }

        if (pixels >= 4000000) {
            score += 20;
        }


        // Very small image.
        if (width < 400 || height < 500) {
            score -= 50;
        }
    }


    return score;
}


// ============================================================
// GET IMAGE INFORMATION FOR A WIKIPEDIA FILE
// ============================================================

async function getWikipediaImageInfo(fileName) {

    if (!fileName) {
        return null;
    }

    const params = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        titles: `File:${fileName}`,
        prop: "imageinfo",
        iiprop: "url|size|extmetadata"
    });

    const url =
        `${WIKI_API}?${params.toString()}`;

    try {

        const data =
            await fetchJSON(url);

        if (
            !data.query ||
            !data.query.pages ||
            !data.query.pages.length
        ) {
            return null;
        }

        const page =
            data.query.pages[0];

        if (
            !page.imageinfo ||
            !page.imageinfo.length
        ) {
            return null;
        }

        const info =
            page.imageinfo[0];

        let description = "";

        if (
            info.extmetadata &&
            info.extmetadata.ImageDescription
        ) {
            description =
                info.extmetadata.ImageDescription.value;
        }

        return {
            title: page.title || fileName,
            fileName: fileName,
            imageUrl: makeAbsoluteUrl(info.url),
            width: Number(info.width) || 0,
            height: Number(info.height) || 0,
            description: stripHTML(description)
        };

    } catch (error) {

        console.log(
            "Wikipedia image information error:",
            error.message
        );

        return null;
    }
}


// ============================================================
// SEARCH WIKIPEDIA MOVIE PAGES
// ============================================================

async function searchWikipediaMoviePages(movieTitle) {

    const searches = [
        `${movieTitle} film`,
        `${movieTitle} Indian film`,
        movieTitle
    ];

    const results = [];

    for (const searchText of searches) {

        try {

            const params = new URLSearchParams({
                action: "query",
                format: "json",
                formatversion: "2",
                list: "search",
                srsearch: searchText,
                srnamespace: "0",
                srlimit: "8"
            });

            const url =
                `${WIKI_API}?${params.toString()}`;

            const data =
                await fetchJSON(url);

            if (
                data.query &&
                data.query.search
            ) {

                for (
                    const item of data.query.search
                ) {

                    if (
                        item.title &&
                        !results.some(
                            x => x.title === item.title
                        )
                    ) {
                        results.push(item);
                    }
                }
            }

        } catch (error) {

            console.log(
                "Wikipedia movie search error:",
                error.message
            );
        }
    }

    return results;
}


// ============================================================
// GET LEAD IMAGE FROM A WIKIPEDIA MOVIE PAGE
// ============================================================

async function getWikipediaLeadImage(pageTitle) {

    try {

        const params = new URLSearchParams({
            action: "query",
            format: "json",
            formatversion: "2",
            redirects: "1",
            titles: pageTitle,
            prop: "pageimages",
            piprop: "original|name",
            pilicense: "any"
        });

        const url =
            `${WIKI_API}?${params.toString()}`;

        const data =
            await fetchJSON(url);

        if (
            !data.query ||
            !data.query.pages ||
            !data.query.pages.length
        ) {
            return null;
        }

        const page =
            data.query.pages[0];

        if (!page.original) {
            return null;
        }

        const fileName =
            page.pageimage || "";

        let description = "";

        if (fileName) {

            const imageInfo =
                await getWikipediaImageInfo(fileName);

            if (imageInfo) {
                description =
                    imageInfo.description || "";
            }
        }

        return {
            title: fileName || pageTitle,
            fileName: fileName,
            imageUrl: makeAbsoluteUrl(
                page.original.source
            ),
            width:
                Number(page.original.width) || 0,
            height:
                Number(page.original.height) || 0,
            description: description,
            wikipedia:
                "https://en.wikipedia.org/wiki/" +
                encodeURIComponent(
                    page.title.replace(/ /g, "_")
                )
        };

    } catch (error) {

        console.log(
            "Wikipedia lead-image error:",
            error.message
        );

        return null;
    }
}


// ============================================================
// FIND POSTER FROM WIKIPEDIA
// ============================================================

async function findWikipediaPoster(movieTitle) {

    console.log(
        `Searching Wikipedia poster for: ${movieTitle}`
    );

    const pages =
        await searchWikipediaMoviePages(movieTitle);

    if (!pages.length) {
        return null;
    }


    const candidates = [];


    for (const page of pages) {

        const title =
            page.title || "";

        const normalizedPageTitle =
            normalizeText(title);

        const normalizedMovie =
            normalizeText(movieTitle);


        // Ignore obviously unrelated people pages.
        if (
            normalizedPageTitle.includes("actor") ||
            normalizedPageTitle.includes("actress") ||
            normalizedPageTitle.includes("director")
        ) {
            continue;
        }


        const image =
            await getWikipediaLeadImage(title);

        if (!image) {
            continue;
        }


        let score =
            scorePosterImage(
                image,
                movieTitle
            );


        // ----------------------------------------------------
        // PAGE TITLE MATCH
        // ----------------------------------------------------

        if (
            normalizedPageTitle === normalizedMovie
        ) {
            score += 200;
        }


        if (
            normalizedPageTitle.startsWith(
                normalizedMovie
            )
        ) {
            score += 100;
        }


        if (
            normalizedPageTitle.includes(
                normalizedMovie
            )
        ) {
            score += 60;
        }


        // Film page bonus.
        if (
            normalizedPageTitle.includes("film")
        ) {
            score += 20;
        }


        candidates.push({
            ...image,
            score: score,
            pageTitle: title
        });
    }


    if (!candidates.length) {
        return null;
    }


    candidates.sort(
        (a, b) => b.score - a.score
    );


    console.log(
        "Wikipedia poster candidates:"
    );

    candidates
        .slice(0, 5)
        .forEach((candidate, index) => {

            console.log(
                `${index + 1}. ${candidate.pageTitle} | ` +
                `${candidate.fileName} | ` +
                `score=${candidate.score} | ` +
                `${candidate.width}x${candidate.height}`
            );
        });


    const best =
        candidates[0];


    // Only accept a reasonably strong candidate.
    if (best.score < 40) {
        console.log(
            "Wikipedia result was not strong enough."
        );

        return null;
    }


    console.log(
        "Wikipedia poster selected:",
        best.fileName
    );


    return {
        image: best.imageUrl,
        wikipedia:
            best.wikipedia ||
            "https://en.wikipedia.org/wiki/" +
            encodeURIComponent(
                best.pageTitle.replace(/ /g, "_")
            ),
        title: best.fileName,
        width: best.width,
        height: best.height,
        score: best.score
    };
}


// ============================================================
// SEARCH WIKIMEDIA COMMONS FOR POSTERS
// ============================================================
//
// This is our second free source.
//
// We search the FILE namespace specifically.
// ============================================================

async function searchCommonsPosters(movieTitle) {

    console.log(
        `Searching Wikimedia Commons for: ${movieTitle}`
    );


    const searches = [
        `"${movieTitle}" poster`,
        `${movieTitle} film poster`,
        `${movieTitle} theatrical poster`,
        `${movieTitle} movie`
    ];


    const candidates = [];


    for (const searchText of searches) {

        try {

            const params = new URLSearchParams({
                action: "query",
                format: "json",
                formatversion: "2",
                generator: "search",
                gsrsearch: searchText,
                gsrnamespace: "6",
                gsrlimit: "12",
                prop: "imageinfo",
                iiprop: "url|size|extmetadata"
            });


            const url =
                `${COMMONS_API}?${params.toString()}`;


            const data =
                await fetchJSON(url);


            if (
                !data.query ||
                !data.query.pages
            ) {
                continue;
            }


            for (const page of data.query.pages) {

                if (
                    !page.imageinfo ||
                    !page.imageinfo.length
                ) {
                    continue;
                }


                const info =
                    page.imageinfo[0];


                let description = "";


                if (
                    info.extmetadata &&
                    info.extmetadata.ImageDescription
                ) {

                    description =
                        info.extmetadata
                            .ImageDescription.value;
                }


                const candidate = {

                    title:
                        page.title || "",

                    fileName:
                        page.title || "",

                    imageUrl:
                        makeAbsoluteUrl(info.url),

                    width:
                        Number(info.width) || 0,

                    height:
                        Number(info.height) || 0,

                    description:
                        stripHTML(description)
                };


                candidate.score =
                    scorePosterImage(
                        candidate,
                        movieTitle
                    );


                candidates.push(candidate);
            }


        } catch (error) {

            console.log(
                "Commons search error:",
                error.message
            );
        }
    }


    if (!candidates.length) {
        return null;
    }


    // Remove duplicate image URLs.
    const unique = [];

    for (const candidate of candidates) {

        if (
            !unique.some(
                x =>
                    x.imageUrl ===
                    candidate.imageUrl
            )
        ) {
            unique.push(candidate);
        }
    }


    unique.sort(
        (a, b) => b.score - a.score
    );


    console.log(
        "Commons poster candidates:"
    );


    unique
        .slice(0, 5)
        .forEach((candidate, index) => {

            console.log(
                `${index + 1}. ` +
                `${candidate.fileName} | ` +
                `score=${candidate.score} | ` +
                `${candidate.width}x${candidate.height}`
            );
        });


    const best =
        unique[0];


    if (!best || best.score < 40) {

        console.log(
            "Commons result was not strong enough."
        );

        return null;
    }


    console.log(
        "Commons poster selected:",
        best.fileName
    );


    return {
        image: best.imageUrl,
        wikipedia:
            "https://commons.wikimedia.org/wiki/" +
            encodeURIComponent(
                best.fileName.replace(/ /g, "_")
            ),
        title: best.fileName,
        width: best.width,
        height: best.height,
        score: best.score
    };
}


// ============================================================
// MAIN POSTER FINDER
// ============================================================
//
// Order:
//
// 1. Wikipedia exact/strong movie page
// 2. Wikimedia Commons poster search
// 3. Wikipedia broader search
//
// No database is used.
// ============================================================

async function getMoviePoster(movieTitle) {

    console.log("");
    console.log(
        "=========================================="
    );
    console.log(
        `POSTER SEARCH: ${movieTitle}`
    );
    console.log(
        "=========================================="
    );


    // --------------------------------------------------------
    // 1. Wikipedia
    // --------------------------------------------------------

    const wikipediaPoster =
        await findWikipediaPoster(movieTitle);


    if (wikipediaPoster) {

        console.log(
            "POSTER SOURCE: Wikipedia"
        );

        console.log(
            "POSTER URL:",
            wikipediaPoster.image
        );

        return {
            image: wikipediaPoster.image,
            wikipedia: wikipediaPoster.wikipedia,
            title: wikipediaPoster.title,
            width: wikipediaPoster.width,
            height: wikipediaPoster.height,
            source: "Wikipedia"
        };
    }


    // --------------------------------------------------------
    // 2. Wikimedia Commons
    // --------------------------------------------------------

    const commonsPoster =
        await searchCommonsPosters(movieTitle);


    if (commonsPoster) {

        console.log(
            "POSTER SOURCE: Wikimedia Commons"
        );

        console.log(
            "POSTER URL:",
            commonsPoster.image
        );

        return {
            image: commonsPoster.image,
            wikipedia: commonsPoster.wikipedia,
            title: commonsPoster.title,
            width: commonsPoster.width,
            height: commonsPoster.height,
            source: "Wikimedia Commons"
        };
    }


    // --------------------------------------------------------
    // No good image found.
    //
    // We DO NOT return a random actor/director photo.
    // --------------------------------------------------------

    console.log(
        "No reliable poster candidate found."
    );

    return null;
}


// ============================================================
// GEMINI REQUEST WITH RETRIES
// ============================================================

async function askGemini(prompt) {

    const maxAttempts = 4;


    for (
        let attempt = 1;
        attempt <= maxAttempts;
        attempt++
    ) {

        try {

            console.log(
                `Gemini attempt ${attempt}/${maxAttempts}`
            );


            const response =
                await ai.models.generateContent({

                    model:
                        "gemini-3.6-flash",

                    contents:
                        prompt,

                    config: {
                        responseMimeType:
                            "application/json"
                    }
                });


            if (!response.text) {

                throw new Error(
                    "Gemini returned an empty response."
                );
            }


            console.log(
                "Gemini response received."
            );


            return response.text;


        } catch (error) {

            const message =
                String(
                    error.message || ""
                ).toLowerCase();


            const retryable =
                message.includes("503") ||
                message.includes("429") ||
                message.includes("unavailable") ||
                message.includes("resource_exhausted") ||
                message.includes("high demand");


            console.error(
                `Gemini attempt ${attempt} failed:`,
                error.message
            );


            if (
                !retryable ||
                attempt === maxAttempts
            ) {

                throw error;
            }


            const waitTime =
                attempt * 2500;


            console.log(
                `Waiting ${waitTime}ms before retry...`
            );


            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        waitTime
                    )
            );
        }
    }


    throw new Error(
        "Gemini request failed."
    );
}


// ============================================================
// MOVIE API
// ============================================================

app.post("/api/movie", async (req, res) => {

    try {

        const movieName =
            String(
                req.body.movie || ""
            ).trim();


        if (!movieName) {

            return res.status(400).json({

                error:
                    "Please enter a movie name."
            });
        }


        console.log("");
        console.log(
            "======================================"
        );
        console.log(
            `MOVIE SEARCH: ${movieName}`
        );
        console.log(
            "======================================"
        );


        // ====================================================
        // GEMINI PROMPT
        // ====================================================

        const prompt = `

You are the movie information engine for a website called MovieBuzz.

The user searched for this movie:

"${movieName}"

Return accurate information about the movie.

IMPORTANT:
- Do not invent information.
- If a field is genuinely unknown, write "Not available".
- songs must be an array of strings.
- Return ONLY valid JSON.
- Do not use Markdown.
- Do not put JSON inside code fences.

Return exactly this structure:

{
  "title": "",
  "director": "",
  "hero": "",
  "heroine": "",
  "choreographer": "",
  "releaseDate": "",
  "collection": "",
  "producer": "",
  "musicDirector": "",
  "language": "",
  "genre": "",
  "songs": [],
  "description": ""
}

For "title", return the official/common movie title.
For "director", return the director.
For "hero", return the main male lead.
For "heroine", return the main female lead.
For "choreographer", return the choreographer when known.
For "releaseDate", return the original theatrical release date when known.
For "collection", return box-office collection when reliably known.
For "producer", return the producer.
For "musicDirector", return the music director/composer.
For "language", return the main language.
For "genre", return the movie genre.
For "songs", return the known songs as an array.
For "description", give a short description of the movie.

`;


        // ====================================================
        // ASK GEMINI
        // ====================================================

        const text =
            await askGemini(prompt);


        // ====================================================
        // PARSE GEMINI JSON
        // ====================================================

        let movieData;


        try {

            movieData =
                JSON.parse(text);

        } catch (jsonError) {

            console.error(
                "Gemini returned invalid JSON:"
            );

            console.error(text);


            throw new Error(
                "Gemini returned invalid movie data."
            );
        }


        console.log(
            "Movie information successfully created."
        );


        // ====================================================
        // FIND REAL POSTER
        // ====================================================

        const poster =
            await getMoviePoster(
                movieData.title ||
                movieName
            );


        // ====================================================
        // ATTACH POSTER INFORMATION
        // ====================================================

        if (poster) {

            movieData.posterUrl =
                poster.image;

            movieData.posterSource =
                poster.wikipedia;

            movieData.posterTitle =
                poster.title;

            movieData.posterWidth =
                poster.width;

            movieData.posterHeight =
                poster.height;

            movieData.posterProvider =
                poster.source;

        } else {

            // We intentionally do NOT use a random
            // actor/director image.

            movieData.posterUrl = "";

            movieData.posterSource = "";

            movieData.posterTitle = "";

            movieData.posterWidth = 0;

            movieData.posterHeight = 0;

            movieData.posterProvider =
                "No reliable poster source found";
        }


        console.log(
            "Final poster:",
            movieData.posterUrl ||
            "none"
        );


        // ====================================================
        // SEND RESULT TO WEBSITE
        // ====================================================

        res.json(movieData);


    } catch (error) {

        console.error("");
        console.error(
            "======================================"
        );
        console.error(
            "MOVIE SEARCH ERROR"
        );
        console.error(
            "======================================"
        );
        console.error(error);
        console.error(
            "======================================"
        );
        console.error("");


        res.status(500).json({

            error:
                error.message ||
                "Movie search failed."
        });
    }
});


// ============================================================
// GEMINI CONNECTION TEST
// ============================================================

app.get("/api/test", async (req, res) => {

    try {

        const response =
            await ai.models.generateContent({

                model:
                    "gemini-3.6-flash",

                contents:
                    "Reply with exactly: MovieBuzz Gemini connection successful."
            });


        res.json({

            success: true,

            message:
                response.text
        });


    } catch (error) {

        console.error(
            "Gemini test error:",
            error
        );


        res.status(500).json({

            success: false,

            error:
                error.message
        });
    }
});


// ============================================================
// START SERVER
// ============================================================

const PORT = 3000;

app.listen(PORT, () => {

    console.log("");
    console.log(
        "======================================"
    );
    console.log(
        "       MOVIEBUZZ SERVER STARTED"
    );
    console.log(
        "======================================"
    );
    console.log(
        `Website: http://localhost:${PORT}`
    );
    console.log(
        "Gemini API: Ready"
    );
    console.log(
        "Poster search: Free Wikimedia APIs"
    );
    console.log(
        "Database: NONE"
    );
    console.log(
        "======================================"
    );
    console.log("");
});