const API_BASE = "http://localhost:8000";

async function loadProgress() {
  const res = await fetch(`${API_BASE}/api/progress?days=30`);
  const data = await res.json();

  renderStatCards(data);
  renderChart(data);
}

function renderStatCards(data) {
  const totalErrors = data.reduce((s, d) => s + (d.total_errors || 0), 0);
  const totalHelp = data.reduce((s, d) => s + (d.total_help || 0), 0);
  const totalReps = data.reduce((s, d) => s + (d.total_repetitions || 0), 0);
  const totalSessions = data.reduce((s, d) => s + (d.sessions || 0), 0);
  const totalVocab = data.reduce((s, d) => s + (d.total_new_vocab || 0), 0);

  const cards = [
    { num: totalSessions, label: "Sessions" },
    { num: totalErrors, label: "Corrections made" },
    { num: totalHelp, label: "Times help needed" },
    { num: totalReps, label: "Repetitions needed" },
    { num: totalVocab, label: "New words learned" },
  ];

  const container = document.getElementById("statCards");
  container.innerHTML = "";
  cards.forEach(c => {
    const div = document.createElement("div");
    div.className = "stat-card";
    div.innerHTML = `<div class="num">${c.num}</div><div class="label">${c.label}</div>`;
    container.appendChild(div);
  });
}

function renderChart(data) {
  const labels = data.map(d => d.date);
  const errors = data.map(d => d.total_errors || 0);
  const help = data.map(d => d.total_help || 0);
  const reps = data.map(d => d.total_repetitions || 0);
  const vocab = data.map(d => d.total_new_vocab || 0);

  const ctx = document.getElementById("progressChart").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Errors", data: errors, borderColor: "#ff6b6b", tension: 0.3 },
        { label: "Help needed", data: help, borderColor: "#ff9d5b", tension: 0.3 },
        { label: "Repetitions", data: reps, borderColor: "#5b8cff", tension: 0.3 },
        { label: "New vocab", data: vocab, borderColor: "#5bd68b", tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#e8e9ec" } } },
      scales: {
        x: { ticks: { color: "#9aa0ab" }, grid: { color: "#333844" } },
        y: { ticks: { color: "#9aa0ab" }, grid: { color: "#333844" }, beginAtZero: true },
      },
    },
  });
}

loadProgress();
