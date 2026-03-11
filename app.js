/* ===================================================================
   QuizForge — MCQ Practice System  |  app.js
   =================================================================== */

(() => {
    "use strict";

    // ───── DOM refs ─────
    const $ = (id) => document.getElementById(id);
    const views = {
        home: $("viewHome"),
        import: $("viewImport"),
        manage: $("viewManage"),
        quiz: $("viewQuiz"),
        results: $("viewResults"),
        review: $("viewReview"),
    };
    const navBtns = document.querySelectorAll(".nav-btn[data-view]");

    // ───── State ─────
    const STORAGE_KEY = "quizforge_banks";
    let banks = loadBanks();
    let currentQuiz = null; // { bankId, questions, answers[], currentIdx }

    // ───── Navigation ─────
    function showView(name) {
        Object.values(views).forEach((v) => v.classList.remove("active-view"));
        views[name].classList.add("active-view");
        navBtns.forEach((b) => {
            b.classList.toggle("active", b.dataset.view === name);
        });
        // hide nav highlights for quiz/results/review
        if (!["home", "import", "manage"].includes(name)) {
            navBtns.forEach((b) => b.classList.remove("active"));
        }
    }

    navBtns.forEach((b) =>
        b.addEventListener("click", () => {
            showView(b.dataset.view);
            if (b.dataset.view === "home") renderHome();
            if (b.dataset.view === "manage") renderManage();
        })
    );
    $("navBrand").addEventListener("click", () => {
        showView("home");
        renderHome();
    });

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

    // ───── HOME ─────
    function renderHome() {
        const grid = $("bankCardGrid");
        const empty = $("emptyHome");
        if (banks.length === 0) {
            grid.innerHTML = "";
            empty.style.display = "block";
            return;
        }
        empty.style.display = "none";
        grid.innerHTML = banks
            .map(
                (b, i) => `
            <div class="bank-card" data-bank-idx="${i}">
                <div class="bank-card-title">${esc(b.name)}</div>
                <div class="bank-card-count"><strong>${b.questions.length}</strong> questions</div>
                <div class="bank-card-date">Added ${formatDate(b.createdAt)}</div>
            </div>`
            )
            .join("");
        grid.querySelectorAll(".bank-card").forEach((card) =>
            card.addEventListener("click", () => startQuiz(+card.dataset.bankIdx))
        );
    }

    $("emptyGoImport").addEventListener("click", () => showView("import"));

    // ───── IMPORT ─────
    let pendingFileJSON = null; // holds parsed JSON from file upload

    const sampleJSON = `[
  {
    "question": "What is the powerhouse of the cell?",
    "options": ["Nucleus", "Mitochondria", "Ribosome", "Golgi apparatus"],
    "answer": 1,
    "explanation": "Mitochondria generate most of the cell's supply of ATP through oxidative phosphorylation."
  },
  {
    "question": "Which data structure uses FIFO ordering?",
    "options": ["Stack", "Queue", "Tree", "Graph"],
    "answer": 1,
    "explanation": "Queue follows First‑In‑First‑Out (FIFO) ordering."
  },
  {
    "question": "What does HTTP stand for?",
    "options": [
      "HyperText Transfer Protocol",
      "High Transfer Text Protocol",
      "HyperText Transmission Process",
      "Hyper Transfer Text Protocol"
    ],
    "answer": 0,
    "explanation": "HTTP stands for HyperText Transfer Protocol, the foundation of data communication on the Web."
  },
  {
    "question": "Which planet is closest to the Sun?",
    "options": ["Venus", "Earth", "Mercury", "Mars"],
    "answer": 2,
    "explanation": "Mercury is the closest planet to the Sun at an average distance of about 58 million km."
  },
  {
    "question": "In JavaScript, which keyword declares a block‑scoped variable?",
    "options": ["var", "let", "function", "const and let"],
    "answer": 3,
    "explanation": "Both const and let are block-scoped, while var is function-scoped."
  },
  {
    "question": "What is the chemical symbol for Gold?",
    "options": ["Go", "Gd", "Au", "Ag"],
    "answer": 2,
    "explanation": "Au comes from the Latin word 'Aurum' meaning 'shining dawn'."
  },
  {
    "question": "Which sorting algorithm has O(n log n) average‑case time complexity?",
    "options": ["Bubble Sort", "Merge Sort", "Selection Sort", "Insertion Sort"],
    "answer": 1,
    "explanation": "Merge Sort consistently achieves O(n log n) time by dividing the array in halves."
  },
  {
    "question": "Who painted the Mona Lisa?",
    "options": ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
    "answer": 2,
    "explanation": "Leonardo da Vinci painted the Mona Lisa between 1503 and 1519."
  }
]`;

    // ── File Upload / Drag & Drop ──
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

    // Drag events
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
            return showFeedback("Please upload a .json file.", "error");
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                pendingFileJSON = data;

                // Auto-fill bank name from filename
                const baseName = file.name.replace(/\.json$/i, "").replace(/[_-]/g, " ");
                if (!$("bankNameInput").value.trim()) {
                    $("bankNameInput").value = baseName;
                }

                // Update drop zone to show loaded state
                dropZone.classList.add("file-loaded");
                $("dropZoneHint").innerHTML = `<div class="drop-zone-filename">✅ ${esc(file.name)} (${Array.isArray(data) ? data.length : '?'} questions)</div>`;

                showFeedback(`File loaded! ${Array.isArray(data) ? data.length : 0} questions found. Click Import to add them.`, "success");
            } catch (err) {
                pendingFileJSON = null;
                showFeedback(`Invalid JSON file: ${err.message}`, "error");
            }
        };
        reader.readAsText(file);
    }

    // ── Load Sample ──
    $("loadSampleBtn").addEventListener("click", () => {
        pendingFileJSON = JSON.parse(sampleJSON);
        $("bankNameInput").value = "Sample Quiz";
        dropZone.classList.add("file-loaded");
        $("dropZoneHint").innerHTML = `<div class="drop-zone-filename">✅ Sample data (8 questions)</div>`;
        showFeedback("Sample loaded! Click Import to add it.", "success");
    });

    // ── Import Button (handles both file upload and paste) ──
    $("importBtn").addEventListener("click", () => {
        const name = $("bankNameInput").value.trim();
        if (!name) return showFeedback("Please enter a bank name.", "error");

        // Determine source: file upload takes priority, then textarea
        let data = pendingFileJSON;
        if (!data) {
            const raw = $("jsonInput").value.trim();
            if (!raw) return showFeedback("Please upload a JSON file or paste JSON data.", "error");
            try {
                data = JSON.parse(raw);
            } catch (e) {
                return showFeedback(`Invalid JSON: ${e.message}`, "error");
            }
        }

        if (!Array.isArray(data) || data.length === 0) {
            return showFeedback("JSON must be a non‑empty array of question objects.", "error");
        }

        // Validate each question
        const errors = [];
        data.forEach((q, i) => {
            if (!q.question) errors.push(`Q${i + 1}: missing "question" field`);
            if (!Array.isArray(q.options) || q.options.length < 2)
                errors.push(`Q${}: "options" must be an array of at least 2 items`);
            if (typeof q.answer !== "number" || q.answer < 0 || q.answer >= (q.options?.length ?? 0))
                errors.push(`Q${i}: "answer" must be a valid index (0-based)`);
        });
        if (errors.length > 0) {
            return showFeedback("Validation errors:\n• " + errors.slice(0, 5).join("\n• ") + (errors.length > 5 ? `\n…and ${errors.length - 5} more` : ""), "error");
        }

        // Save
        banks.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name,
            questions: data,
            createdAt: new Date().toISOString(),
        });
        saveBanks();

        showFeedback(`✅ Successfully imported ${data.length} question${data.length > 1 ? "s" : ""} into "${name}"!`, "success");

        // Reset form
        $("bankNameInput").value = "";
        $("jsonInput").value = "";
        pendingFileJSON = null;
        fileInput.value = "";
        dropZone.classList.remove("file-loaded");
        $("dropZoneHint").textContent = "Accepted: .json files";
    });

    function showFeedback(msg, type) {
        const fb = $("importFeedback");
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
                    <button class="btn btn-primary btn-sm start-btn" data-idx="${i}">▶ Start</button>
                    <button class="btn btn-danger btn-sm delete-btn" data-idx="${i}">🗑 Delete</button>
                </div>
            </div>`
            )
            .join("");

        list.querySelectorAll(".start-btn").forEach((b) =>
            b.addEventListener("click", () => startQuiz(+b.dataset.idx))
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
    function startQuiz(bankIdx) {
        const bank = banks[bankIdx];
        if (!bank) return;

        // Shuffle questions
        const shuffled = [...bank.questions].sort(() => Math.random() - 0.5);

        currentQuiz = {
            bankId: bank.id,
            bankName: bank.name,
            questions: shuffled,
            answers: new Array(shuffled.length).fill(null), // null = unanswered
            currentIdx: 0,
        };

        showView("quiz");
        $("quizTitle").textContent = bank.name;
        $("quizTotal").textContent = shuffled.length;
        renderQuestion();
    }

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
        renderQuestion(); // re-render to show correct/wrong
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
            renderHome();
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

        // Update UI
        $("statCorrect").textContent = correct;
        $("statWrong").textContent = wrong;
        $("statSkipped").textContent = skipped;
        $("scoreLabel").textContent = pct + "%";

        // Icon/title based on score
        if (pct >= 80) {
            $("resultsIcon").textContent = "🎉";
            $("resultsTitle").textContent = "Excellent!";
        } else if (pct >= 50) {
            $("resultsIcon").textContent = "👍";
            $("resultsTitle").textContent = "Good Effort!";
        } else {
            $("resultsIcon").textContent = "💪";
            $("resultsTitle").textContent = "Keep Practicing!";
        }

        // Animate score ring
        showView("results");
        const circumference = 2 * Math.PI * 52; // r=52
        const offset = circumference - (pct / 100) * circumference;
        const fill = $("scoreRingFill");
        fill.style.strokeDasharray = circumference;
        fill.style.strokeDashoffset = circumference;
        // Set color based on score
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
        const bankIdx = banks.findIndex((b) => b.id === currentQuiz.bankId);
        if (bankIdx >= 0) startQuiz(bankIdx);
    });

    $("reviewBtn").addEventListener("click", showReview);

    $("goHomeBtn").addEventListener("click", () => {
        showView("home");
        renderHome();
    });

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
                    ${q.explanation ? `<div class="review-explanation">💡 ${esc(q.explanation)}</div>` : ""}
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

    // ───── Init ─────
    renderHome();
})();

