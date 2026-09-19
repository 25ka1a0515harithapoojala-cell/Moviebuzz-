const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

const cache = new Map();

const USER_AGENT =
    "MovieBuzz/2.0 (educational movie website; https://moviebuzz-huxb.onrender.com/)";

/* =========================================================
   GENERAL HELPERS
========================================================= */

async function fetchJSON(url, timeout = 15000) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}

function clean(value) {
    return String(value ?? "").trim();
}

function unique(values) {
    return [
        ...new Set(
            values
                .map(clean)
                .filter(Boolean)
        )
    ];
}

function people(value) {
    if (!value) return [];

    return clean(value)
        .split(/,\s*|\n+/)
        .map(stripWiki)
        .filter(Boolean);
}

function stripWiki(text) {
    return clean(text
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
        .replace(/<ref[^>]*\/>/gi, "")
        .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/'''/g, "")
        .replace(/''/g, "")
        .replace(/<br\s*\/?>/gi, ", ")
        .replace(/<!--[\s\S]*?-->/g, "")
    );
}

/* =========================================================
   IMDbOT / FREE MOVIE DATABASE
   No API key required.
========================================================= */

function normalizeIMDbItem(item) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const get = (...keys) => {
        for (const key of keys) {
            if (
                item[key] !== undefined &&
                item[key] !== null
            ) {
                return item[key];
            }
        }

        return "";
    };

    return {
        title: clean(
            get("#TITLE", "title", "Title")
        ),

        year: clean(
            get("#YEAR", "year", "Year")
        ),

        imdbId: clean(
            get("#IMDB_ID", "imdb_id", "imdbId")
        ),

        imdbUrl: clean(
            get("#IMDB_URL", "imdb_url", "imdbUrl")
        ),

        posterUrl: clean(
            get("#IMG_POSTER", "poster", "Poster")
        ),

        actors: clean(
            get("#ACTORS", "actors", "Actors")
        ),

        plot: clean(
            get("#PLOT", "plot", "Plot")
        ),

        aka: clean(
            get("#AKA", "aka", "AKA")
        ),

        rank:
            Number(
                get("#RANK", "rank", "Rank")
            ) || 999999
    };
}

function imdbResults(data) {
    let raw = [];

    if (Array.isArray(data)) {
        raw = data;
    }

    else if (Array.isArray(data?.description)) {
        raw = data.description;
    }

    else if (Array.isArray(data?.results)) {
        raw = data.results;
    }

    else if (Array.isArray(data?.items)) {
        raw = data.items;
    }

    else if (
        data?.["#TITLE"] ||
        data?.title ||
        data?.Title
    ) {
        raw = [data];
    }

    return raw
        .map(normalizeIMDbItem)
        .filter(Boolean)
        .filter(
            item =>
                item.title ||
                item.imdbId
        );
}

function scoreIMDb(item, query) {
    const q = clean(query).toLowerCase();

    const title =
        item.title.toLowerCase();

    const aka =
        item.aka.toLowerCase();

    let score = 0;

    if (title === q) {
        score += 1000;
    }

    if (title.startsWith(q)) {
        score += 300;
    }

    if (title.includes(q)) {
        score += 150;
    }

    if (aka.includes(q)) {
        score += 75;
    }

    if (item.posterUrl) {
        score += 20;
    }

    return score -
        item.rank / 100000;
}

async function searchIMDb(query) {
    const url =
        "https://imdb.iamidiotareyoutoo.com/search?q=" +
        encodeURIComponent(query);

    const data =
        await fetchJSON(url);

    const results =
        imdbResults(data);

    if (!results.length) {
        return null;
    }

    results.sort(
        (a, b) =>
            scoreIMDb(b, query) -
            scoreIMDb(a, query)
    );

    return results[0];
}

/* =========================================================
   WIKIPEDIA / WIKIMEDIA
========================================================= */

async function searchWikipedia(title) {
    const url =
        "https://en.wikipedia.org/w/api.php" +
        "?action=query" +
        "&generator=search" +
        "&gsrsearch=" +
        encodeURIComponent(`${title} film`) +
        "&gsrnamespace=0" +
        "&gsrlimit=5" +
        "&prop=pageimages|info|pageprops|extracts|revisions" +
        "&piprop=original" +
        "&ppprop=wikibase_item" +
        "&exintro=1" +
        "&explaintext=1" +
        "&inprop=url" +
        "&rvprop=content" +
        "&rvslots=main" +
        "&format=json" +
        "&formatversion=2" +
        "&origin=*";

    const data =
        await fetchJSON(url);

    const pages =
        data?.query?.pages || [];

    if (!pages.length) {
        return null;
    }

    const q =
        clean(title).toLowerCase();

    pages.sort((a, b) => {
        const at =
            clean(a.title).toLowerCase();

        const bt =
            clean(b.title).toLowerCase();

        const as =
            at === q
                ? 100
                : at.startsWith(q)
                    ? 50
                    : at.includes(q)
                        ? 20
                        : 0;

        const bs =
            bt === q
                ? 100
                : bt.startsWith(q)
                    ? 50
                    : bt.includes(q)
                        ? 20
                        : 0;

        return bs - as;
    });

    const page = pages[0];

    return {
        title:
            page.title ||
            title,

        url:
            page.fullurl ||
            `https://en.wikipedia.org/wiki/${encodeURIComponent(
                String(
                    page.title ||
                    title
                ).replace(/ /g, "_")
            )}`,

        qid:
            page.pageprops?.wikibase_item ||
            "",

        extract:
            clean(page.extract),

        posterUrl:
            clean(page.original?.source),

        wikitext:
            page.revisions?.[0]
                ?.slots?.main?.content ||
            ""
    };
}

/* =========================================================
   WIKIPEDIA INFOBOX
========================================================= */

function infoboxField(wikitext, names) {
    if (!wikitext) {
        return "";
    }

    const regex = new RegExp(
        `\\|\\s*(?:${names.join("|")})\\s*=\\s*([\\s\\S]*?)(?=\\n\\s*\\|\\s*[^|=]+\\s*=|\\n\\s*\\}\\}\\s*$)`,
        "i"
    );

    const match =
        wikitext.match(regex);

    return match
        ? stripWiki(match[1])
        : "";
}

/* =========================================================
   WIKIDATA
========================================================= */

async function getWikidata(qid) {
    if (!qid) {
        return null;
    }

    const url =
        "https://www.wikidata.org/w/api.php" +
        "?action=wbgetentities" +
        "&ids=" +
        encodeURIComponent(qid) +
        "&props=claims" +
        "&format=json";

    const data =
        await fetchJSON(url);

    return data?.entities?.[qid] || null;
}

function claimIds(entity, property) {
    return (
        entity?.claims?.[property] || []
    )
        .map(claim => {
            const value =
                claim?.mainsnak
                    ?.datavalue
                    ?.value;

            if (
                value &&
                typeof value === "object" &&
                value["entity-type"] === "item" &&
                value["numeric-id"]
            ) {
                return `Q${value["numeric-id"]}`;
            }

            return null;
        })
        .filter(Boolean);
}

function claimDate(entity, property) {
    const value =
        entity?.claims?.[property]?.[0]
            ?.mainsnak
            ?.datavalue
            ?.value;

    if (!value?.time) {
        return "";
    }

    return value.time
        .replace(/^\+/, "")
        .slice(0, 10);
}

function claimQuantity(entity, property) {
    const value =
        entity?.claims?.[property]?.[0]
            ?.mainsnak
            ?.datavalue
            ?.value;

    return value?.amount
        ? String(value.amount)
            .replace("+", "")
        : "";
}

async function labelsFor(ids) {
    const list =
        unique(ids).slice(0, 50);

    if (!list.length) {
        return {};
    }

    const url =
        "https://www.wikidata.org/w/api.php" +
        "?action=wbgetentities" +
        "&ids=" +
        encodeURIComponent(
            list.join("|")
        ) +
        "&props=labels" +
        "&languages=en" +
        "&languagefallback=1" +
        "&format=json";

    const data =
        await fetchJSON(url);

    const result = {};

    for (
        const [id, entity]
        of Object.entries(
            data?.entities || {}
        )
    ) {
        result[id] =
            entity?.labels?.en?.value ||
            id;
    }

    return result;
}

async function enrichWikidata(movie, qid) {
    if (!qid) {
        return movie;
    }

    try {
        const entity =
            await getWikidata(qid);

        if (!entity) {
            return movie;
        }

        const props = [
            "P57",
            "P161",
            "P1809",
            "P162",
            "P86",
            "P344",
            "P1040",
            "P272",
            "P136",
            "P364"
        ];

        const ids =
            props.flatMap(
                property =>
                    claimIds(
                        entity,
                        property
                    )
            );

        const labels =
            await labelsFor(ids);

        const names = property =>
            claimIds(
                entity,
                property
            ).map(
                id =>
                    labels[id] ||
                    id
            );

        const director =
            names("P57");

        const cast =
            names("P161");

        const choreographer =
            names("P1809");

        const producer =
            names("P162");

        const composer =
            names("P86");

        const cinematographer =
            names("P344");

        const editor =
            names("P1040");

        const company =
            names("P272");

        const genres =
            names("P136");

        const language =
            names("P364");

        if (director.length) {
            movie.director =
                director.join(", ");
        }

        if (cast.length) {
            movie.cast = cast;
        }

        if (choreographer.length) {
            movie.choreographer =
                choreographer.join(", ");
        }

        if (producer.length) {
            movie.producer =
                producer.join(", ");
        }

        if (composer.length) {
            movie.musicDirector =
                composer.join(", ");
        }

        if (cinematographer.length) {
            movie.cinematography =
                cinematographer.join(", ");
        }

        if (editor.length) {
            movie.editor =
                editor.join(", ");
        }

        if (company.length) {
            movie.productionCompany =
                company.join(", ");
        }

        if (genres.length) {
            movie.genres = genres;
            movie.genre =
                genres.join(", ");
        }

        if (language.length) {
            movie.language =
                language.join(", ");
        }

        const release =
            claimDate(
                entity,
                "P577"
            );

        if (release) {
            movie.year =
                release.slice(0, 4);

            movie.releaseDate =
                formatDate(release);
        }

        const budget =
            claimQuantity(
                entity,
                "P2130"
            );

        if (budget) {
            movie.budget =
                formatNumber(budget);
        }

        const gross =
            claimQuantity(
                entity,
                "P2142"
            );

        if (gross) {
            movie.collection =
                formatNumber(gross);
        }

        return movie;

    } catch (error) {
        console.warn(
            "Wikidata skipped:",
            error.message
        );

        return movie;
    }
}

/* =========================================================
   FORMATTING
========================================================= */

function formatDate(value) {
    const d =
        new Date(
            value +
            "T00:00:00Z"
        );

    if (
        Number.isNaN(
            d.getTime()
        )
    ) {
        return value;
    }

    return d.toLocaleDateString(
        "en-GB",
        {
            day: "2-digit",
            month: "long",
            year: "numeric",
            timeZone: "UTC"
        }
    );
}

function formatNumber(value) {
    const n =
        Number(
            String(value)
                .replace(
                    /[^\d.-]/g,
                    ""
                )
        );

    return Number.isFinite(n)
        ? new Intl.NumberFormat(
            "en-IN",
            {
                maximumFractionDigits: 0
            }
        ).format(n)
        : clean(value);
}

/* =========================================================
   FINAL MOVIE FORMAT
========================================================= */

function normalizeMovie(
    movie,
    requested
) {
    return {
        title:
            clean(movie.title) ||
            requested,

        originalTitle:
            clean(
                movie.originalTitle
            ) ||
            clean(movie.title) ||
            requested,

        language:
            clean(movie.language) ||
            "Not available",

        releaseDate:
            clean(
                movie.releaseDate
            ) ||
            (
                movie.year
                    ? String(movie.year)
                    : "Not available"
            ),

        year:
            clean(movie.year) ||
            "Not available",

        runtime:
            clean(movie.runtime) ||
            "Not available",

        certificate:
            clean(movie.certificate) ||
            "Not available",

        genres:
            Array.isArray(movie.genres)
                ? unique(movie.genres)
                : [],

        genre:
            clean(movie.genre) ||
            (
                Array.isArray(
                    movie.genres
                )
                    ? movie.genres.join(", ")
                    : "Not available"
            ),

        director:
            clean(movie.director) ||
            "Not available",

        producer:
            clean(movie.producer) ||
            "Not available",

        hero:
            clean(movie.hero) ||
            "Not available",

        heroine:
            clean(movie.heroine) ||
            "Not available",

        cast:
            Array.isArray(movie.cast)
                ? unique(movie.cast)
                : [],

        choreographer:
            clean(
                movie.choreographer
            ) ||
            "Not available",

        musicDirector:
            clean(
                movie.musicDirector
            ) ||
            "Not available",

        cinematography:
            clean(
                movie.cinematography
            ) ||
            "Not available",

        editor:
            clean(movie.editor) ||
            "Not available",

        productionCompany:
            clean(
                movie.productionCompany
            ) ||
            "Not available",

        budget:
            clean(movie.budget) ||
            "Not available",

        collection:
            clean(movie.collection) ||
            "Not available",

        songs:
            Array.isArray(movie.songs)
                ? unique(movie.songs)
                : [],

        story:
            clean(movie.story) ||
            clean(movie.plot) ||
            "Not available",

        description:
            clean(
                movie.description
            ) ||
            clean(movie.plot) ||
            "Movie information retrieved from public movie sources.",

        imdbId:
            clean(movie.imdbId),

        imdbUrl:
            clean(movie.imdbUrl),

        posterUrl:
            clean(movie.posterUrl),

        posterSource:
            clean(movie.posterSource),

        posterTitle:
            clean(
                movie.posterTitle
            ) ||
            clean(movie.title) ||
            requested,

        posterProvider:
            clean(
                movie.posterProvider
            )
    };
}

/* =========================================================
   MAIN MOVIE SEARCH
   GEMINI IS NOT USED.
========================================================= */

app.post(
    "/api/movie",
    async (req, res) => {

        const movieName =
            clean(
                req.body?.movie ||
                req.body?.movieName ||
                req.body?.title
            );

        if (!movieName) {
            return res.status(400).json({
                error:
                    "Please enter a movie name."
            });
        }

        const key =
            movieName.toLowerCase();

        /* CACHE */

        if (cache.has(key)) {
            console.log(
                `CACHE HIT: ${movieName}`
            );

            return res.json(
                cache.get(key)
            );
        }

        console.log(
            `MOVIE SEARCH: ${movieName}`
        );

        let imdb = null;
        let wiki = null;

        /* =================================================
           SOURCE 1: IMDbOT
        ================================================= */

        try {
            imdb =
                await searchIMDb(
                    movieName
                );

            if (imdb) {
                console.log(
                    `IMDbOT: ${imdb.title}`
                );
            }

        } catch (error) {
            console.warn(
                "IMDbOT failed:",
                error.message
            );
        }

        /* =================================================
           SOURCE 2: WIKIPEDIA
        ================================================= */

        const title =
            imdb?.title ||
            movieName;

        try {
            wiki =
                await searchWikipedia(
                    title
                );

            if (wiki) {
                console.log(
                    `Wikipedia: ${wiki.title}`
                );
            }

        } catch (error) {
            console.warn(
                "Wikipedia failed:",
                error.message
            );
        }

        /* =================================================
           CREATE MOVIE OBJECT
        ================================================= */

        let movie = {

            title:
                imdb?.title ||
                wiki?.title ||
                movieName,

            originalTitle:
                imdb?.title ||
                movieName,

            year:
                imdb?.year ||
                "",

            cast:
                people(
                    imdb?.actors
                ),

            plot:
                imdb?.plot ||
                "",

            description:
                wiki?.extract ||
                imdb?.plot ||
                "",

            imdbId:
                imdb?.imdbId ||
                "",

            imdbUrl:
                imdb?.imdbUrl ||
                "",

            /* REAL POSTER */

            posterUrl:
                imdb?.posterUrl ||
                wiki?.posterUrl ||
                "",

            posterSource:
                imdb?.posterUrl
                    ? (
                        imdb.imdbUrl ||
                        "https://www.imdb.com/"
                    )
                    : (
                        wiki?.url ||
                        ""
                    ),

            posterTitle:
                imdb?.title ||
                wiki?.title ||
                movieName,

            posterProvider:
                imdb?.posterUrl
                    ? "IMDbOT"
                    : wiki?.posterUrl
                        ? "Wikimedia"
                        : ""
        };

        /* =================================================
           SOURCE 3: WIKIDATA
        ================================================= */

        if (wiki?.qid) {

            movie =
                await enrichWikidata(
                    movie,
                    wiki.qid
                );
        }

        /* =================================================
           SOURCE 4: WIKIPEDIA INFOBOX
        ================================================= */

        const text =
            wiki?.wikitext ||
            "";

        const director =
            infoboxField(
                text,
                ["director"]
            );

        const producer =
            infoboxField(
                text,
                [
                    "producer",
                    "producers"
                ]
            );

        const starring =
            infoboxField(
                text,
                ["starring"]
            );

        const music =
            infoboxField(
                text,
                [
                    "music",
                    "music by",
                    "music_director"
                ]
            );

        const cinematography =
            infoboxField(
                text,
                ["cinematography"]
            );

        const editing =
            infoboxField(
                text,
                [
                    "editing",
                    "edited by"
                ]
            );

        const production =
            infoboxField(
                text,
                [
                    "production companies",
                    "production_company"
                ]
            );

        const released =
            infoboxField(
                text,
                [
                    "released",
                    "release_date"
                ]
            );

        const budget =
            infoboxField(
                text,
                ["budget"]
            );

        const gross =
            infoboxField(
                text,
                [
                    "gross",
                    "box_office"
                ]
            );

        const language =
            infoboxField(
                text,
                [
                    "language",
                    "languages"
                ]
            );

        const genre =
            infoboxField(
                text,
                [
                    "genre",
                    "genres"
                ]
            );

        const runtime =
            infoboxField(
                text,
                ["runtime"]
            );

        if (director) {
            movie.director =
                director;
        }

        if (producer) {
            movie.producer =
                producer;
        }

        if (
            starring &&
            !movie.cast.length
        ) {
            movie.cast =
                people(starring);
        }

        if (music) {
            movie.musicDirector =
                music;
        }

        if (cinematography) {
            movie.cinematography =
                cinematography;
        }

        if (editing) {
            movie.editor =
                editing;
        }

        if (production) {
            movie.productionCompany =
                production;
        }

        if (released) {
            movie.releaseDate =
                released;
        }

        if (budget) {
            movie.budget =
                budget;
        }

        if (gross) {
            movie.collection =
                gross;
        }

        if (language) {
            movie.language =
                language;
        }

        if (genre) {
            movie.genre =
                genre;

            movie.genres =
                genre
                    .split(",")
                    .map(clean)
                    .filter(Boolean);
        }

        if (runtime) {
            movie.runtime =
                runtime;
        }

        /* =================================================
           FINAL RESULT
        ================================================= */

        const result =
            normalizeMovie(
                movie,
                movieName
            );

        cache.set(
            key,
            result
        );

        console.log(
            `Movie information ready: ${result.title}`
        );

        /*
          IMPORTANT:
          We return HTTP 200 even if some
          individual fields are unavailable.
        */

        return res.status(200).json(
            result
        );
    }
);

/* =========================================================
   TEST API
========================================================= */

app.get(
    "/api/test",
    (req, res) => {

        res.json({

            success: true,

            message:
                "MovieBuzz server is working.",

            movieSources: [
                "IMDbOT",
                "Wikipedia",
                "Wikidata"
            ],

            geminiRequired:
                false,

            database:
                "NONE"
        });
    }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
    "/health",
    (req, res) => {

        res.json({

            success: true,

            status:
                "MovieBuzz server is healthy"
        });
    }
);

/* =========================================================
   START SERVER
========================================================= */

app.listen(
    PORT,
    HOST,
    () => {

        console.log(
            `MovieBuzz running on ${HOST}:${PORT}`
        );

        console.log(
            "Movie source: IMDbOT + Wikipedia + Wikidata"
        );

        console.log(
            "Gemini: NOT required for movie searches"
        );

        console.log(
            "Database: NONE"
        );
    }
);
