const searchForm = document.getElementById("searchForm");
const movieSearch = document.getElementById("movieSearch");
const continueButton = document.getElementById("continueButton");
const searchMessage = document.getElementById("searchMessage");
const homeMovieResult = document.getElementById("homeMovieResult");

let searching = false;


// ==========================================
// SEARCH MOVIE
// ==========================================

async function searchMovie(event) {

    if (event) {
        event.preventDefault();
    }

    // Prevent multiple searches
    if (searching) {
        return;
    }

    // Check that the search elements exist
    if (!movieSearch || !homeMovieResult) {
        console.error("Movie search elements are missing.");
        return;
    }

    const movieName = movieSearch.value.trim();


    // ==========================================
    // EMPTY SEARCH
    // ==========================================

    if (!movieName) {

        if (searchMessage) {
            searchMessage.style.color = "red";
            searchMessage.textContent =
                "Please enter a movie name.";
        }

        homeMovieResult.innerHTML = "";

        return;
    }


    // ==========================================
    // START SEARCH
    // ==========================================

    searching = true;


    if (continueButton) {
        continueButton.disabled = true;
        continueButton.textContent = "Searching...";
    }


    if (searchMessage) {
        searchMessage.style.color = "#16a34a";
        searchMessage.textContent =
            "Searching for " + movieName + "...";
    }


    homeMovieResult.innerHTML = "";


    try {

        // ==========================================
        // SEND REQUEST TO SERVER
        // ==========================================

        const response = await fetch(
            "/api/movie",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    movie: movieName
                })
            }
        );


        // ==========================================
        // READ SERVER RESPONSE
        // ==========================================

        const data = await response.json();


        console.log(
            "MovieBuzz server response:",
            data
        );


        // ==========================================
        // SERVER ERROR
        // ==========================================

        if (!response.ok) {

            throw new Error(
                data.error ||
                "Server returned an error."
            );

        }


        // ==========================================
        // DISPLAY MOVIE
        // ==========================================

        displayMovie(data);


        if (searchMessage) {

            searchMessage.style.color =
                "#16a34a";

            searchMessage.textContent =
                "Movie information found!";

        }


    } catch (error) {

        console.error(
            "Movie search error:",
            error
        );


        if (searchMessage) {

            searchMessage.style.color =
                "red";

            searchMessage.textContent =
                "Unable to get movie information.";

        }


        homeMovieResult.innerHTML = `

            <div class="error-box">

                <h3>
                    Movie Search Error
                </h3>

                <p>
                    ${escapeHTML(
                        error.message ||
                        "Something went wrong."
                    )}
                </p>

            </div>

        `;

    } finally {

        searching = false;


        if (continueButton) {

            continueButton.disabled = false;

            continueButton.textContent =
                "Continue";

        }

    }

}


// ==========================================
// DISPLAY MOVIE
// ==========================================

function displayMovie(movie) {
        homeMovieResult.classList.remove("hidden");


    // ==========================================
    // SONGS
    // ==========================================

    const songs =
        Array.isArray(movie.songs)
            ? movie.songs
            : [];


    const songsHTML =
        songs.length > 0

            ? songs
                .map(song => `
                    <li>
                        ${escapeHTML(song)}
                    </li>
                `)
                .join("")

            : `
                <li>
                    Not available
                </li>
            `;


    // ==========================================
    // POSTER
    // ==========================================

    let posterHTML;


    if (movie.posterUrl) {

        posterHTML = `

            <img
                src="${escapeHTML(movie.posterUrl)}"
                alt="${escapeHTML(
                    movie.title ||
                    "Movie poster"
                )}"
                class="real-movie-poster"
                onerror="showPosterFallback(this)"
            >

        `;

    } else {

        posterHTML = `

            <div class="movie-poster-placeholder">

                <div class="poster-icon">
                    🎬
                </div>

                <p>
                    Poster not available
                </p>

            </div>

        `;

    }


    // ==========================================
    // POSTER SOURCE
    // ==========================================

    const posterSourceHTML =
        movie.posterSource

            ? `

                <a
                    href="${escapeHTML(
                        movie.posterSource
                    )}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="poster-source"
                >
                    Image Source
                </a>

              `

            : "";


    // ==========================================
    // CREATE MOVIE CARD
    // ==========================================

    homeMovieResult.innerHTML = `

        <div class="movie-card">


            <!-- MOVIE POSTER -->

            <div class="movie-poster-container">

                ${posterHTML}

                ${posterSourceHTML}

            </div>


            <!-- MOVIE INFORMATION -->

            <div class="movie-information">


                <h2>
                    ${escapeHTML(
                        movie.title ||
                        "Unknown Movie"
                    )}
                </h2>


                <p>

                    <strong>
                        Director:
                    </strong>

                    <span class="director">

                        ${escapeHTML(
                            movie.director ||
                            "Not available"
                        )}

                    </span>

                </p>


                <p>

                    <strong>
                        Hero:
                    </strong>

                    <span class="hero">

                        ${escapeHTML(
                            movie.hero ||
                            "Not available"
                        )}

                    </span>

                </p>


                <p>

                    <strong>
                        Heroine:
                    </strong>

                    <span class="heroine">

                        ${escapeHTML(
                            movie.heroine ||
                            "Not available"
                        )}

                    </span>

                </p>


                <p>

                    <strong>
                        Choreographer:
                    </strong>

                    <span class="choreographer">

                        ${escapeHTML(
                            movie.choreographer ||
                            "Not available"
                        )}

                    </span>

                </p>


                <p>

                    <strong>
                        Release Date:
                    </strong>

                    <span class="release-date">

                        ${escapeHTML(
                            movie.releaseDate ||
                            "Not available"
                        )}

                    </span>

                </p>


                <p>

                    <strong>
                        Collection:
                    </strong>

                    <span class="collection">

                        ${escapeHTML(
                            movie.collection ||
                            "Not available"
                        )}

                    </span>

                </p>


                <p>

                    <strong>
                        Producer:
                    </strong>

                    ${escapeHTML(
                        movie.producer ||
                        "Not available"
                    )}

                </p>


                <p>

                    <strong>
                        Music Director:
                    </strong>

                    ${escapeHTML(
                        movie.musicDirector ||
                        "Not available"
                    )}

                </p>


                <p>

                    <strong>
                        Language:
                    </strong>

                    ${escapeHTML(
                        movie.language ||
                        "Not available"
                    )}

                </p>


                <p>

                    <strong>
                        Genre:
                    </strong>

                    ${escapeHTML(
                        movie.genre ||
                        "Not available"
                    )}

                </p>


                <!-- SONGS -->

                <h3>
                    Songs
                </h3>


                <ul>

                    ${songsHTML}

                </ul>


                <!-- DESCRIPTION -->

                <h3>
                    Description
                </h3>


                <p class="description">

                    ${escapeHTML(
                        movie.description ||
                        "Not available"
                    )}

                </p>


            </div>

        </div>

    `;
}


// ==========================================
// POSTER ERROR FALLBACK
// ==========================================

function showPosterFallback(image) {

    const parent =
        image.parentElement;


    if (!parent) {
        return;
    }


    image.remove();


    parent.insertAdjacentHTML(
        "afterbegin",

        `

        <div class="movie-poster-placeholder">

            <div class="poster-icon">
                🎬
            </div>

            <p>
                Poster not available
            </p>

        </div>

        `
    );

}


// ==========================================
// PROTECT HTML
// ==========================================

function escapeHTML(value) {

    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


// ==========================================
// SEARCH BUTTON
// ==========================================

if (searchForm) {

    searchForm.addEventListener(
        "submit",
        searchMovie
    );

}


// ==========================================
// CONTINUE BUTTON
// ==========================================

if (continueButton) {

    continueButton.addEventListener(
        "click",
        searchMovie
    );

}