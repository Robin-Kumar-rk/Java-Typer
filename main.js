// App State
const state = {
    view: 'config', // 'config', 'typing', 'results'
    config: {
        time: 60,
        mode: 'standard', // 'standard', 'method'
        includeKeywords: true,
        includeAdvancedKeywords: false,
        includeClasses: true,
        packages: ['java.lang', 'java.util']
    },
    dictionary: null,
    advancedDictionary: null,
    words: [],

    // Typing state
    currentWordIndex: 0,
    currentLetterIndex: 0,

    // Timer & Metrics
    timer: null,
    timeLeft: 0,
    startTime: 0,
    isActive: false,

    // Stats
    stats: {
        correctKeystrokes: 0,
        incorrectKeystrokes: 0,
        totalKeystrokes: 0
    }
};

// DOM Elements
const views = {
    config: document.getElementById('view-config'),
    typing: document.getElementById('view-typing'),
    results: document.getElementById('view-results')
};

// Elements Configuration
const timeOptions = document.querySelectorAll('input[name="time"]');
const customTimeInput = document.getElementById('custom-time-input');
const modeOptions = document.querySelectorAll('input[name="mode"]');
const toggleKeywords = document.getElementById('toggle-keywords');
const toggleAdvancedKeywords = document.getElementById('toggle-advanced-keywords');
const toggleClasses = document.getElementById('toggle-classes');
const packageTogglesWrapper = document.getElementById('package-toggles');
const advancedPackageTogglesWrapper = document.getElementById('advanced-package-toggles');
const btnStart = document.getElementById('btn-start');
const wordTypesSection = document.getElementById('word-types-section');

// Elements Typing
const wordsWrapper = document.getElementById('words-wrapper');
const hiddenInput = document.getElementById('hidden-input');
const liveTimeDisplay = document.getElementById('live-time');
const btnAbort = document.getElementById('btn-abort');

// Elements Results
const resWpm = document.getElementById('res-wpm');
const resAcc = document.getElementById('res-acc');
const resKeys = document.getElementById('res-keys');
const resContext = document.getElementById('res-context');
const btnRestart = document.getElementById('btn-restart-results');

// Initialize
async function init() {
    await loadDictionary();
    populatePackagesUI();
    bindEvents();
}

function populatePackagesUI() {
    packageTogglesWrapper.innerHTML = '';
    advancedPackageTogglesWrapper.innerHTML = '';

    if (state.dictionary && state.dictionary.packages) {
        const packages = Object.keys(state.dictionary.packages);
        packages.forEach(pkg => {
            const label = document.createElement('label');
            label.className = 'checkbox-item';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = pkg;
            input.checked = true; // Default selected for core

            const span = document.createElement('span');
            span.className = 'checkmark';

            label.appendChild(input);
            label.appendChild(span);
            label.appendChild(document.createTextNode(' ' + pkg));

            packageTogglesWrapper.appendChild(label);
        });
    }

    if (state.advancedDictionary && state.advancedDictionary.packages) {
        const advPackages = Object.keys(state.advancedDictionary.packages);
        advPackages.forEach(pkg => {
            const label = document.createElement('label');
            label.className = 'checkbox-item';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = pkg;
            input.checked = false; // Default off for advanced

            const span = document.createElement('span');
            span.className = 'checkmark';

            label.appendChild(input);
            label.appendChild(span);
            label.appendChild(document.createTextNode(' ' + pkg));

            advancedPackageTogglesWrapper.appendChild(label);
        });
    }
}

async function loadDictionary() {
    try {
        const [dictRes, advRes] = await Promise.all([
            fetch('dictionary.json?t=' + Date.now(), {
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            }),
            fetch('packages.json?t=' + Date.now(), {
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            }).catch(e => null) // Advanced dictionary is optional, catch and return null if missing
        ]);

        if (!dictRes.ok) throw new Error("Network response was not ok");
        state.dictionary = await dictRes.json();

        if (advRes && advRes.ok) {
            state.advancedDictionary = await advRes.json();
        }
    } catch (e) {
        console.error("Failed to load dictionary config over network", e);
        alert("Failed to load dictionaries! Please ensure you are running a local server (like Live Preview) or hosting the site. Direct file:// access is blocked by browsers.");
    }
}

// Audio Engine for typo feedback (Synthetic, no files needed)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playErrorSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = 'sine'; // Milder than sawtooth
    osc.frequency.setValueAtTime(400, audioCtx.currentTime); // Start slightly higher
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.08); // Faster pitch drop

    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08); // Faster fade out

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
}

function bindEvents() {
    // Mode toggle logic (hide/show word toggles)
    modeOptions.forEach(opt => {
        opt.addEventListener('change', (e) => {
            state.config.mode = e.target.value;
            if (state.config.mode === 'method') {
                wordTypesSection.style.opacity = '0.5';
                wordTypesSection.style.pointerEvents = 'none';
            } else {
                wordTypesSection.style.opacity = '1';
                wordTypesSection.style.pointerEvents = 'auto';
            }
        });
    });

    // Time toggle logic for custom input
    timeOptions.forEach(opt => {
        opt.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customTimeInput.disabled = false;
                customTimeInput.focus();
            } else {
                customTimeInput.disabled = true;
            }
        });
    });

    btnStart.addEventListener('click', startTest);
    btnAbort.addEventListener('click', abortTest);
    btnRestart.addEventListener('click', showConfigView);

    // Global Key Events when typing - bind to window to heavily prevent focus drops
    window.addEventListener('keydown', handleTyping);

    // Focus handling
    document.addEventListener('click', (e) => {
        if (state.view === 'typing') {
            hiddenInput.focus();

            // If the user clicks anywhere and the current expected character is an auto-completed bracket, skip it.
            if (state.words.length > 0 && state.currentWordIndex < state.words.length) {
                const targetWord = state.words[state.currentWordIndex];
                if (state.currentLetterIndex < targetWord.length) {
                    const expectedChar = targetWord[state.currentLetterIndex];
                    if (expectedChar === '>' || expectedChar === ']') {
                        const wordsElements = wordsWrapper.childNodes;
                        if (wordsElements.length > state.currentWordIndex) {
                            const curWordEl = wordsElements[state.currentWordIndex];
                            const letters = curWordEl.childNodes;
                            const letterEl = letters[state.currentLetterIndex];

                            if (letterEl && letterEl.classList.contains('auto-completed')) {
                                letterEl.classList.remove('auto-completed');
                                letterEl.classList.add('correct');
                                state.stats.correctKeystrokes++;
                                state.currentLetterIndex++;
                                updateWordDisplayStatus();
                            }
                        }
                    }
                }
            }
        }
    });
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    state.view = viewName;
}

function showConfigView() {
    state.isActive = false;
    resetStats();
    switchView('config');
}

function readConfig() {
    const selectedTime = document.querySelector('input[name="time"]:checked').value;
    if (selectedTime === 'custom') {
        const customMins = parseInt(customTimeInput.value) || 1;
        state.config.time = customMins * 60;
    } else {
        state.config.time = parseInt(selectedTime);
    }
    state.config.mode = document.querySelector('input[name="mode"]:checked').value;

    state.config.includeKeywords = toggleKeywords.checked;
    state.config.includeAdvancedKeywords = toggleAdvancedKeywords.checked;
    state.config.includeClasses = toggleClasses.checked;

    const activePackages = [];
    document.querySelectorAll('#package-toggles input[type="checkbox"]').forEach(cb => {
        if (cb.checked) activePackages.push(cb.value);
    });
    document.querySelectorAll('#advanced-package-toggles input[type="checkbox"]').forEach(cb => {
        if (cb.checked) activePackages.push(cb.value);
    });

    state.config.packages = activePackages;
}

function generateWords(count = 50) {
    const words = [];
    const { mode, includeKeywords, includeClasses, packages } = state.config;
    const dict = state.dictionary;

    if (!dict) return ["System.out.println(\"Error\");"];

    // Collect pools based on config
    let keywordsPool = [];
    let classesPool = [];

    const advancedList = ['volatile', 'transient', 'synchronized', 'instanceof', 'throws'];
    let baseKeywords = dict.keywords || [];

    // Ensure all advanced words actually exist in baseKeywords
    advancedList.forEach(adv => {
        if (!baseKeywords.includes(adv)) baseKeywords.push(adv);
    });

    if (includeKeywords) {
        keywordsPool = keywordsPool.concat(baseKeywords.filter(kw => !advancedList.includes(kw)));
    }

    if (state.config.includeAdvancedKeywords) {
        keywordsPool = keywordsPool.concat(baseKeywords.filter(kw => advancedList.includes(kw)));
    }

    if (includeClasses || mode === 'method') {
        packages.forEach(pkgName => {
            if (dict.packages && dict.packages[pkgName]) {
                Object.keys(dict.packages[pkgName]).forEach(className => {
                    classesPool.push({ className, methods: dict.packages[pkgName][className] });
                });
            } else if (state.advancedDictionary && state.advancedDictionary.packages && state.advancedDictionary.packages[pkgName]) {
                Object.keys(state.advancedDictionary.packages[pkgName]).forEach(className => {
                    classesPool.push({ className, methods: state.advancedDictionary.packages[pkgName][className] });
                });
            }
        });
    }

    if (mode === 'standard') {
        const hasKeywords = keywordsPool.length > 0;
        const hasClasses = classesPool.length > 0;

        for (let i = 0; i < count; i++) {
            let choice = 0; // 0 = keyword, 1 = class
            if (hasKeywords && hasClasses) {
                choice = Math.random() > 0.5 ? 1 : 0;
            } else if (hasClasses) {
                choice = 1;
            } else if (hasKeywords) {
                choice = 0;
            } else {
                words.push("default");
                continue;
            }

            if (choice === 0) {
                let kw = getRandomItem(keywordsPool);
                // Arrays can be appended to primitive types
                if (['int', 'boolean', 'double', 'float', 'char', 'long', 'short', 'byte', 'String'].includes(kw) && Math.random() > 0.7) {
                    kw += "[]";
                }
                words.push(kw);
            } else {
                const cls = getRandomItem(classesPool).className;
                let resolved = resolveGenerics(cls, classesPool);
                if (Math.random() > 0.8) {
                    resolved += "[]";
                }
                words.push(resolved);
            }
        }
    } else if (mode === 'method') {
        // Method Practice Mode
        for (let i = 0; i < count; i++) {
            const clsData = getRandomItem(classesPool);
            let clsName = resolveGenerics(clsData.className, classesPool);

            // Randomly pick between 1 and the total number of available methods for this class
            const numMethods = clsData.methods.length > 0 ? Math.floor(Math.random() * clsData.methods.length) + 1 : 0;

            // Push class name
            words.push(clsName);
            // Push literal newline marker
            words.push("\n");

            if (numMethods > 0) {
                for (let j = 0; j < numMethods; j++) {
                    const method = getRandomItem(clsData.methods);
                    words.push(method + ";");
                    words.push("\n");
                }
            }

            // Push one extra newline to separate from the next class sequence
            words.push("\n");
        }
    }

    return words;
}

// Basic depth 1 & 2 generic resolution
function resolveGenerics(classSignature, classesPool) {
    if (!classSignature.includes('<')) return classSignature;

    // Very naive regex replacement to support <K, V> or <E> 
    // This could be made recursive for Depth 2, but for now we'll do random selection of basic wrappers
    const wrappers = ["Integer", "String", "Double", "Boolean"];

    return classSignature.replace(/<(.*?)>/, (match, types) => {
        const typeVars = types.split(',');
        const resolvedTypes = typeVars.map(() => {
            // Depth 1 -> randomly pick a wrapper
            // Depth 2 -> occasionally pick a Collection 
            if (Math.random() > 0.85) {
                // Depth 2
                const innerCls = getRandomItem(classesPool).className;
                // prevent infinite loops or excessively gross generics if it also has < >
                return innerCls.replace(/<(.*?)>/, (match, innerTypes) => {
                    const innerTypeVars = innerTypes.split(',');
                    const innerResolved = innerTypeVars.map(() => getRandomItem(wrappers));
                    return `<${innerResolved.join(', ')}>`;
                });
            }
            return getRandomItem(wrappers);
        });
        return `<${resolvedTypes.join(', ')}>`;
    });
}

function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function startTest() {
    readConfig();

    // Validation
    if (state.config.mode === 'standard') {
        if (!state.config.includeKeywords && !state.config.includeClasses && !state.config.includeAdvancedKeywords) {
            alert("Please select at least one Element Type (Keywords, Classes, or Advanced).");
            return;
        }
    }

    if (state.config.mode === 'method' || state.config.includeClasses) {
        if (state.config.packages.length === 0) {
            alert("Please select at least one Package.");
            return;
        }
    }

    resetStats();

    state.words = generateWords(100);
    renderWords();

    state.timeLeft = state.config.time;
    updateTimerDisplay();

    switchView('typing');
    hiddenInput.focus();

    updateWordDisplayStatus();
    wordsWrapper.style.transform = 'translateY(0)';

    // Defer the scroll reset until after the browser redraws the 'typing' view
    requestAnimationFrame(() => {
        wordsWrapper.scrollTo(0, 0);
        wordsWrapper.scrollTop = 0;
    });
}

function getSyntaxClass(wordStr, mode) {
    if (mode === 'method') {
        if (wordStr.startsWith('.')) return 'syntax-method';
        return 'syntax-class';
    }

    if (state.dictionary && state.dictionary.keywords && state.dictionary.keywords.includes(wordStr)) {
        return 'syntax-keyword';
    }

    if (wordStr.includes('<') || /^[A-Z]/.test(wordStr)) {
        return 'syntax-class';
    }
    return '';
}

function renderWords(startIndex = 0) {
    if (startIndex === 0) wordsWrapper.innerHTML = '';

    for (let wIdx = startIndex; wIdx < state.words.length; wIdx++) {
        const w = state.words[wIdx];

        // Handle explicit newline
        if (w === "\n") {
            const brEl = document.createElement('div');
            brEl.className = 'line-break';
            brEl.dataset.index = wIdx;
            wordsWrapper.appendChild(brEl);
            continue;
        }

        const wordEl = document.createElement('div');
        wordEl.className = 'word';
        wordEl.dataset.index = wIdx;

        // Space visually separates words, but we must make sure the span for space exists or margins handle it.
        // In the spec, user needs to press 'space' to move to next word. We don't render the space as a letter. 
        // Our margin-right string handles spacing.
        let inString = false;

        // Split word into letters
        for (let i = 0; i < w.length; i++) {
            const charSpan = document.createElement('span');
            charSpan.className = 'letter';

            const char = w[i];
            charSpan.textContent = char;

            // Syntax coloring
            if (char === '"') inString = !inString;

            if (inString || char === '"') {
                charSpan.classList.add('syntax-string');
            } else if (['(', ')', '{', '}', '[', ']', '<', '>'].includes(char)) {
                charSpan.classList.add('syntax-brace');
            } else {
                const syntaxClass = getSyntaxClass(w, state.config.mode);
                // Also highlight the dot as a generic class so it doesn't look weird
                if (syntaxClass) charSpan.classList.add(syntaxClass);
            }

            wordEl.appendChild(charSpan);
        }
        wordsWrapper.appendChild(wordEl);
    }
}

function updateWordDisplayStatus() {
    // Remove active classes from all
    document.querySelectorAll('.word.active, .letter.active, .end-cursor').forEach(el => {
        el.classList.remove('active');
        el.classList.remove('end-cursor');
    });

    let wordsElements = wordsWrapper.childNodes;

    if (state.currentWordIndex >= state.words.length - 20) {
        // Continuous generation: buffer more words when getting close to the end
        const oldLength = state.words.length;
        const moreWords = generateWords(50);
        state.words = state.words.concat(moreWords);
        renderWords(oldLength);
        wordsElements = wordsWrapper.childNodes; // Re-evaluate after rendering new words
    }

    // Safety check just in case
    if (wordsElements.length === 0 || state.currentWordIndex >= wordsElements.length) return;

    const curWordEl = wordsElements[state.currentWordIndex];
    curWordEl.classList.add('active');

    // Handle scrolling
    const wordTop = curWordEl.offsetTop;
    const wrapperTop = wordsWrapper.offsetTop;
    if (wordTop - wrapperTop > 60) {
        // Move lines up (very simple approach: translate Y or adjust scroll)
        // To be implemented properly for smooth UX. Let's just adjust scroll.
        wordsWrapper.scrollTop = wordTop - 30;
    }

    const letters = curWordEl.childNodes;
    if (state.currentLetterIndex < letters.length) {
        letters[state.currentLetterIndex].classList.add('active');
    } else {
        // Cursor at the end of the word (waiting for space)
        curWordEl.classList.add('end-cursor');
    }
}

// Function to find matching bracket index
function findMatchingBracket(word, openIdx, type = 'generic') {
    let depth = 0;
    let openChar = '<';
    let closeChar = '>';
    if (type === 'array') { openChar = '['; closeChar = ']'; }
    if (type === 'parentheses') { openChar = '('; closeChar = ')'; }

    for (let i = openIdx; i < word.length; i++) {
        if (word[i] === openChar) depth++;
        if (word[i] === closeChar) depth--;
        if (depth === 0) return i;
    }
    return -1;
}

// Typing Engine 
function handleTyping(e) {
    if (state.view !== 'typing') return;

    // Tab Restart
    if (e.key === 'Tab') {
        e.preventDefault();
        clearInterval(state.timer);
        state.isActive = false;
        startTest();
        return;
    }

    // Ignore modifiers
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Shift' || e.key === 'CapsLock' || e.key === 'Escape') return;

    if (!state.isActive && e.key.length === 1 && /[a-zA-Z0-9<>\s\.\(\),;]/.test(e.key)) {
        startTimer();
    }

    const wordEls = wordsWrapper.childNodes;
    const curWordEl = wordEls[state.currentWordIndex];
    const letters = curWordEl.childNodes;
    const targetWord = state.words[state.currentWordIndex];

    state.stats.totalKeystrokes++;

    if (e.key === 'Backspace') {
        e.preventDefault(); // prevent navigation

        if (state.currentLetterIndex > 0) {
            state.currentLetterIndex--;
            const charBeingDeleted = targetWord[state.currentLetterIndex];
            letters[state.currentLetterIndex].classList.remove('correct', 'incorrect');

            // Un-auto-complete the matching bracket if we're deleting a '<', '[', or '('
            if (charBeingDeleted === '<' || charBeingDeleted === '[' || charBeingDeleted === '(') {
                let type = 'generic';
                if (charBeingDeleted === '[') type = 'array';
                if (charBeingDeleted === '(') type = 'parentheses';

                const matchingBracketIdx = findMatchingBracket(targetWord, state.currentLetterIndex, type);
                if (matchingBracketIdx !== -1) {
                    letters[matchingBracketIdx].classList.remove('auto-completed');
                    letters[matchingBracketIdx].classList.remove('correct'); // Just in case
                }
            }
        } else if (state.currentWordIndex > 0) {
            // go to prev word only if it was not fully correct (not part of this spec but good practice)
            state.currentWordIndex--;
            const prevWordEl = wordEls[state.currentWordIndex];
            state.currentLetterIndex = prevWordEl.childNodes.length;

            // check if there is an incorrect char at the end, jump to it
            let lastIncorrect = -1;
            for (let i = prevWordEl.childNodes.length - 1; i >= 0; i--) {
                if (prevWordEl.childNodes[i].classList.contains('incorrect')) {
                    lastIncorrect = i;
                    break;
                }
            }
            if (lastIncorrect !== -1) {
                state.currentLetterIndex = lastIncorrect;
                prevWordEl.childNodes[lastIncorrect].classList.remove('incorrect');
            }
        }
        updateWordDisplayStatus();
        return;
    }

    // NEW: Block typing if the previous character in THIS word was incorrect!
    if (state.currentLetterIndex > 0 && letters[state.currentLetterIndex - 1].classList.contains('incorrect')) {
        // Must press Backspace! Enforce animation of the blocked character.
        const blockedLetterEl = letters[state.currentLetterIndex - 1];
        blockedLetterEl.classList.remove('incorrect');
        void blockedLetterEl.offsetWidth; // Force DOM reflow
        blockedLetterEl.classList.add('incorrect');

        playErrorSound();
        return;
    }

    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();

        if (e.key === ' ' && state.currentLetterIndex < targetWord.length && targetWord[state.currentLetterIndex] === ' ') {
            // Space is literally part of the current word snippet; standard character keystroke
        } else {
            // Check if there are any `.incorrect` or untyped letters in current word
            let hasErrors = false;
            let isComplete = state.currentLetterIndex === letters.length;

            if (letters) {
                for (let i = 0; i < letters.length; i++) {
                    if (letters[i].classList.contains('incorrect')) hasErrors = true;
                }
            }

            if (hasErrors || !isComplete) {
                // User pressed space/enter but the word isn't finished and the next expected character ISNT a space/enter
                if (!isComplete && letters && state.currentLetterIndex < letters.length) {
                    const letterEl = letters[state.currentLetterIndex];

                    letterEl.classList.remove('incorrect');
                    void letterEl.offsetWidth; // Force DOM reflow to restart CSS animation
                    letterEl.classList.add('incorrect');

                    state.stats.incorrectKeystrokes++;
                    state.currentLetterIndex++;
                    updateWordDisplayStatus();
                    playErrorSound();
                }
                return; // Halt 
            }

            // Move to next word. If the next word is a newline, automatically skip it over so they don't have to hit space again
            do {
                state.currentWordIndex++;
                state.currentLetterIndex = 0;
            } while (state.currentWordIndex < state.words.length && state.words[state.currentWordIndex] === "\n");

            // Buffer words
            if (state.currentWordIndex >= state.words.length - 20) {
                const oldLength = state.words.length;
                const moreWords = generateWords(50);
                state.words = state.words.concat(moreWords);
                renderWords(oldLength);
            }

            updateWordDisplayStatus();
            return;
        }
    }

    // Normal Character Input and Navigation
    if (e.key.length === 1 || e.key === 'ArrowRight') {
        if (e.key !== 'ArrowRight') e.preventDefault();

        if (state.currentLetterIndex < targetWord.length) {
            const expectedChar = targetWord[state.currentLetterIndex];
            const letterEl = letters[state.currentLetterIndex];

            // Spec 3: ArrowRight or '>'/']'/')' skips auto-completed bracket
            if ((e.key === '>' || e.key === ']' || e.key === ')' || e.key === 'ArrowRight') && (expectedChar === '>' || expectedChar === ']' || expectedChar === ')')) {
                // If they pressed the exact right key, or ArrowRight
                if (e.key === 'ArrowRight' || e.key === expectedChar) {
                    if (letterEl.classList.contains('auto-completed')) {
                        letterEl.classList.remove('auto-completed');
                        letterEl.classList.add('correct');
                        state.stats.correctKeystrokes++;
                        state.currentLetterIndex++;
                        updateWordDisplayStatus();
                        return;
                    }
                }
            }

            // Ignore ArrowRight if not auto-completing
            if (e.key === 'ArrowRight') return;

            if (e.key === expectedChar) {
                letterEl.classList.add('correct');
                state.stats.correctKeystrokes++;

                // Active auto-completion logic for Generics < >, Arrays [ ], and Parentheses ( )
                if (e.key === '<' || e.key === '[' || e.key === '(') {
                    let type = 'generic';
                    if (e.key === '[') type = 'array';
                    if (e.key === '(') type = 'parentheses';

                    const matchingBracketIdx = findMatchingBracket(targetWord, state.currentLetterIndex, type);
                    if (matchingBracketIdx !== -1) {
                        letters[matchingBracketIdx].classList.add('auto-completed');
                    }
                }
            } else {
                letterEl.classList.remove('incorrect');
                void letterEl.offsetWidth; // Force DOM reflow
                letterEl.classList.add('incorrect');

                state.stats.incorrectKeystrokes++;
                playErrorSound();
            }
            state.currentLetterIndex++; // Advance in BOTH cases to allow backspace to work uniformly.
        }

        updateWordDisplayStatus();
    }
}

// Timer Logic
function startTimer() {
    if (state.isActive) return;
    state.isActive = true;
    state.startTime = Date.now();

    state.timer = setInterval(() => {
        state.timeLeft--;
        updateTimerDisplay();

        if (state.timeLeft <= 0) {
            endTest();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    liveTimeDisplay.textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

function abortTest() {
    clearInterval(state.timer);
    state.isActive = false;
    // User requested to see results even if aborted in between
    endTest();
}

function endTest() {
    clearInterval(state.timer);
    state.isActive = false;
    calculateResults();
    switchView('results');
}

function resetStats() {
    state.currentWordIndex = 0;
    state.currentLetterIndex = 0;
    state.stats = { correctKeystrokes: 0, incorrectKeystrokes: 0, totalKeystrokes: 0 };
    wordsWrapper.style.transform = 'translateY(0)';
    wordsWrapper.scrollTop = 0;
}

function calculateResults() {
    // If the test hasn't started yet but they abort, elapsed is 0
    const elapsedMins = (state.config.time - state.timeLeft) / 60;
    let wpm = 0;
    if (elapsedMins > 0) {
        // WPM = (Total Keystrokes / 5) / Time
        wpm = Math.round((state.stats.correctKeystrokes / 5) / elapsedMins);
    }

    let accuracy = 0;
    if (state.stats.totalKeystrokes > 0) {
        accuracy = Math.round((state.stats.correctKeystrokes / state.stats.totalKeystrokes) * 100);
    }

    resWpm.textContent = wpm;
    resAcc.textContent = `${accuracy}%`;
    const corrKeysSpan = resKeys.querySelector('.correct-text');
    const incorrKeysSpan = resKeys.querySelector('.incorrect-text');

    resKeys.innerHTML = `${state.stats.totalKeystrokes}<small>(<span class="correct-text">${state.stats.correctKeystrokes}</span> | <span class="incorrect-text">${state.stats.incorrectKeystrokes}</span>)</small>`;

    // Context display
    const pkgLabels = state.config.packages.join(', ');
    resContext.textContent = `Mode: ${state.config.mode === 'standard' ? 'Standard' : 'Method'} | Time: ${Math.floor(state.config.time / 60)} min | Packages: ${pkgLabels}`;
}

// Start
document.addEventListener('DOMContentLoaded', init);
