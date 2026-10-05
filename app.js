const form = document.querySelector("#prediction-form");
const submitButton = form.querySelector("button[type='submit']");
const resultPanel = document.querySelector(".result-panel");
const resultValue = document.querySelector("#result-value");
const scoreGauge = document.querySelector("#score-gauge");
const gaugeProgress = document.querySelector("#gauge-progress");
const resultMessage = document.querySelector("#result-message");
const resultState = document.querySelector("#result-state");
const apiStatus = document.querySelector("#api-status");
const apiConnection = document.querySelector("#api-connection");
const apiConnectionLabel = document.querySelector("#api-connection-label");
const completionCount = document.querySelector("#completion-count");
const completionProgress = document.querySelector("#completion-progress");
const completionBar = document.querySelector("#completion-bar");
const resetButton = form.querySelector("button[type='reset']");
const requiredFields = [...form.querySelectorAll("[required]")];
const apiBaseUrl = "https://mental-health-score-6n5n.onrender.com";
const themeToggle = document.querySelector("#theme-toggle");
const scoreScaleMaximum = 10;

function setGaugeScore(score) {
  const boundedScore = Math.min(Math.max(score, 0), scoreScaleMaximum);
  const progress = (boundedScore / scoreScaleMaximum) * 100;
  gaugeProgress.style.strokeDashoffset = String(100 - progress);
  scoreGauge.setAttribute("aria-valuenow", boundedScore.toFixed(2));
  scoreGauge.setAttribute("aria-valuetext", `${score.toFixed(2)} out of 10`);
}

function resetGauge() {
  gaugeProgress.style.strokeDashoffset = "100";
  scoreGauge.removeAttribute("aria-valuenow");
  scoreGauge.setAttribute("aria-valuetext", "No prediction yet");
}

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  themeToggle.checked = isDark;
}

function getSavedTheme() {
  try {
    return localStorage.getItem("student-wellbeing-theme");
  } catch {
    return null;
  }
}

setTheme(getSavedTheme() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

themeToggle.addEventListener("change", () => {
  const theme = themeToggle.checked ? "dark" : "light";
  setTheme(theme);
  try {
    localStorage.setItem("student-wellbeing-theme", theme);
  } catch {
    return;
  }
});

function setStatus(message, state = "") {
  apiStatus.dataset.state = state;
  apiStatus.querySelector("span:last-child").textContent = message;
}

function setConnectionState(message, state) {
  apiConnection.dataset.state = state;
  apiConnectionLabel.textContent = message;
}

function isFieldComplete(field) {
  return field.value.trim() !== "" && field.validity.valid;
}

function updateCompletion() {
  const completed = requiredFields.filter(isFieldComplete).length;
  const total = requiredFields.length;

  completionCount.textContent = `${completed} of ${total} complete`;
  completionProgress.setAttribute("aria-valuemax", String(total));
  completionProgress.setAttribute("aria-valuenow", String(completed));
  completionBar.style.width = `${(completed / total) * 100}%`;

  for (const field of requiredFields) {
    const fieldLabel = field.closest(".field");
    fieldLabel.dataset.complete = String(isFieldComplete(field));
  }

  for (const fieldset of form.querySelectorAll("fieldset")) {
    const sectionFields = [...fieldset.querySelectorAll("[required]")];
    fieldset.dataset.complete = String(sectionFields.every(isFieldComplete));
  }
}

async function checkApiConnection() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2500);
  setConnectionState("CHECKING API", "checking");

  try {
    const response = await fetch(`${apiBaseUrl}/`, { signal: controller.signal });
    if (!response.ok) throw new Error("API unavailable");
    setConnectionState("API ONLINE", "online");
  } catch {
    setConnectionState("API OFFLINE", "offline");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

form.addEventListener("input", updateCompletion);
form.addEventListener("change", updateCompletion);
form.addEventListener("focusout", (event) => {
  const field = event.target.closest(".field");
  if (field) field.dataset.touched = "true";
});

form.addEventListener("reset", () => {
  window.setTimeout(() => {
    for (const field of form.querySelectorAll(".field")) {
      delete field.dataset.touched;
    }
    updateCompletion();
    resultValue.textContent = "--";
    resetGauge();
    resultMessage.textContent = "Complete the profile and run a prediction to see the model output.";
    resultPanel.classList.remove("has-result");
    resultPanel.classList.remove("is-loading");
    resultState.dataset.state = "idle";
    resultState.textContent = "AWAITING INPUT";
    setStatus("Waiting for request");
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) {
    for (const field of requiredFields) {
      if (!isFieldComplete(field)) field.closest(".field").dataset.touched = "true";
    }
    updateCompletion();
    return;
  }

  const values = Object.fromEntries(new FormData(form).entries());
  const payload = {
    age: Number(values.age),
    gender: values.gender,
    country: values.country.trim(),
    academic_level: values.academic_level,
    most_used_platform: values.most_used_platform,
    purpose_of_use: values.purpose_of_use,
    avg_daily_usage_hours: Number(values.avg_daily_usage_hours),
    daily_unlocks: Number(values.daily_unlocks),
    study_hours: Number(values.study_hours),
    physical_activity_hours: Number(values.physical_activity_hours),
    sleep_hours_per_night: Number(values.sleep_hours_per_night),
    stress_level: values.stress_level,
  };

  submitButton.disabled = true;
  resetButton.disabled = true;
  submitButton.querySelector("span").textContent = "Generating...";
  resultValue.textContent = "--";
  resetGauge();
  resultPanel.classList.remove("has-result");
  resultPanel.classList.add("is-loading");
  resultState.dataset.state = "loading";
  resultState.textContent = "ANALYZING";
  setStatus("Sending your details to the prediction API", "loading");
  setConnectionState("REQUEST IN PROGRESS", "checking");
  resultMessage.textContent = "Waiting for the model response...";

  try {
    const response = await fetch(`${apiBaseUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((issue) => `${issue.loc?.at(-1) ?? "Field"}: ${issue.msg}`).join("; ")
        : data.detail || "The API could not process these details.";
      throw new Error(detail);
    }

    const score = Number(data.predicted_mental_health_score);
    if (!Number.isFinite(score)) throw new Error("The API returned an invalid score.");

    resultValue.textContent = score.toFixed(2);
    setGaugeScore(score);
    resultMessage.textContent = "This is the model's predicted score for the details you entered.";
    resultPanel.classList.remove("is-loading");
    resultPanel.classList.add("has-result");
    resultState.dataset.state = "success";
    resultState.textContent = "PREDICTION READY";
    setStatus("Prediction received", "success");
    setConnectionState("API ONLINE", "online");
  } catch (error) {
    resultValue.textContent = "--";
    resetGauge();
    resultPanel.classList.remove("is-loading", "has-result");
    resultState.dataset.state = "error";
    resultState.textContent = "PREDICTION FAILED";
    resultMessage.textContent = error instanceof TypeError
      ? "Could not reach the API. Start it with: python -m uvicorn main:app --reload"
      : error.message;
    setStatus("Could not get a prediction", "error");
    if (error instanceof TypeError) setConnectionState("API OFFLINE", "offline");
  } finally {
    submitButton.disabled = false;
    resetButton.disabled = false;
    submitButton.querySelector("span").textContent = "Generate prediction";
  }
});

updateCompletion();
checkApiConnection();