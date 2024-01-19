const CONTEXT = {
    "GRID_SIZE": null, // dimensions of the content square
    "TILE_COUNT": 15, // number of tiles in a row (it's a square so it's both directions)
    get TILE_SIZE() {
        return this.GRID_SIZE / this.TILE_COUNT;
    },
    get GRID_TEMPLATE() { // generates 1fr 1fr 1fr... etc for the number of tiles across/down
        let template = [];
        for (let i = 0; i < this.TILE_COUNT; i++)
            template.push("1fr");
        return template.join(" ");
    },
    "SEED": null,
    "RANDOM": () => console.warn("No seeded random initialized yet."),
    "WORDS": [],
    "STAGE_1": 16, // how many words to place in the first generation stage
    "MIN_SCORE": 4,
    "DIRECTION": null,
    "GRID": null,
    "ACROSS": {},
    "DOWN": {},
    "POS": {
        "row": 0,
        "col": 0,
    },
    "isFocused": false
};

// most to least common letters used in Latin
// source: https://www.sttmedia.com/characterfrequency-latin
const RANKED_LETTERS = "IEAUTSRNOMCLPDBQGVFHXYZK";

// global enum
const HORIZONTAL = 1, VERTICAL = 2;

$(document).ready(async () => {
    // determine grid size
    CONTEXT.GRID_SIZE = ~~(Math.min(window.innerWidth, window.innerHeight) * 0.78);
    CONTEXT.GRID_SIZE = CONTEXT.GRID_SIZE - (CONTEXT.GRID_SIZE % CONTEXT.TILE_COUNT);

    $("body").css("--content-width", CONTEXT.GRID_SIZE + "px");

    // generate randomizer
    CONTEXT.SEED = genSeed();
    CONTEXT.RANDOM = mulberry32(CONTEXT.SEED);

    // set typing direction
    CONTEXT.DIRECTION = HORIZONTAL;

    // load in words pool
    CONTEXT.WORDS = (await $.ajax({
        "url": "library.json",
        "method": "GET",
        "contentType": "application/json",
        "cache": false
    })).words;

    // generate a grid
    $("#content").css({
        "--tile-size": CONTEXT.TILE_SIZE + "px",
        "grid-template-rows": CONTEXT.GRID_TEMPLATE,
        "grid-template-columns": CONTEXT.GRID_TEMPLATE
    });

    // append tiles
    for (let i = 0; i < CONTEXT.TILE_COUNT ** 2; i++)
        $("#content").append("<div class='tile'></div>");

    // generate grid
    CONTEXT.GRID = generateGrid();

    // bind resize event
    $(window).on("resize", (e) => {
        // redetermine grid size
        CONTEXT.GRID_SIZE = ~~(Math.min(window.innerWidth, window.innerHeight) * 0.78);
        CONTEXT.GRID_SIZE = CONTEXT.GRID_SIZE - (CONTEXT.GRID_SIZE % CONTEXT.TILE_COUNT);

        $("body").css("--content-width", CONTEXT.GRID_SIZE + "px");

        // generate a grid
        $("#content").css("--tile-size", CONTEXT.TILE_SIZE + "px");
    });

    // bind key events
    bindEvents();

    // focus the first tile
    const firstInput = $(".tile:not(.hidden) > h1")[0];
    CONTEXT.POS.row = parseInt(firstInput.id.substring(6).split("-")[0]);
    CONTEXT.POS.col = parseInt(firstInput.id.substring(6).split("-")[1]);
    CONTEXT.isFocused = true;
    updateSelection();

    // set timer interval
    const start = Date.now();
    setInterval(() => {
        const elapsedSec = ~~(Date.now() - start) / 1e3;
        const hours = ~~(elapsedSec / 3600);
        const minutes = ~~(elapsedSec % 3600 / 60);
        const sec = ~~(elapsedSec % 60);
        const timeStr = (hours > 0 ? hours + ":" + minutes.toString().padStart(2, "0") : minutes) + ":" + sec.toString().padStart(2, "0");
        $("#time-readout").html(timeStr);
    }, 1e3);
});

/****************** event handlers ******************/

const getFocusedInput = () => $("#input-" + CONTEXT.POS.row + "-" + CONTEXT.POS.col)[0];

function bindEvents() {
    const validChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    // bind arrow events to document
    $("body").on("keydown", e => {
        if (!CONTEXT.isFocused) return;

        const focusedElem = getFocusedInput();

        // switch on key type
        switch (e.originalEvent.code) {
            case "ArrowUp":
                e.preventDefault();
                if (CONTEXT.DIRECTION === HORIZONTAL)
                    CONTEXT.DIRECTION = VERTICAL;
                else
                    shiftFocus("U");
                break;
            case "ArrowDown":
                e.preventDefault();
                if (CONTEXT.DIRECTION === HORIZONTAL)
                    CONTEXT.DIRECTION = VERTICAL;
                else
                    shiftFocus("D");
                break;
            case "ArrowLeft":
                e.preventDefault();
                if (CONTEXT.DIRECTION === VERTICAL)
                    CONTEXT.DIRECTION = HORIZONTAL;
                else
                    shiftFocus("L");
                break;
            case "ArrowRight":
                e.preventDefault();
                if (CONTEXT.DIRECTION === VERTICAL)
                    CONTEXT.DIRECTION = HORIZONTAL;
                else
                    shiftFocus("R");
                break;
            case "Space":
                e.preventDefault();
                CONTEXT.DIRECTION = CONTEXT.DIRECTION === HORIZONTAL ? VERTICAL : HORIZONTAL;
                break;
            case "Tab":
                e.preventDefault();
                shiftFocus("X");
                break;
            case "Delete":
            case "Backspace":
                e.preventDefault();
                // if this tile is empty, go back a tile and clear it
                if (focusedElem.innerHTML === "") {
                    // go clear previous tile
                    if (CONTEXT.DIRECTION === HORIZONTAL)
                        shiftFocus("L");
                    else
                        shiftFocus("U");

                    // clear the now-focused file
                    $("#input-" + CONTEXT.POS.row + "-" + CONTEXT.POS.col)[0].innerHTML = "";
                } else {
                    // clear this tile
                    focusedElem.innerHTML = "";
                }
                break;
            default:
                // check if we're typing
                const char = e.originalEvent.key.toUpperCase();
                if (validChars.includes(char)) {
                    e.preventDefault();
                    if (focusedElem.innerHTML !== "" && $(focusedElem).attr("data-has-changed") === "true") {
                        // shift focus
                        if (CONTEXT.DIRECTION === HORIZONTAL)
                            shiftFocus("R", true);
                        if (CONTEXT.DIRECTION === VERTICAL)
                            shiftFocus("D", true);
                    }
                    
                    // update the new element's value
                    let focused = getFocusedInput();
                    focused.innerHTML = char;
                    $(focused).attr("data-has-changed", "true");
                }
                break;
        }

        // focus the now-selected element & update selection
        updateSelection();
    });

    // bind click event to focus any tile
    $(".tile:has(h1)").click(function() {
        // set pos to this elem
        const h1 = $(this).find("h1")[0];
        CONTEXT.POS.row = parseInt(h1.id.substring(6).split("-")[0]);
        CONTEXT.POS.col = parseInt(h1.id.substring(6).split("-")[1]);

        // if this tile doesn't have a word in one direction, update the direction
        if ($(h1).attr("data-down") !== "" && $(h1).attr("data-across") === "")
            CONTEXT.DIRECTION = VERTICAL;
        else if ($(h1).attr("data-across") !== "" && $(h1).attr("data-down") === "")
            CONTEXT.DIRECTION = HORIZONTAL;

        // focus the now-selected element & update selection
        updateSelection();
    });

    // bind focus on click
    $("body").click(e => {
        // if we're somewhere over the #content div, focus
        CONTEXT.isFocused = $(e.target).hasClass("tile") || $(e.target).is("#content") || $(e.target.parentElement).is("#clue-container");
    });
    
    // bind text scrolling to hints (snagged this from the Mini Server as well)
    const h2 = $("#clue-text")[0];
    const DELAY = 3e3;
    const OFFSET_INC = 1;
    const RATE = 20; // in ms, interval callback rate
    
    setTimeout(() => {
        // store interval
        let offset = 0;
        let lastStopped = 0;
        textScrollInterval = setInterval(() => {
            if (Date.now() - lastStopped < DELAY) return;

            h2.scrollTo({left: offset, top: 0, behavior: "instant"});
            offset += OFFSET_INC;

            if (offset >= h2.scrollWidth - h2.clientWidth) {
                offset = 0;
                lastStopped = Date.now();
                setTimeout(() => h2.scrollTo({left: 0, top: 0, behavior: "smooth"}), 0.67 * DELAY);
            }
        }, RATE);
    }, DELAY);
}

function shiftFocus(direction, breakOnWord=false) {
    const row = CONTEXT.POS.row;
    const col = CONTEXT.POS.col;
    const grid = CONTEXT.GRID;

    switch (direction) {
        case "L":
            for (let i = col-1; i >= 0 && (!breakOnWord || grid[row][i] !== null); i--)
                if (grid[row][i] !== null)
                    return void (CONTEXT.POS.col = i);
            break;
        case "R":
            for (let i = col+1; i < CONTEXT.TILE_COUNT && (!breakOnWord || grid[row][i] !== null); i++)
                if (grid[row][i] !== null)
                    return void (CONTEXT.POS.col = i);
            break;
        case "D":
            for (let i = row+1; i < CONTEXT.TILE_COUNT && (!breakOnWord || grid[i][col] !== null); i++)
                if (grid[i][col] !== null)
                    return void (CONTEXT.POS.row = i);
            break;
        case "U":
            for (let i = row-1; i >= 0 && (!breakOnWord || grid[i][col] !== null); i--)
                if (grid[i][col] !== null)
                    return void (CONTEXT.POS.row = i);
            break;
        case "X": // shift focus, wrapping around entire grid at most once
            let hasStarted = false;
            let hasFoundNull = false;
            outer:
            for (let r = 0; r < CONTEXT.TILE_COUNT; r = (r+1) % CONTEXT.TILE_COUNT) {
                for (let c = 0; c < CONTEXT.TILE_COUNT; c++) {
                    if (!hasStarted) {
                        r = row;
                        c = col;
                        hasStarted = true;
                        continue;
                    } else if (r === row && c === col) {
                        break outer;
                    }

                    if (grid[r][c] === null) hasFoundNull = true;

                    if (grid[r][c] !== null && hasFoundNull) {
                        CONTEXT.POS.row = r;
                        CONTEXT.POS.col = c;
                        break outer;
                    }
                }

                // if skipping to the next row, we've gone to a new word anyways
                hasFoundNull = true;
            }
            break;
    }
}

function updateSelection() {
    const {row, col} = CONTEXT.POS;
    const dir = CONTEXT.DIRECTION;
    const grid = CONTEXT.GRID;
    
    // remove all current selection
    $(".tile.main-selected").removeClass("main-selected");
    $(".tile.selected").removeClass("selected");

    // focus main tile
    $(".tile:has(#input-" + row + "-" + col + ")").addClass("main-selected");
    $("#input-" + row + "-" + col)[0].focus();

    // set data-has-changed to false on all non-main-selected tiles
    $(".tile:not(.main-selected) > h1").attr("data-has-changed", "false");

    // update typing direction
    if (dir === VERTICAL) {
        // add class to all other tiles in immediate row
        for (let r = row+1; r < CONTEXT.TILE_COUNT && grid[r][col] !== null; r++)
            $(".tile:has(#input-" + r + "-" + col + ")").addClass("selected");
        for (let r = row-1; r >= 0 && grid[r][col] !== null; r--)
            $(".tile:has(#input-" + r + "-" + col + ")").addClass("selected");
    } else {
        // add class to all other tiles in immediate col
        for (let c = col+1; c < CONTEXT.TILE_COUNT && grid[row][c] !== null; c++)
            $(".tile:has(#input-" + row + "-" + c + ")").addClass("selected");
        for (let c = col-1; c >= 0 && grid[row][c] !== null; c--)
            $(".tile:has(#input-" + row + "-" + c + ")").addClass("selected");
    }

    // update the hint/clue as well
    const focusedElem = getFocusedInput();
    const attrAcross = $(focusedElem).attr("data-across");
    const attrDown = $(focusedElem).attr("data-down");

    if (CONTEXT.DIRECTION === HORIZONTAL) {
        // prefer across, but select down if not across available
        if (attrAcross !== "") {
            $("#clue-num").html( parseInt(attrAcross) );
            $("#clue-text").html( CONTEXT.ACROSS[parseInt(attrAcross)].clue );
        } else if (attrDown !== "") {
            $("#clue-num").html( parseInt(attrDown) );
            $("#clue-text").html( CONTEXT.DOWN[parseInt(attrDown)].clue );
        }
    } else {
        // prefer down, but select across if not down available
        if (attrDown !== "") {
            $("#clue-num").html( parseInt(attrDown) );
            $("#clue-text").html( CONTEXT.DOWN[parseInt(attrDown)].clue );
        } else if (attrAcross !== "") {
            $("#clue-num").html( parseInt(attrAcross) );
            $("#clue-text").html( CONTEXT.ACROSS[parseInt(attrAcross)].clue );
        }
    }
}

/****************** game events ******************/

// get the clue associated with a word or phrase (regardless of case), or null if not found
function getClue(word) {
    for (let i = 0; i < CONTEXT.WORDS.length; i++)
        if (CONTEXT.WORDS[i].word.toLowerCase() === word.toLowerCase())
            return CONTEXT.WORDS[i].clue;
    
    // base case
    return null;
}

function checkGrid() {
    // remove any incorrect letters
    $(".tile > h1").each(function() {
        const row = parseInt(this.id.substring(6).split("-")[0]);
        const col = parseInt(this.id.substring(6).split("-")[1]);

        if (CONTEXT.GRID[row][col].toUpperCase() !== this.innerHTML)
            this.innerHTML = "";
    });
}

/****************** generation algorithm ******************/

// generates word placement
function generateGrid() {
    // generate an empty grid
    const grid = [];
    for (let i = 0; i < CONTEXT.TILE_COUNT; i++) {
        grid.push(
            Array.apply(null, new Array(CONTEXT.TILE_COUNT)
        ).map(() => null));
    }

    // randomize THEN sort words by length desc
    let words = CONTEXT.WORDS.slice().sort(() => CONTEXT.RANDOM() - 0.5); // seeded, randomized sort
    // words = words.sort((a,b) => b.word.length - a.word.length); // sort longest-first
    // words = words.sort((a,b) => a.word.length - b.word.length); // sort shortest-first
    
    // place words in the grid
    const maxWords = 110;
    let placedCount = 0; // add 1 for every word on the board

    // keep going until we're out of words or have reached the stage 1 cap
    for (let i = 0; i < words.length && placedCount < CONTEXT.STAGE_1; i++) {
        // check if the word fits
        const word = words[i].word;
        
        // for each position on the board, check if we can place the word down or across away from top-left
        let validPositions = [];
        for (let r = 0; r < CONTEXT.TILE_COUNT; r++) {
            for (let c = 0; c < CONTEXT.TILE_COUNT; c++) {
                // speed optimization, if the word can't fit skip the rest of this row
                if (word.length + c > CONTEXT.TILE_COUNT && word.length + r > CONTEXT.TILE_COUNT)
                    break;

                // check if the word can be placed
                const placements = getWordPlacements(word, r, c, grid);
                for (let p of placements) {
                    const score = getScore(word, r, c, p, grid, true);
                    validPositions.push([score, r, c, p]);
                }
            }
        }

        // find best possible position
        if (validPositions.length) {
            // sort highest score first
            const sortedPositions = validPositions.sort((a,b) => b[0] - a[0]);
            const pos = sortedPositions[0]; // [score, row, col, direction]

            // if the score is greater than the accepted threshold, place the word
            if (pos[0] > CONTEXT.MIN_SCORE) {
                placeWord(word, pos[1], pos[2], grid, pos[3]);
                placedCount++;
                
                // remove word from words
                words.splice(i--, 1);
            }
        }
    }

    // place remaining words
    while (words.length && placedCount < maxWords) {
        // get the valid positions for each word
        let validPositions = [];
        for (let i = 0; i < words.length; i++) {
            const word = words[i].word;

            // for each position on the board, check if we can place the word down or across away from top-left
            for (let r = 0; r < CONTEXT.TILE_COUNT; r++) {
                for (let c = 0; c < CONTEXT.TILE_COUNT; c++) {
                    // speed optimization, if the word can't fit skip the rest of this row
                    if (word.length + c > CONTEXT.TILE_COUNT && word.length + r > CONTEXT.TILE_COUNT)
                        break;

                    // check if the word can be placed
                    const placements = getWordPlacements(word, r, c, grid);
                    for (let p of placements) {
                        const score = getScore(word, r, c, p, grid);
                        validPositions.push([score, r, c, p, i]);
                    }
                }
            }
        }

        // find best possible position
        if (validPositions.length) {
            // sort highest score first
            const sortedPositions = validPositions.sort((a,b) => b[0] - a[0]);
            const pos = sortedPositions[0]; // [score, row, col, direction, word index]
            const word = words[pos[4]];

            // place the highest word
            if (pos[0] === -Infinity) break;

            placeWord(word.word, pos[1], pos[2], grid, pos[3]);
            placedCount++;

            // remove the word
            words.splice(pos[4], 1);
            continue;
        }

        // base case
        break;
    }

    // place each letter onto the grid
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            const tile = $(".tile")[ c + (r * grid.length) ];

            if (grid[r][c] === null)
                $(tile).addClass("hidden");
            else
                $(tile).html(`
                    <h1 id="input-${r}-${c}"
                        data-across="" data-down=""
                        data-has-changed="false"
                    ></h1>
                `);
        }
    }

    // now that the grid is finished, add the lil numbers
    {
        // block scoped purely so I can collapse this code in VS lol
        const wordsFlat = {};

        // flatten down/across words objects into a single object
        for (let index in CONTEXT.ACROSS)
            wordsFlat[index] = [HORIZONTAL];

        for (let index in CONTEXT.DOWN)
            if (wordsFlat[index])
                wordsFlat[index].push(VERTICAL);
            else
                wordsFlat[index] = [VERTICAL];

        // plot each number
        const across = {}, down = {};
        let inc = 0;
        for (let index in wordsFlat) {
            // get the row/col from index
            const row = ~~(index / CONTEXT.TILE_COUNT);
            const col = index % CONTEXT.TILE_COUNT;
            $(".tile:has(#input-" + row + "-" + col + ")").append(`<h2>${++inc}</h2>`);

            // put into new object
            if (wordsFlat[index].includes(HORIZONTAL)) {
                across[inc] = CONTEXT.ACROSS[index];

                // update all others in same word
                for (let c = col; c < CONTEXT.TILE_COUNT && grid[row][c] !== null; c++)
                    $("#input-" + row + "-" + c).attr("data-across", inc);
            }

            if (wordsFlat[index].includes(VERTICAL)) {
                $("#input-" + row + "-" + col).attr("data-down", inc);
                down[inc] = CONTEXT.DOWN[index];

                // update all others in same word
                for (let r = row; r < CONTEXT.TILE_COUNT && grid[r][col] !== null; r++)
                    $("#input-" + r + "-" + col).attr("data-down", inc);
            }
        }

        // update global context refs to down & across
        CONTEXT.ACROSS = across;
        CONTEXT.DOWN = down;
    }

    return grid;
}

// determine a score for each position (ie. where are certain words more desirable)
function getScore(word, row, col, direction, grid, inPreStage=false) {
    const longWordThresh = 6; // the max length of what a "short" word is
    const middle = CONTEXT.TILE_COUNT / 2;
    const clamp = x => Math.tanh(x/20); // clamp values between [-1, 1]

    // axis-centered row/col
    const centeredRow = (direction === VERTICAL) ? row + word.length/2 : row;
    const centeredCol = (direction === HORIZONTAL) ? col + word.length/2 : col;

    // initial score
    let score = 0;

    if (inPreStage) {
        // if less than 10 words on board, focus on corners then outside ring
        
        // add weight to words near 4-6 chars (between -3, 3)
        score += 6 * Math.exp((word.length - 5) ** 2 / -6) - 3;

        // add points to words whose average letter frequency is highest
        {
            let letterInc = 0;
            const lenLetters = RANKED_LETTERS.length;
            for (let char of word.toUpperCase()) {
                if (RANKED_LETTERS.includes(char)) {
                    letterInc += lenLetters - 1 - RANKED_LETTERS.indexOf(char);
                } else {
                    letterInc = -Infinity;
                    console.warn("Invalid character \"" + char + "\" in word: \"" + word + "\".");
                }
            }
            score += 4 * letterInc / word.length / (lenLetters-1) - 3; // between -3, 1
        }

        // add points to words that start in a corner and lie along the edge that are close to 5 chars
        if (
            ((row === 0 || row === CONTEXT.TILE_COUNT-1) && direction === HORIZONTAL) ||
            ((col === 0 || col === CONTEXT.TILE_COUNT-1) && direction === VERTICAL)
        )
            score += 5 * Math.exp((word.length - 5) ** 2 / -6) - 2;

        // add points for touching a corner
        if ((row === 0 || row + word.length === CONTEXT.TILE_COUNT) && (col === 0 || col + word.length === CONTEXT.TILE_COUNT))
            score += 3;
        
        // add points to letters that "cross" other "words" (see what I did there)
        {
            let crossInc = 0;
            for (let l = 0; l < word.length; l++) {
                if (direction === HORIZONTAL) {
                    const rowPrev = row-1 >= 0 ? grid[row-1][col+l] : null;
                    const rowNext = row+1 < CONTEXT.TILE_COUNT ? grid[row+1][col+l] : null;

                    if (rowPrev !== null || rowNext !== null)
                        crossInc += 1;
                } else {
                    const colPrev = col-1 >= 0 ? grid[row+l][col-1] : null;
                    const colNext = col+1 < CONTEXT.TILE_COUNT ? grid[row+l][col+1] : null;

                    if (colPrev !== null || colNext !== null)
                        crossInc += 1;
                }
            }

            score += 4 * crossInc;
        }

        // remove points the closer a word is to the middle
        score -= 0.5 * Math.hypot(1 - Math.abs(middle - centeredRow) / middle, 1 - Math.abs(middle - centeredCol) / middle);

        // remove points from words that are in past the outer-most ring (they prevent outer ring from filling)

        if (
            ((row >= 1 && row + word.length <= CONTEXT.TILE_COUNT-1) && direction === HORIZONTAL) ||
            ((col >= 1 && col + word.length <= CONTEXT.TILE_COUNT-1) && direction === VERTICAL)
        )
            score -= Math.max(word.length, 6);
        
        // remove points from words that are close to a corner and run perpendicular to their edge
        if (
            (row === 0 || row + word.length === CONTEXT.TILE_COUNT) &&
            (col > 0 && col + word.length < CONTEXT.TILE_COUNT) &&
            direction === VERTICAL
        )
            score -= Math.max(4, middle - Math.abs(middle - col));
        
        if (
            (col === 0 || col + word.length === CONTEXT.TILE_COUNT) &&
            (row > 0 && row + word.length < CONTEXT.TILE_COUNT) &&
            direction === HORIZONTAL
        )
            score -= Math.max(4, middle - Math.abs(middle - row));
        
        return score;

    } else {
        // strictly connect words now

        // add more points the shorter a word is and the closer it is to a corner
        {
            let lengthInc = 10 * Math.exp(-0.5 * word.length) - 0.5; // once we hit past 6 characters, the score drops
            let cornerInc = (Math.SQRT2 * 2 / middle) * Math.hypot(Math.abs(middle-centeredRow), Math.abs(middle-centeredCol)) - 1;
            score += 5 * (lengthInc * cornerInc);
        }

        // add points to letters that "cross" other "words" (see what I did there)
        {
            let crossInc = 0;
            for (let l = 0; l < word.length; l++) {
                if (direction === HORIZONTAL) {
                    const rowPrev = row-1 >= 0 ? grid[row-1][col+l] : null;
                    const rowNext = row+1 < CONTEXT.TILE_COUNT ? grid[row+1][col+l] : null;

                    if (rowPrev !== null || rowNext !== null)
                        crossInc += 1;
                } else {
                    const colPrev = col-1 >= 0 ? grid[row+l][col-1] : null;
                    const colNext = col+1 < CONTEXT.TILE_COUNT ? grid[row+l][col+1] : null;

                    if (colPrev !== null || colNext !== null)
                        crossInc += 1;
                }
            }

            if (crossInc === 0)
                score -= 3 * word.length;
            else
                score += 7 * crossInc;
        }

        // add points for long words across middle or shorter words not across middle
        {
            let lengthMiddleScore;
            if (word.length > longWordThresh) {
                lengthMiddleScore = 2 * (direction === HORIZONTAL) * (0.5 - Math.abs((middle - row) / middle));
                lengthMiddleScore -= Math.abs((middle - centeredCol) / middle);
            } else {
                lengthMiddleScore = Math.abs((middle - centeredRow) / middle) - 0.5; // direction doesn't necessarily matter for shorter words
            }
            score += 4 * lengthMiddleScore;
        }

        // add points to words which consist of more common letters
        {
            let letterInc = 0;
            const lenLetters = RANKED_LETTERS.length;
            for (let char of word.toUpperCase()) {
                if (RANKED_LETTERS.includes(char)) {
                    letterInc += lenLetters - 1 - RANKED_LETTERS.indexOf(char);
                } else {
                    letterInc = -Infinity;
                    console.warn("Invalid character \"" + char + "\" in word: \"" + word + "\".");
                }
            }
            score += 4 * letterInc / word.length / (lenLetters-1) - 3; // between -3, 1
        }

        return score;
    }
}

// puts a word into the grid at the current position (assumes overflow has been checked)
function placeWord(word, row, col, grid, direction) {
    for (let l = 0; l < word.length; l++) {
        if (direction === HORIZONTAL)
            grid[row][col+l] = word[l];
        else
            grid[row+l][col] = word[l];
    }

    // add word & its clue to the CONTEXT.ACROSS/DOWN
    // start by placing across each column then each row (reading left -> right essentially)
    // when all words are placed, then we determine each number
    const index = col + row * CONTEXT.TILE_COUNT;
    const wordInfo = {"word": word.toUpperCase(), "clue": getClue(word)};
    CONTEXT[direction === HORIZONTAL ? "ACROSS" : "DOWN"][index] = wordInfo;
}

// gets the direction of all possible word placements at this position
function getWordPlacements(word, row, col, grid) {
    // immediately return if the tile is taken by another letter already
    if (word[0] !== grid[row][col] && grid[row][col] !== null)
        return [];


    const getPos = (r, c) => {
        if (r >= 0 && r < CONTEXT.TILE_COUNT && c >= 0 && c < CONTEXT.TILE_COUNT)
            return grid[r][c];
        else
            return null;
    };

    // check horizontal
    let horiz = null;
    if (
        col + word.length <= CONTEXT.TILE_COUNT &&
        !((grid[row][col] === null && (getPos(row-1, col) !== null || getPos(row+1, col) !== null))
        || getPos(row, col-1) !== null)
    ) { // check for grid overflow
        for (let l = 1; l < word.length; l++) {
            // check for non-fitting letters if the letter doesn't match existing and existing isn't blank/null
            if (grid[row][col+l] !== word[l] && grid[row][col+l] !== null)
                break;

            // check if we're up against a word
            if (getPos(row-1, col+l) !== null || getPos(row+1, col+l) !== null || getPos(row, col+l+1) !== null)
                break;

            // if we're still in the loop and this is the last index, then the word fits
            if (l+1 === word.length)
                horiz = HORIZONTAL;
        }
    }
    
    // check vertical
    let vert = null;
    if (
        row + word.length <= CONTEXT.TILE_COUNT &&
        !((grid[row][col] === null && (getPos(row, col-1) !== null || getPos(row, col+1) !== null))
        || getPos(row-1, col) !== null)
    ) { // check for grid overflow
        for (let l = 1; l < word.length; l++) {
            // check for non-fitting letters if the letter doesn't match existing and existing isn't blank/null
            if (grid[row+l][col] !== word[l] && grid[row+l][col] !== null)
                break;

            // check if we're up against a word
            if (getPos(row+l, col-1) !== null || getPos(row+l, col+1) !== null || getPos(row+l+1, col) !== null)
                break;

            // if we're still in the loop and this is the last index, then the word fits
            if (l+1 === word.length)
                vert = VERTICAL;
        }
    }

    const placements = [];
    if (horiz !== null) placements.push(horiz);
    if (vert !== null) placements.push(vert);

    return placements;
}

/****************** misc ******************/

// generate seed on interval [0, 1_000_000)
// basically 000000-999999
const genSeed = () => ~~(Math.random() * 1e6);

// I always refer back to this SO post, thanks to (https://stackoverflow.com/a/47593316)
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}