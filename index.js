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
    "STAGE_1": 18, // how many words to place in the first generation stage
    "MIN_SCORE": 4,
    "DIRECTION": null,
    "GRID": null,
    "ACROSS": {},
    "DOWN": {},
    "POS": {
        "row": 0,
        "col": 0,
    },
    "isFocused": false,
    "gameClock": null,
    "isCompleted": false,
    "letterFreqs": {} // generated on the library.json dataset
};

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
    const res = await $.ajax({
        "url": "library.json",
        "method": "GET",
        "contentType": "application/json",
        "cache": false
    });

    CONTEXT.WORDS = res.words;
    CONTEXT.letterFreqs = res.letterFreqs;

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
    const grid = generateGrid();
    console.log("Grid score: " + ~~(grid[1] * 1e4)/1e2 + "%");
    CONTEXT.ACROSS = grid[2];
    CONTEXT.DOWN = grid[3];
    drawGrid(CONTEXT.GRID = grid[0]);

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
    CONTEXT.gameClock = setInterval(() => {
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
                const isMeta = e.ctrlKey || e.shiftKey || e.metaKey || e.altKey;
                if (validChars.includes(char) && !isMeta && !CONTEXT.isCompleted) {
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

                    // check grid on focus change
                    checkGrid();
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

    const escapeHint = text => {
        let match = text.match(/(?<=\*).+?(?=\*)/);
            if (match !== null)
            return text.replace(`*${match[0]}*`, `<em>${match[0]}</em>`);
        else
            return text;
    };

    if (CONTEXT.DIRECTION === HORIZONTAL) {
        // prefer across, but select down if not across available
        if (attrAcross !== "") {
            $("#clue-num").html( parseInt(attrAcross) );
            $("#clue-text").html( escapeHint( CONTEXT.ACROSS[parseInt(attrAcross)].clue ) );
        } else if (attrDown !== "") {
            $("#clue-num").html( parseInt(attrDown) );
            $("#clue-text").html( escapeHint( CONTEXT.DOWN[parseInt(attrDown)].clue ) );
        }
    } else {
        // prefer down, but select across if not down available
        if (attrDown !== "") {
            $("#clue-num").html( parseInt(attrDown) );
            $("#clue-text").html( escapeHint( CONTEXT.DOWN[parseInt(attrDown)].clue ) );
        } else if (attrAcross !== "") {
            $("#clue-num").html( parseInt(attrAcross) );
            $("#clue-text").html( escapeHint( CONTEXT.ACROSS[parseInt(attrAcross)].clue ) );
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

function checkGrid(replaceIncorrect=false) {
    // remove any incorrect letters
    const h1s = [...$(".tile > h1")];
    let isCorrect = true;
    h1s.forEach((h1) => {
        const row = parseInt(h1.id.substring(6).split("-")[0]);
        const col = parseInt(h1.id.substring(6).split("-")[1]);

        if (CONTEXT.GRID[row][col].toUpperCase() !== h1.innerHTML) {
            if (replaceIncorrect) h1.innerHTML = "";
            isCorrect = false;
        }
    });

    // handle game win
    if (isCorrect) {
        console.log("You win!\nElapsed: " + $("#time-readout").html());
        clearInterval(CONTEXT.gameClock);
        CONTEXT.isCompleted = true;
    }
}

// reveals the whole grid
function revealGrid() {
    for (let num of Object.keys(CONTEXT.DOWN)) {
        const word = CONTEXT.DOWN[num].word;
        [...$("h1[data-down=" + num + "]")].forEach((elem, i) => elem.innerHTML = word[i]);
    }

    for (let num of Object.keys(CONTEXT.ACROSS)) {
        const word = CONTEXT.ACROSS[num].word;
        [...$("h1[data-across=" + num + "]")].forEach((elem, i) => elem.innerHTML = word[i]);
    }

    // verify everything is correct, also ends the game :)
    checkGrid();
}

/****************** generation algorithm ******************/

function drawGrid(grid) {
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

        // remove any words that are entirely contained within another word (ie. "mus" in "domus")
        // AND flatten down/across words objects into a single object
        outerLoop:
        for (let index in CONTEXT.ACROSS) {
            const row = ~~(index / CONTEXT.TILE_COUNT), col = index % CONTEXT.TILE_COUNT;
            for (let subIndex in CONTEXT.ACROSS) {
                if (CONTEXT.ACROSS[subIndex].word === CONTEXT.ACROSS[index].word) continue;

                const subRow = ~~(subIndex / CONTEXT.TILE_COUNT), subCol = subIndex % CONTEXT.TILE_COUNT;
                if (row !== subRow) continue;

                if (subCol <= col && subCol + CONTEXT.ACROSS[subIndex].word.length >= col + CONTEXT.ACROSS[index].word.length)
                    continue outerLoop;
            }
            wordsFlat[index] = [HORIZONTAL];
        }

        outerLoop:
        for (let index in CONTEXT.DOWN) {
            const row = ~~(index / CONTEXT.TILE_COUNT), col = index % CONTEXT.TILE_COUNT;
            for (let subIndex in CONTEXT.DOWN) {
                if (CONTEXT.DOWN[subIndex].word === CONTEXT.DOWN[index].word) continue;

                const subRow = ~~(subIndex / CONTEXT.TILE_COUNT), subCol = subIndex % CONTEXT.TILE_COUNT;
                if (col !== subCol) continue;

                if (subRow <= row && subRow + CONTEXT.DOWN[subIndex].word.length >= row + CONTEXT.DOWN[index].word.length)
                    continue outerLoop;
            }

            if (wordsFlat[index])
                wordsFlat[index].push(VERTICAL);
            else
                wordsFlat[index] = [VERTICAL];
        }

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
}

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
    const maxWords = 120;
    let placedCount = 0; // add 1 for every word on the board
    let tilesFilled = 0;
    
    // place as many words as possible
    while (words.length && placedCount < maxWords) {
        // get the valid positions for each word
        let validPositions = [], word;
        const filledPercent = tilesFilled/(CONTEXT.TILE_COUNT**2);
        const availWords = words.map(w => w.word.toUpperCase());

        for (let i = 0; i < words.length && (word = words[i].word); i++) {
            // for each position on the board, check if we can place the word down or across away from top-left
            for (let r = 0; r < CONTEXT.TILE_COUNT; r++) {
                for (let c = 0; c < CONTEXT.TILE_COUNT; c++) {
                    // speed optimization, if the word can't fit skip the rest of this row
                    if (word.length + c > CONTEXT.TILE_COUNT && word.length + r > CONTEXT.TILE_COUNT)
                        break;

                    // check if the word can be placed
                    for (let p of getWordPlacements(word, r, c, grid, availWords)) {
                        // validPositions.push([getScore(word, r, c, p, grid, placedCount), r, c, p, i]);
                        validPositions.push([getScore(word, r, c, p, grid, filledPercent), r, c, p, i]);
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

            let wordsUsed = placeWord(word.word, pos[1], pos[2], grid, pos[3]);
            placedCount++;
            tilesFilled += word.word.length; // update tilesFilled

            for (let i = 0; i < words.length; i++)
                if (wordsUsed.includes( words[i].word.toUpperCase() ))
                    words.splice(i--, 1);// remove the word
            continue;
        }

        // base case
        break;
    }

    // evaluate this grid
    let usedSpaces = 0;
    for (let r = 0; r < grid.length; r++)
        for (let c = 0; c < grid[r].length; c++)
            usedSpaces += grid[r][c] !== null;

    // reset CONTEXT.ACROSS/DOWN
    const across = CONTEXT.ACROSS, down = CONTEXT.DOWN;
    CONTEXT.ACROSS = {}, CONTEXT.DOWN = {};
    return [grid, usedSpaces / (CONTEXT.TILE_COUNT ** 2), across, down];
}

// determine a score for each position (ie. where are certain words more desirable)
function getScore(word, row, col, direction, grid, filledPercent) {
    let score = 0;

    // count each tile that is a part of the highlighted section
    const middle = CONTEXT.TILE_COUNT/2;
    const outerIntercept = CONTEXT.TILE_COUNT * (1 - 0.25*filledPercent*0);
    const innerIntercept = CONTEXT.TILE_COUNT * 0.67 * (1-2*filledPercent*0);
    
    let containedTiles = 0;
    
    for (let i = 0; i < word.length; i++) {
        // scale row and col into 1st quadrant
        const y = Math.abs(row+(direction === VERTICAL)*i - middle);
        const x = Math.abs(col+(direction !== VERTICAL)*i - middle);
        let oInt = outerIntercept - y;
        let iInt = innerIntercept - y;

        if (x < oInt && x > iInt)
            containedTiles++
    }

    // scale the number of contained tiles over the length of the word
    score = containedTiles / word.length;

    // factor in the frequency of common characters with the filledPercent (earlier we want common letters)
    let letterScore = 0;

    const lenLetters = Object.keys(CONTEXT.letterFreqs).length;
    for (let char of word.toUpperCase()) {
        if (char in CONTEXT.letterFreqs) {
            letterScore += lenLetters - 1 - CONTEXT.letterFreqs[char];
        } else {
            letterScore = -Infinity;
            console.warn("Invalid character \"" + char + "\" in word: \"" + word + "\".");
        }
    }

    // 1 is most common, 0 is least common
    letterScore /= word.length * (lenLetters-1) / 2;

    score = filledPercent > 0.25 ? score : (score * letterScore);

    // favor longer words
    // score *= filledPercent > 0.25 ? word.length/CONTEXT.TILE_COUNT : (1-(word.length/CONTEXT.TILE_COUNT));
    const thirdTileCount = (CONTEXT.TILE_COUNT/3);
    score *= Math.max(0.2, (1 - Math.abs(thirdTileCount - word.length)/thirdTileCount)); // closer to half tile count, better

    // add points to letters that "cross" other "words" (see what I did there)
    let crossInc = 0;
    for (let l = 0; l < word.length; l++) {
        if (direction === HORIZONTAL) {
            const rowPrev = row-1 >= 0 ? grid[row-1][col+l] : null;
            const rowNext = row+1 < CONTEXT.TILE_COUNT ? grid[row+1][col+l] : null;
            crossInc += (rowPrev !== null) + (rowNext !== null);
        } else {
            const colPrev = col-1 >= 0 ? grid[row+l][col-1] : null;
            const colNext = col+1 < CONTEXT.TILE_COUNT ? grid[row+l][col+1] : null;
            crossInc += (colPrev !== null) + (colNext !== null);
        }
    }
    
    score *= crossInc / word.length; // at most 2 intersections per tile, so this clamps 0-2
    if (score) console.log(word, score);
    return score;
}

function old_getScore(word, row, col, direction, grid, placedCount) {
    const middle = CONTEXT.TILE_COUNT / 2;

    // axis-centered row/col
    const centeredRow = (direction === VERTICAL) ? row + word.length/2 : row;
    const centeredCol = (direction === HORIZONTAL) ? col + word.length/2 : col;

    // initial score
    let score = 0;

    // check if we're in the prestage
    if (placedCount < CONTEXT.STAGE_1) {
        // focus on filling in the outside closer to the corners

        // add weight to words near 4-6 chars (between -3, 3)
        score += 6 * Math.exp((word.length - 5) ** 2 / -6) - 3;

        // discourage words that are over 7 characters
        if (word.length > 7)
            score -= word.length ** 2;

        // add points to words whose average letter frequency is highest
        {
            let letterInc = 0;
            const lenLetters = CONTEXT.letterFreqs.length;
            for (let char of word.toUpperCase()) {
                if (CONTEXT.letterFreqs.includes(char)) {
                    letterInc += lenLetters - 1 - CONTEXT.letterFreqs.indexOf(char);
                } else {
                    letterInc = -Infinity;
                    console.warn("Invalid character \"" + char + "\" in word: \"" + word + "\".");
                }
            }
            score += 4 * letterInc / word.length / (lenLetters-1) - 2; // between -2, 2
        }

        // add points to words that start in a corner and lie along the edge that are close to 5 chars
        if (
            ((row === 0 || row + word.length === CONTEXT.TILE_COUNT) && direction === HORIZONTAL) ||
            ((col === 0 || col + word.length === CONTEXT.TILE_COUNT) && direction === VERTICAL)
        )
            score += 8 * Math.exp((word.length - 5) ** 2 / -6) - 2;

        // add points for touching a corner
        if ((row === 0 || row + word.length === CONTEXT.TILE_COUNT) && (col === 0 || col + word.length === CONTEXT.TILE_COUNT))
            score += 3 * word.length;
        
        // add points to letters that "cross" other "words" (see what I did there)
        {
            let crossInc = 0;
            for (let l = 0; l < word.length; l++) {
                if (direction === HORIZONTAL) {
                    const rowPrev = row-1 >= 0 ? grid[row-1][col+l] : null;
                    const rowNext = row+1 < CONTEXT.TILE_COUNT ? grid[row+1][col+l] : null;

                    crossInc += (rowPrev !== null) + (rowNext !== null);
                } else {
                    const colPrev = col-1 >= 0 ? grid[row+l][col-1] : null;
                    const colNext = col+1 < CONTEXT.TILE_COUNT ? grid[row+l][col+1] : null;

                    crossInc += (colPrev !== null) + (colNext !== null);
                }
            }

            score += Math.max(5, word.length) * crossInc;
        }

        // remove points the closer a word is to the middle
        score -= 4 * Math.hypot(1 - Math.abs(middle - centeredRow) / middle, 1 - Math.abs(middle - centeredCol) / middle);
        
        // remove points from words that are close to a corner and run perpendicular to their edge
        if (
            (row === 0 || row + word.length === CONTEXT.TILE_COUNT) &&
            (col > 0 && col < CONTEXT.TILE_COUNT) &&
            direction === VERTICAL
        )
            score -= 3 * Math.max(4, middle - Math.abs(middle - centeredCol)) * CONTEXT.RANDOM();
        
        if (
            (col === 0 || col + word.length === CONTEXT.TILE_COUNT) &&
            (row > 0 && row < CONTEXT.TILE_COUNT) &&
            direction === HORIZONTAL
        )
            score -= 3 * Math.max(4, middle - Math.abs(middle - centeredRow)) * CONTEXT.RANDOM();
        
        // remove points from words that don't touch an edge
        if (row !== 0 && row + word.length !== CONTEXT.TILE_COUNT &&
            col !== 0 && col + word.length !== CONTEXT.TILE_COUNT)
            score -= 3 * Math.min(5, word.length);
    } else {
        // aim to connect words now

        // add more points the shorter a word is and the closer it is to a corner
        {
            let lengthInc = 10 * Math.exp(-0.5 * word.length) - 0.5; // once we hit past 6 characters, the score drops
            let cornerInc = (Math.SQRT2 * 2 / middle) * Math.hypot(Math.abs(middle-centeredRow), Math.abs(middle-centeredCol)) - 1;
            score += 6 * (lengthInc * cornerInc);
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
                score -= 10 * word.length;
            else
                score += 20 * crossInc;
        }

        // add points to words which consist of more common letters
        {
            let letterInc = 0;
            const lenLetters = CONTEXT.letterFreqs.length;
            for (let char of word.toUpperCase()) {
                if (CONTEXT.letterFreqs.includes(char)) {
                    letterInc += lenLetters - 1 - CONTEXT.letterFreqs.indexOf(char);
                } else {
                    letterInc = -Infinity;
                    console.warn("Invalid character \"" + char + "\" in word: \"" + word + "\".");
                }
            }
            score += 10 * letterInc / word.length / (lenLetters-1);
        }
    }

    // add some randomness to the mix
    score = 4 * CONTEXT.RANDOM() * score - 2;

    return score;
}

// puts a word into the grid at the current position (assumes overflow has been checked)
function placeWord(word, row, col, grid, direction) {
    const extraWords = []; // [word, row, col, dir]
    const getPos = (r, c) => (r >= 0 && r < CONTEXT.TILE_COUNT && c >= 0 && c < CONTEXT.TILE_COUNT) ? grid[r][c] : null;

    for (let l = 0; l < word.length; l++) {
        if (direction === HORIZONTAL)
            grid[row][col+l] = word[l];
        else
            grid[row+l][col] = word[l];

        // check if we intersect another word
        if (direction === HORIZONTAL) {
            if (getPos(row-1, col+l) !== null || getPos(row+1, col+l) !== null) {
                // check that the letter we're up against still makes a word
                let hitWord = word[l], p, r;
                for (r = row-1; (p = getPos(r, col+l)) !== null; r--) hitWord = p + hitWord;
                let minRow = r+1;
                for (r = row+1; (p = getPos(r, col+l)) !== null; r++) hitWord += p;

                // append perpendicular to extraWords
                if (!extraWords.map(w => w[0]).includes(hitWord.toUpperCase()))
                    extraWords.push([hitWord.toUpperCase(), minRow, col+l, VERTICAL]);
            }
        } else {
            if (getPos(row+l, col-1) !== null || getPos(row+l, col+1) !== null) {
                // check that the letter we're up against still makes a word
                let hitWord = word[l], p, c;
                for (c = col-1; (p = getPos(row+l, c)) !== null; c--) hitWord = p + hitWord;
                let minCol = c+1;
                for (c = col+1; (p = getPos(row+l, c)) !== null; c++) hitWord += p;

                // append perpendicular to extraWords
                if (!extraWords.map(w => w[0]).includes(hitWord.toUpperCase()))
                    extraWords.push([hitWord.toUpperCase(), row+l, minCol, HORIZONTAL]);
            }
        }
    }

    // add word & its clue to the CONTEXT.ACROSS/DOWN
    // start by placing across each column then each row (reading left -> right essentially)
    // when all words are placed, then we determine each number
    let index = col + row * CONTEXT.TILE_COUNT;
    let wordInfo = {"word": word.toUpperCase(), "clue": getClue(word)};
    CONTEXT[direction === HORIZONTAL ? "ACROSS" : "DOWN"][index] = wordInfo;

    // add all extra words (I cannot believe this worked first try) (edit: almost)
    for (let extraWord of extraWords) {
        index = extraWord[2] + extraWord[1] * CONTEXT.TILE_COUNT;
        wordInfo = {"word": extraWord[0], "clue": getClue(extraWord[0])};
        CONTEXT[extraWord[3] === HORIZONTAL ? "ACROSS" : "DOWN"][index] = wordInfo;
    }

    return [word.toUpperCase(), ...extraWords.map(w => w[0])];
}

// gets the direction of all possible word placements at this position
function getWordPlacements(word, row, col, grid, availWords) {
    // immediately return if the tile is taken by another letter already
    if (word[0] !== grid[row][col] && grid[row][col] !== null)
        return [];


    const getPos = (r, c) => (r >= 0 && r < CONTEXT.TILE_COUNT && c >= 0 && c < CONTEXT.TILE_COUNT) ? grid[r][c] : null;

    // check horizontal
    let isHorizontal = false;
    if (col + word.length <= CONTEXT.TILE_COUNT && getPos(row, col) === null && getPos(row, col-1) === null) {
        for (let l = 0; l < word.length; l++) {
            // check for non-fitting letters if the letter doesn't match existing and existing isn't blank/null
            if (getPos(row, col+l) !== word[l] && getPos(row, col+l) !== null) break;

            // check if we're up against a word
            if (getPos(row-1, col+l) !== null || getPos(row+1, col+l) !== null) {
                // check that the letter we're up against still makes a word
                let hitWord = word[l], p;
                for (let r = row-1; (p = getPos(r, col+l)) !== null; r--) hitWord = p + hitWord;
                for (let r = row+1; (p = getPos(r, col+l)) !== null; r++) hitWord += p;

                // if this connecting word isn't valid, break
                if (!availWords.includes(hitWord.toUpperCase())) break;
            }

            // if we're still in the loop and this is the last index, then the word fits
            if (l+1 === word.length && getPos(row, col+l+1) === null) isHorizontal = true;
        }
    }
    
    // check vertical
    let isVertical = false;
    if (row + word.length <= CONTEXT.TILE_COUNT && getPos(row, col) === null && getPos(row-1, col) === null) {
        for (let l = 0; l < word.length; l++) {
            // check for non-fitting letters if the letter doesn't match existing and existing isn't blank/null
            if (getPos(row+l, col) !== word[l] && getPos(row+l, col) !== null) break;

            // check if we're up against a word
            if (getPos(row+l, col-1) !== null || getPos(row+l, col+1) !== null) {
                // check that the letter we're up against still makes a word
                let hitWord = word[l], p;
                for (let c = col-1; (p = getPos(row+l, c)) !== null; c--) hitWord = p + hitWord;
                for (let c = col+1; (p = getPos(row+l, c)) !== null; c++) hitWord += p;

                // if this connecting word isn't valid, break
                if (!availWords.includes(hitWord.toUpperCase())) break;
            }

            // if we're still in the loop and this is the last index, then the word fits
            if (l+1 === word.length && getPos(row+l+1, col) === null) isVertical = true;
        }
    }

    const placements = [];
    if (isHorizontal) placements.push(HORIZONTAL);
    if (isVertical) placements.push(VERTICAL);

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

// generate a numeric ranking of each letter in the dataset
// for debug purposes
function genDatasetLetterFreqs() {
    const words = CONTEXT.WORDS.map(w => w.word.toUpperCase());
    
    // determine frequencies of each letter
    let datasetSize = 0;
    const freqs = {};
    for (let word of words) {
        for (let letter of word) {
            freqs[letter] = freqs[letter] ? freqs[letter]+1 : 1;
            datasetSize++;
        }
    }

    // format
    for (let letter in freqs) {
        if (!freqs.hasOwnProperty(letter)) continue;
        freqs[letter] /= datasetSize;
    }

    let str = JSON.stringify(freqs);
    str = str.substring(1, str.length-1); // remove curly braces

    let parts = str.split(",");
    str = "";
    for (let part of parts)
        str += part.split(":")[0] + ": " + part.split(":")[1] + ",\n";

    str = str.substring(0, str.length-2); // remove extra newline and comma
    console.log(str);
}