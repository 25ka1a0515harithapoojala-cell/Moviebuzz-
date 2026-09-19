const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* =========================================================
   GEMINI
========================================================= */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let ai = null;

if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({
        apiKey: GEMINI_API_KEY
    });
}

const GEMINI_MODEL = "gemini-3.6-flash";

/* =========================================================
   MEMORY CACHE
   No database is used.
========================================================= */

const movieCache = new Map();

/* =========================================================
   BUILT-IN MOVIES
   These work even when Gemini is unavailable.
========================================================= */

const builtInMovies = {

    rrr: {
        title: "RRR",
        originalTitle: "RRR",
        language: "Telugu",
        releaseDate: "25 March 2022",
        year: 2022,
        runtime: "182 minutes",
        certificate: "UA",

        genres: [
            "Action",
            "Drama",
            "Historical Fiction"
        ],

        director: "S. S. Rajamouli",
        producer: "D. V. V. Danayya",

        hero: "N. T. Rama Rao Jr.",
        heroine: "Alia Bhatt",

        cast: [
            "N. T. Rama Rao Jr.",
            "Ram Charan",
            "Alia Bhatt",
            "Ajay Devgn",
            "Shriya Saran",
            "Samuthirakani"
        ],

        choreographer: "Prem Rakshith",
        musicDirector: "M. M. Keeravaani",
        cinematography: "K. K. Senthil Kumar",
        editor: "A. Sreekar Prasad",

        productionCompany: "DVV Entertainment",

        budget: "Approximately ₹550 crore",

        collection: "Over ₹1,200 crore worldwide",

        songs: [
            "Dosti",
            "Naatu Naatu",
            "Janani",
            "Komuram Bheemudo",
            "Raamam Raaghavam",
            "Sholay"
        ],

        story:
            "RRR follows two fictional revolutionaries, Alluri Sitarama Raju and Komaram Bheem, who form a powerful friendship and fight against British colonial rule.",

        description:
            "RRR is a Telugu-language epic action drama directed by S. S. Rajamouli.",

        posterUrl:
            "https://upload.wikimedia.org/wikipedia/en/d/d7/RRR_Poster.jpg",

        posterSource:
            "https://en.wikipedia.org/wiki/RRR",

        posterTitle: "RRR",

        posterProvider: "Wikimedia"
    },

    baahubali: {
        title: "Baahubali: The Beginning",
        originalTitle: "Baahubali: The Beginning",
        language: "Telugu",
        releaseDate: "10 July 2015",
        year: 2015,
        runtime: "159 minutes",
        certificate: "UA",

        genres: [
            "Action",
            "Drama",
            "Epic"
        ],

        director: "S. S. Rajamouli",
        producer:
            "Shobu Yarlagadda and Prasad Devineni",

        hero: "Prabhas",
        heroine: "Anushka Shetty",

        cast: [
            "Prabhas",
            "Rana Daggubati",
            "Anushka Shetty",
            "Tamannaah Bhatia",
            "Ramya Krishnan",
            "Sathyaraj"
        ],

        choreographer: "Prem Rakshith",
        musicDirector: "M. M. Keeravaani",
        cinematography: "K. K. Senthil Kumar",
        editor: "Kotagiri Venkateswara Rao",

        productionCompany: "Arka Media Works",

        budget: "Approximately ₹180 crore",

        collection: "Over ₹600 crore worldwide",

        songs: [
            "Saahore Baahubali",
            "Mamatala Talli",
            "Nippulaa Swasa Ga",
            "Manohari",
            "Dheevara"
        ],

        story:
            "The film follows Shivudu, who discovers his royal heritage and becomes connected to the legendary kingdom of Mahishmati.",

        description:
            "Baahubali: The Beginning is an epic Indian action film directed by S. S. Rajamouli.",

        posterUrl:
            "https://upload.wikimedia.org/wikipedia/en/5/5f/Baahubali_The_Beginning_poster.jpg",

        posterSource:
            "https://en.wikipedia.org/wiki/Baahubali:_The_Beginning",

        posterTitle:
            "Baahubali: The Beginning",

        posterProvider:
            "Wikimedia"
    },

    bahubali: {
        title: "Baahubali: The Beginning",
        originalTitle: "Baahubali: The Beginning",
        language: "Telugu",
        releaseDate: "10 July 2015",
        year: 2015,
        runtime: "159 minutes",
        certificate: "UA",

        genres: [
            "Action",
            "Drama",
            "Epic"
        ],

        director: "S. S. Rajamouli",
        producer:
            "Shobu Yarlagadda and Prasad Devineni",

        hero: "Prabhas",
        heroine: "Anushka Shetty",

        cast: [
            "Prabhas",
            "Rana Daggubati",
            "Anushka Shetty",
            "Tamannaah Bhatia",
            "Ramya Krishnan",
            "Sathyaraj"
        ],

        choreographer: "Prem Rakshith",
        musicDirector: "M. M. Keeravaani",
        cinematography: "K. K. Senthil Kumar",
        editor: "Kotagiri Venkateswara Rao",

        productionCompany: "Arka Media Works",

        budget: "Approximately ₹180 crore",

        collection: "Over ₹600 crore worldwide",

        songs: [
            "Saahore Baahubali",
            "Mamatala Talli",
            "Nippulaa Swasa Ga",
            "Manohari",
            "Dheevara"
        ],

        story:
            "The film follows Shivudu, who discovers his royal heritage and becomes connected to the legendary kingdom of Mahishmati.",

        description:
            "Baahubali: The Beginning is an epic Indian action film directed by S. S. Rajamouli.",

        posterUrl:
            "https://upload.wikimedia.org/wikipedia/en/5/5f/Baahubali_The_Beginning_poster.jpg",

        posterSource:
            "https://en.wikipedia.org/wiki/Baahubali:_The_Beginning",

        posterTitle:
            "Baahubali: The Beginning",

        posterProvider:
            "Wikimedia"
    }
};

/* =========================================================
   GEMINI MOVIE INFORMATION
========================================================= */

async function getMovieFromGemini(movieName) {

    if (!ai) {
        throw new Error(
            "GEMINI_API_KEY is not configured."
        );
    }

    const prompt = `
You are the movie information engine for MovieBuzz.

Give factual information about this Indian movie:

"${movieName}"

Return ONLY valid JSON.

Use exactly this structure:

{
  "title": "",
  "originalTitle": "",
  "language": "",
  "releaseDate": "",
  "year": "",
  "runtime": "",
  "certificate": "",
  "genres": [],
  "director": "",
  "producer": "",
  "hero": "",
  "heroine": "",
  "cast": [],
  "choreographer": "",
  "musicDirector": "",
  "cinematography": "",
  "editor": "",
  "productionCompany": "",
  "budget": "",
  "collection": "",
  "songs": [],
  "story": "",
  "description": ""
}

Rules:

- Give information about the requested movie.
- Do not invent information.
- If information is unavailable, use "Not available".
- songs must be an array.
- Return JSON only.
`;

    const response =
        await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt
        });

    if (!response.text) {
        throw new Error(
            "Gemini returned an empty response."
        );
    }

    let text = response.text.trim();

    if (text.startsWith("```json")) {
        text = text
            .replace(/^```json/, "")
            .replace(/```$/, "")
            .trim();
    }

    if (text.startsWith("```")) {
        text = text
            .replace(/^```/, "")
            .replace(/```$/, "")
            .trim();
    }

    return JSON.parse(text);
}

/* =========================================================
   POSTER SEARCH
========================================================= */

async function getPoster(movieTitle) {

    try {

        const url =
            "https://en.wikipedia.org/w/api.php" +
            "?action=query" +
            "&generator=search" +
            "&gsrsearch=" +
            encodeURIComponent(movieTitle + " film") +
            "&gsrnamespace=0" +
            "&gsrlimit=5" +
            "&prop=pageimages|info" +
            "&piprop=original" +
            "&format=json" +
            "&origin=*";

        const response =
            await fetch(url, {
                headers: {
                    "User-Agent":
                        "MovieBuzz/1.0 (educational movie website)"
                }
            });

        if (!response.ok) {
            console.log(
                "Poster service returned:",
                response.status
            );

            return null;
        }

        const data =
            await response.json();

        if (
            !data.query ||
            !data.query.pages
        ) {
            return null;
        }

        const pages =
            Object.values(
                data.query.pages
            );

        for (const page of pages) {

            if (
                page.original &&
                page.original.source
            ) {

                return {
                    posterUrl:
                        page.original.source,

                    posterSource:
                        "https://en.wikipedia.org/wiki/" +
                        encodeURIComponent(
                            page.title
                        ),

                    posterTitle:
                        page.title,

                    posterProvider:
                        "Wikimedia"
                };
            }
        }

        return null;

    } catch (error) {

        console.log(
            "Poster search error:",
            error.message
        );

        return null;
    }
}

/* =========================================================
   NORMALIZE MOVIE
========================================================= */

function normalizeMovie(movie) {

    return {

        title:
            movie.title ||
            "Unknown",

        originalTitle:
            movie.originalTitle ||
            movie.title ||
            "Unknown",

        language:
            movie.language ||
            "Not available",

        releaseDate:
            movie.releaseDate ||
            "Not available",

        year:
            movie.year ||
            "Not available",

        runtime:
            movie.runtime ||
            "Not available",

        certificate:
            movie.certificate ||
            "Not available",

        genres:
            Array.isArray(movie.genres)
                ? movie.genres
                : [],

        director:
            movie.director ||
            "Not available",

        producer:
            movie.producer ||
            "Not available",

        hero:
            movie.hero ||
            "Not available",

        heroine:
            movie.heroine ||
            "Not available",

        cast:
            Array.isArray(movie.cast)
                ? movie.cast
                : [],

        choreographer:
            movie.choreographer ||
            "Not available",

        musicDirector:
            movie.musicDirector ||
            "Not available",

        cinematography:
            movie.cinematography ||
            "Not available",

        editor:
            movie.editor ||
            "Not available",

        productionCompany:
            movie.productionCompany ||
            "Not available",

        budget:
            movie.budget ||
            "Not available",

        collection:
            movie.collection ||
            "Not available",

        songs:
            Array.isArray(movie.songs)
                ? movie.songs
                : [],

        story:
            movie.story ||
            "Not available",

        description:
            movie.description ||
            "Not available",

        posterUrl:
            movie.posterUrl ||
            "",

        posterSource:
            movie.posterSource ||
            "",

        posterTitle:
            movie.posterTitle ||
            movie.title ||
            "",

        posterProvider:
            movie.posterProvider ||
            ""
    };
}

/* =========================================================
   TEST API
========================================================= */

app.get("/api/test", (req, res) => {

    res.json({
        success: true,
        message:
            "MovieBuzz server is working.",
        geminiConfigured:
            Boolean(GEMINI_API_KEY),
        model:
            GEMINI_MODEL
    });

});

/* =========================================================
   HEALTH
========================================================= */

app.get("/health", (req, res) => {

    res.json({
        success: true,
        status:
            "MovieBuzz server is healthy"
    });

});

/* =========================================================
   MOVIE API
========================================================= */

app.post("/api/movie", async (req, res) => {

    try {

        const movieName =
            String(
                req.body?.movie ||
                req.body?.movieName ||
                req.body?.title ||
                ""
            ).trim();

        console.log("");
        console.log(
            "=========================================="
        );
        console.log(
            "MOVIE SEARCH:",
            movieName
        );
        console.log(
            "=========================================="
        );

        if (!movieName) {

            return res.status(400).json({
                error:
                    "Please enter a movie name."
            });
        }

        const cacheKey =
            movieName.toLowerCase();

        /* -------------------------------------------------
           FIRST: BUILT-IN MOVIES
           This happens BEFORE Gemini.
        ------------------------------------------------- */

        if (builtInMovies[cacheKey]) {

            console.log(
                "Using built-in movie data."
            );

            const movie =
                normalizeMovie(
                    builtInMovies[cacheKey]
                );

            movieCache.set(
                cacheKey,
                movie
            );

            return res.json(movie);
        }

        /* -------------------------------------------------
           SECOND: MEMORY CACHE
        ------------------------------------------------- */

        if (movieCache.has(cacheKey)) {

            console.log(
                "Using cached movie data."
            );

            return res.json(
                movieCache.get(cacheKey)
            );
        }

        /* -------------------------------------------------
           THIRD: GEMINI
        ------------------------------------------------- */

        if (!ai) {

            return res.status(500).json({
                error:
                    "Gemini API key is not configured."
            });
        }

        let movieData;

        try {

            console.log(
                "Searching Gemini..."
            );

            movieData =
                await getMovieFromGemini(
                    movieName
                );

            movieData =
                normalizeMovie(
                    movieData
                );

            console.log(
                "Gemini movie information received."
            );

        } catch (error) {

            console.error(
                "Gemini error:",
                error.message
            );

            const errorText =
                String(error.message)
                    .toLowerCase();

            if (
                errorText.includes("429") ||
                errorText.includes("quota") ||
                errorText.includes(
                    "resource exhausted"
                )
            ) {

                return res.status(429).json({
                    error:
                        "Gemini API quota has been reached. Please try again later."
                });
            }

            if (
                errorText.includes("503") ||
                errorText.includes(
                    "unavailable"
                )
            ) {

                return res.status(503).json({
                    error:
                        "Gemini is temporarily busy. Please try again later."
                });
            }

            return res.status(500).json({
                error:
                    "Unable to get movie information."
            });
        }

        /* -------------------------------------------------
           POSTER
        ------------------------------------------------- */

        if (!movieData.posterUrl) {

            console.log(
                "Searching for movie poster..."
            );

            const poster =
                await getPoster(
                    movieData.title
                );

            if (poster) {

                movieData.posterUrl =
                    poster.posterUrl;

                movieData.posterSource =
                    poster.posterSource;

                movieData.posterTitle =
                    poster.posterTitle;

                movieData.posterProvider =
                    poster.posterProvider;

                console.log(
                    "Poster found."
                );

            } else {

                console.log(
                    "Poster not found."
                );
            }
        }

        /* -------------------------------------------------
           SAVE IN MEMORY
        ------------------------------------------------- */

        movieCache.set(
            cacheKey,
            movieData
        );

        console.log(
            "Movie information successfully created."
        );

        return res.json(
            movieData
        );

    } catch (error) {

        console.error("");
        console.error(
            "=========================================="
        );
        console.error(
            "MOVIE SEARCH ERROR"
        );
        console.error(
            "=========================================="
        );
        console.error(
            error
        );
        console.error(
            "=========================================="
        );

        return res.status(500).json({
            error:
                "Unable to get movie information."
        });
    }
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    HOST,
    () => {

        console.log("");
        console.log(
            "=========================================="
        );
        console.log(
            "        MOVIEBUZZ SERVER STARTED"
        );
        console.log(
            "=========================================="
        );

        console.log(
            `Website: http://localhost:${PORT}`
        );

        console.log(
            "Gemini API:",
            GEMINI_API_KEY
                ? "Configured"
                : "NOT CONFIGURED"
        );

        console.log(
            "Gemini model:",
            GEMINI_MODEL
        );

        console.log(
            "Poster search: Wikimedia / Wikipedia"
        );

        console.log(
            "Database: NONE"
        );

        console.log(
            "=========================================="
        );

        console.log("");
    }
);
