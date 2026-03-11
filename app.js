/* ===================================================================
   QuizForge — MCQ Practice System  |  app.js
   =================================================================== */

(() => {
    "use strict";

    // ───── DOM refs ─────
    const $ = (id) => document.getElementById(id);
    const views = {
        home: $("viewHome"),
        config: $("viewConfig"),
        manage: $("viewManage"),
        quiz: $("viewQuiz"),
        results: $("viewResults"),
        review: $("viewReview"),
    };
    const navBtns = document.querySelectorAll(".nav-btn[data-view]");

    // ───── State ─────
    const STORAGE_KEY = "quizforge_banks";
    let banks = loadBanks();
    let currentQuiz = null;
    let configMode = null; // 'comprehensive' or 'custom'
    let customQuestions = null; // holds uploaded questions for custom mode
    let lastQuizConfig = null; // remember config for retry

    // ───── Navigation ─────
    function showView(name) {
        Object.values(views).forEach((v) => v.classList.remove("active-view"));
        views[name].classList.add("active-view");
        navBtns.forEach((b) => {
            b.classList.toggle("active", b.dataset.view === name);
        });
        if (!["home", "manage"].includes(name)) {
            navBtns.forEach((b) => b.classList.remove("active"));
        }
        window.scrollTo(0, 0);
    }

    navBtns.forEach((b) =>
        b.addEventListener("click", () => {
            showView(b.dataset.view);
            if (b.dataset.view === "manage") renderManage();
        })
    );
    $("navBrand").addEventListener("click", () => showView("home"));

    // ───── Persistence ─────
    function loadBanks() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }
    function saveBanks() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(banks));
    }

    // ───── MODE SELECTION (HOME) ─────
    $("modeComprehensive").addEventListener("click", () => {
        configMode = "comprehensive";
        customQuestions = null;
        openConfig(COMPREHENSIVE_QUESTIONS, "Comprehensive Exam");
    });

    $("modeCustom").addEventListener("click", () => {
        configMode = "custom";
        customQuestions = null;
        showView("config");
        $("configTitle").textContent = "Upload Your Questions";
        $("configSubtitle").textContent = "Upload a JSON file to get started.";
        $("uploadSection").classList.remove("hidden");
        $("configPanel").classList.add("hidden");
        resetUploadZone();
    });

    // ───── CONFIG VIEW ─────
    function openConfig(questions, title) {
        showView("config");
        $("configTitle").textContent = title || "Configure Your Test";
        $("configSubtitle").textContent = `${questions.length} questions available. Set your range and count.`;
        $("uploadSection").classList.add("hidden");
        $("configPanel").classList.remove("hidden");

        const total = questions.length;
        $("totalQuestionsLabel").textContent = total;
        $("rangeFrom").value = 1;
        $("rangeFrom").max = total;
        $("rangeTo").value = total;
        $("rangeTo").max = total;
        $("questionCount").value = Math.min(25, total);
        $("questionCount").max = total;
        $("shuffleToggle").checked = true;

        hideEl($("configFeedback"));
    }

    $("configBackBtn").addEventListener("click", () => {
        showView("home");
    });

    // ───── FILE UPLOAD (Custom Mode) ─────
    const dropZone = $("dropZone");
    const fileInput = $("fileInput");

    $("browseFileBtn").addEventListener("click", (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    dropZone.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
    });

    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    function handleFile(file) {
        if (!file.name.endsWith(".json")) {
            return showUploadFeedback("Please upload a .json file.", "error");
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!Array.isArray(data) || data.length === 0) {
                    return showUploadFeedback("JSON must be a non-empty array of question objects.", "error");
                }

                // Validate
                const errors = [];
                data.forEach((q, i) => {
                    if (!q.question) errors.push(`Q${i + 1}: missing "question"`);
                    if (!Array.isArray(q.options) || q.options.length < 2)
                        errors.push(`Q${i + 1}: "options" must have at least 2 items`);
                    if (typeof q.answer !== "number" || q.answer < 0 || q.answer >= (q.options?.length ?? 0))
                        errors.push(`Q${i + 1}: invalid "answer" index`);
                });
                if (errors.length > 0) {
                    return showUploadFeedback("Validation errors:\n• " + errors.slice(0, 5).join("\n• ") +
                        (errors.length > 5 ? `\n…and ${errors.length - 5} more` : ""), "error");
                }

                customQuestions = data;

                // Also save to banks
                const baseName = file.name.replace(/\.json$/i, "").replace(/[_-]/g, " ");
                banks.push({
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    name: baseName,
                    questions: data,
                    createdAt: new Date().toISOString(),
                });
                saveBanks();

                // Update UI
                dropZone.classList.add("file-loaded");
                $("dropZoneHint").innerHTML = `<div class="drop-zone-filename">${esc(file.name)} (${data.length} questions)</div>`;

                // Show config panel
                openConfig(data, "Custom Test");

            } catch (err) {
                customQuestions = null;
                showUploadFeedback(`Invalid JSON: ${err.message}`, "error");
            }
        };
        reader.readAsText(file);
    }

    function resetUploadZone() {
        fileInput.value = "";
        dropZone.classList.remove("file-loaded", "drag-over");
        $("dropZoneHint").textContent = "Accepted: .json files";
        hideEl($("uploadFeedback"));
    }

    function showUploadFeedback(msg, type) {
        const fb = $("uploadFeedback");
        fb.textContent = msg;
        fb.className = `feedback ${type}`;
        fb.classList.remove("hidden");
        clearTimeout(fb._timer);
        fb._timer = setTimeout(() => fb.classList.add("hidden"), 6000);
    }

    // ───── START QUIZ FROM CONFIG ─────
    $("startQuizBtn").addEventListener("click", () => {
        const questions = configMode === "comprehensive" ? COMPREHENSIVE_QUESTIONS : customQuestions;
        if (!questions || questions.length === 0) {
            return showConfigFeedback("No questions loaded.", "error");
        }

        const total = questions.length;
        const from = parseInt($("rangeFrom").value) || 1;
        const to = parseInt($("rangeTo").value) || total;
        const count = parseInt($("questionCount").value) || 25;
        const shuffle = $("shuffleToggle").checked;

        // Validate
        if (from < 1 || from > total) {
            return showConfigFeedback(`"From" must be between 1 and ${total}.`, "error");
        }
        if (to < from || to > total) {
            return showConfigFeedback(`"To" must be between ${from} and ${total}.`, "error");
        }
        const rangeSize = to - from + 1;
        if (count < 1 || count > rangeSize) {
            return showConfigFeedback(`Count must be between 1 and ${rangeSize} (range size).`, "error");
        }

        // Slice the range (1-indexed to 0-indexed)
        let selected = questions.slice(from - 1, to);

        if (shuffle) {
            selected = [...selected].sort(() => Math.random() - 0.5);
        }

        // Pick `count` questions
        selected = selected.slice(0, count);

        lastQuizConfig = { configMode, from, to, count, shuffle };

        currentQuiz = {
            bankId: configMode === "comprehensive" ? "__comprehensive__" : "__custom__",
            bankName: configMode === "comprehensive" ? "Comprehensive Exam" : "Custom Test",
            questions: selected,
            answers: new Array(selected.length).fill(null),
            currentIdx: 0,
        };

        showView("quiz");
        $("quizTitle").textContent = currentQuiz.bankName;
        $("quizTotal").textContent = selected.length;
        renderQuestion();
    });

    function showConfigFeedback(msg, type) {
        const fb = $("configFeedback");
        fb.textContent = msg;
        fb.className = `feedback ${type}`;
        fb.classList.remove("hidden");
        clearTimeout(fb._timer);
        fb._timer = setTimeout(() => fb.classList.add("hidden"), 6000);
    }

    // ───── MANAGE ─────
    function renderManage() {
        const list = $("bankList");
        const empty = $("emptyManage");
        if (banks.length === 0) {
            list.innerHTML = "";
            empty.style.display = "block";
            return;
        }
        empty.style.display = "none";
        list.innerHTML = banks
            .map(
                (b, i) => `
            <div class="bank-item">
                <div class="bank-item-info">
                    <h3>${esc(b.name)}</h3>
                    <p>${b.questions.length} questions · Added ${formatDate(b.createdAt)}</p>
                </div>
                <div class="bank-item-actions">
                    <button class="btn btn-primary btn-sm start-btn" data-idx="${i}">Start</button>
                    <button class="btn btn-danger btn-sm delete-btn" data-idx="${i}">Delete</button>
                </div>
            </div>`
            )
            .join("");

        list.querySelectorAll(".start-btn").forEach((b) =>
            b.addEventListener("click", () => {
                const bank = banks[+b.dataset.idx];
                if (bank) {
                    configMode = "custom";
                    customQuestions = bank.questions;
                    openConfig(bank.questions, bank.name);
                }
            })
        );
        list.querySelectorAll(".delete-btn").forEach((b) =>
            b.addEventListener("click", () => {
                if (confirm(`Delete "${banks[+b.dataset.idx].name}"?`)) {
                    banks.splice(+b.dataset.idx, 1);
                    saveBanks();
                    renderManage();
                }
            })
        );
    }

    // ───── QUIZ ENGINE ─────
    function renderQuestion() {
        const q = currentQuiz.questions[currentQuiz.currentIdx];
        const idx = currentQuiz.currentIdx;
        const selected = currentQuiz.answers[idx];
        const isAnswered = selected !== null;

        $("quizCurrent").textContent = idx + 1;
        $("qNumber").textContent = `Question ${idx + 1}`;
        $("qText").textContent = q.question;

        // Progress bar
        $("progressFill").style.width = `${((idx + 1) / currentQuiz.questions.length) * 100}%`;

        // Options
        const letters = "ABCDEFGHIJ";
        $("optionsList").innerHTML = q.options
            .map((opt, oi) => {
                let cls = "option-btn";
                let icon = "";
                if (isAnswered) {
                    cls += " locked";
                    if (oi === q.answer) {
                        cls += " correct";
                        icon = `<span class="option-result-icon">✓</span>`;
                    }
                    if (oi === selected && selected !== q.answer) {
                        cls += " wrong";
                        icon = `<span class="option-result-icon">✗</span>`;
                    }
                }
                if (oi === selected) cls += " selected";
                return `<button class="${cls}" data-oi="${oi}">
                    <span class="option-letter">${letters[oi]}</span>
                    <span>${esc(opt)}</span>
                    ${icon}
                </button>`;
            })
            .join("");

        // Option click
        if (!isAnswered) {
            $("optionsList").querySelectorAll(".option-btn").forEach((btn) =>
                btn.addEventListener("click", () => selectAnswer(+btn.dataset.oi))
            );
        }

        // Explanation
        if (isAnswered && q.explanation) {
            $("explanationText").textContent = q.explanation;
            $("explanationBox").classList.remove("hidden");
        } else {
            $("explanationBox").classList.add("hidden");
        }

        // Nav buttons
        $("prevBtn").style.visibility = idx > 0 ? "visible" : "hidden";
        const isLast = idx === currentQuiz.questions.length - 1;
        $("nextBtn").textContent = isLast ? "Finish Quiz ✓" : "Next →";
    }

    function selectAnswer(optionIdx) {
        currentQuiz.answers[currentQuiz.currentIdx] = optionIdx;
        renderQuestion();
    }

    $("prevBtn").addEventListener("click", () => {
        if (currentQuiz && currentQuiz.currentIdx > 0) {
            currentQuiz.currentIdx--;
            renderQuestion();
        }
    });

    $("nextBtn").addEventListener("click", () => {
        if (!currentQuiz) return;
        if (currentQuiz.currentIdx < currentQuiz.questions.length - 1) {
            currentQuiz.currentIdx++;
            renderQuestion();
        } else {
            showResults();
        }
    });

    $("quizBackBtn").addEventListener("click", () => {
        if (confirm("Leave this quiz? Your progress will be lost.")) {
            showView("home");
        }
    });

    // ───── RESULTS ─────
    function showResults() {
        const { questions, answers } = currentQuiz;
        let correct = 0, wrong = 0, skipped = 0;
        answers.forEach((a, i) => {
            if (a === null) skipped++;
            else if (a === questions[i].answer) correct++;
            else wrong++;
        });
        const pct = Math.round((correct / questions.length) * 100);

        $("statCorrect").textContent = correct;
        $("statWrong").textContent = wrong;
        $("statSkipped").textContent = skipped;
        $("scoreLabel").textContent = pct + "%";

        if (pct >= 80) {
            $("resultsIcon").textContent = "";
            $("resultsTitle").textContent = "Excellent!";
        } else if (pct >= 50) {
            $("resultsIcon").textContent = "";
            $("resultsTitle").textContent = "Good Effort!";
        } else {
            $("resultsIcon").textContent = "";
            $("resultsTitle").textContent = "Keep Practicing!";
        }

        // Animate score ring
        showView("results");
        const circumference = 2 * Math.PI * 52;
        const offset = circumference - (pct / 100) * circumference;
        const fill = $("scoreRingFill");
        fill.style.strokeDasharray = circumference;
        fill.style.strokeDashoffset = circumference;
        if (pct >= 80) fill.style.stroke = "var(--correct)";
        else if (pct >= 50) fill.style.stroke = "var(--accent)";
        else fill.style.stroke = "var(--wrong)";

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                fill.style.strokeDashoffset = offset;
            });
        });
    }

    $("retryBtn").addEventListener("click", () => {
        // Re-run with same config
        if (lastQuizConfig) {
            const questions = lastQuizConfig.configMode === "comprehensive" ? COMPREHENSIVE_QUESTIONS : customQuestions;
            if (questions) {
                const { from, to, count, shuffle } = lastQuizConfig;
                let selected = questions.slice(from - 1, to);
                if (shuffle) selected = [...selected].sort(() => Math.random() - 0.5);
                selected = selected.slice(0, count);

                currentQuiz = {
                    bankId: lastQuizConfig.configMode === "comprehensive" ? "__comprehensive__" : "__custom__",
                    bankName: lastQuizConfig.configMode === "comprehensive" ? "Comprehensive Exam" : "Custom Test",
                    questions: selected,
                    answers: new Array(selected.length).fill(null),
                    currentIdx: 0,
                };

                showView("quiz");
                $("quizTitle").textContent = currentQuiz.bankName;
                $("quizTotal").textContent = selected.length;
                renderQuestion();
                return;
            }
        }
        showView("home");
    });

    $("reviewBtn").addEventListener("click", showReview);

    $("goHomeBtn").addEventListener("click", () => showView("home"));

    // ───── REVIEW ─────
    function showReview() {
        const { questions, answers } = currentQuiz;
        const letters = "ABCDEFGHIJ";

        $("reviewList").innerHTML = questions
            .map((q, i) => {
                const selected = answers[i];
                let status = "review-skipped";
                if (selected !== null) {
                    status = selected === q.answer ? "review-correct" : "review-wrong";
                }

                const optionsHTML = q.options
                    .map((opt, oi) => {
                        let cls = "review-option";
                        if (oi === q.answer) cls += " is-correct";
                        if (oi === selected && selected !== q.answer) cls += " is-wrong";
                        return `<div class="${cls}">
                            <span class="ro-letter">${letters[oi]}</span>
                            <span>${esc(opt)}</span>
                            ${oi === q.answer ? " ✓" : ""}
                            ${oi === selected && selected !== q.answer ? " ✗ (your answer)" : ""}
                        </div>`;
                    })
                    .join("");

                return `<div class="review-item ${status}">
                    <div class="review-q-number">Question ${i + 1}</div>
                    <div class="review-q-text">${esc(q.question)}</div>
                    <div class="review-options">${optionsHTML}</div>
                    ${q.explanation ? `<div class="review-explanation">${esc(q.explanation)}</div>` : ""}
                </div>`;
            })
            .join("");

        showView("review");
    }

    $("reviewBackBtn").addEventListener("click", () => showView("results"));

    // ───── Helpers ─────
    function esc(str) {
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    function hideEl(el) {
        el.classList.add("hidden");
    }

    function formatDate(iso) {
        try {
            return new Date(iso).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return "";
        }
    }
})();
