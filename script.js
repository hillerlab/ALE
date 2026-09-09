/* =======================================================
   ROUTER — shows/hides the three "pages" based on the
   URL hash: #/  #/search  #/species?name=XXX
   ======================================================= */

// ---- TEMPORARY SWITCH -------------------------------------------------
// Set to true to re-enable all downloads (main TSV, search table,
// source-comparison table) once you're ready to launch.
const DOWNLOADS_ENABLED = true;
// -------------------------------------------------------------------

// ---- COLUMNS TO HIDE FROM THE SITE ENTIRELY ---------------------------
// Any header matching one of these names (case-insensitive) is stripped
// out of every row before the data is displayed or downloaded.
// Note: "Curated_max_source" currently appears twice in the sheet
// (looks like a duplicate column in the source data) - both get removed.
const EXCLUDED_COLUMNS = ["curated_max_source"];

function stripExcludedColumns(rows) {
  if (!rows.length) return rows;
  const header = rows[0].map(h => (h || "").trim().toLowerCase());
  const dropIdx = new Set();
  EXCLUDED_COLUMNS.forEach(name => {
    header.forEach((h, i) => {
      if (h === name) dropIdx.add(i);
    });
  });
  if (dropIdx.size === 0) return rows;
  return rows.map(row => row.filter((_, i) => !dropIdx.has(i)));
}
// -------------------------------------------------------------------

let chartInstance = null;
let homeChartLoaded = false;
let searchLoaded = false;

function parseHash() {
  // hash looks like: #/species?name=Homo%20sapiens
  let hash = window.location.hash || "#/";
  hash = hash.replace(/^#/, "");
  const [path, queryString] = hash.split("?");
  const params = new URLSearchParams(queryString || "");
  return { path: path || "/", params };
}

function router() {
  const { path, params } = parseHash();

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));

  if (path === "/" || path === "") {
    document.getElementById("page-home").classList.add("active");
    if (!homeChartLoaded) {
      homeChartLoaded = true;
      loadHomeChart();
    }
  } else if (path === "/search") {
    document.getElementById("page-search").classList.add("active");
    if (!searchLoaded) {
      searchLoaded = true;
      loadSearchPage();
    }
  } else if (path === "/new-metrics") {
    document.getElementById("page-new-metrics").classList.add("active");
  } else if (path === "/citation") {
    document.getElementById("page-citation").classList.add("active");
    renderCitationSources();
  } else if (path === "/contributions") {
  document.getElementById("page-contributions").classList.add("active");
  renderCitationSources();
  } else if (path === "/species") {
    document.getElementById("page-species").classList.add("active");
    loadSpeciesPage(params.get("name"));
  } else {
    document.getElementById("page-home").classList.add("active");
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);

/* =======================================================
   HOME PAGE LOGIC
   ======================================================= */
function loadHomeChart() {
  fetch("https://raw.githubusercontent.com/hillerlab/ALE/main/ALE.tsv")
    .then(r => r.text())
    .then(data => {

      Chart.register(window.ChartZoom || window['chartjs-plugin-zoom']);
      const rows = data.trim().split(/\r?\n/).map(r => r.split("\t").map(c => c.trim()));
      const headers = rows[0];
      const iSpecies = headers.indexOf("Species");
      const iMass = headers.indexOf("Mass_(g)");
      const iFinal = headers.indexOf("Curated_max");
      const iHigh = headers.indexOf("Highest_max");

      let grey = [];
      let blue = [];
      let orange = [];
      let lines = [];

      for (let i = 1; i < rows.length; i++) {

        let r = rows[i];

        let species = r[iSpecies];
        let mass = Number(r[iMass]);
        let finalVal = Number(r[iFinal]);
        let highVal = Number(r[iHigh]);

        if (
          !species ||
          !Number.isFinite(mass) ||
          !Number.isFinite(finalVal) ||
          !Number.isFinite(highVal)
        ) continue;

        if (mass <= 0 || finalVal <= 0 || highVal <= 0) continue;

        let x = Math.log10(mass);
        let yF = Math.log10(finalVal);
        let yH = Math.log10(highVal);

        if (finalVal === highVal) {
          grey.push({ x, y: yF, label: species, final: finalVal, high: highVal });
        } else {
          blue.push({ x, y: yF, label: species, final: finalVal, high: highVal });
          orange.push({ x, y: yH, label: species, final: finalVal, high: highVal });

          lines.push([{ x, y: yF }, { x, y: yH }]);
        }
      }

      const xs = blue.map(p => p.x).concat(orange.map(p => p.x)).concat(grey.map(p => p.x));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);

      const regressionData = [
        { x: minX, y: 0.18 * minX + 0.546 },
        { x: maxX, y: 0.18 * maxX + 0.546 }
      ];

      chartInstance = new Chart(document.getElementById("myChart"), {
        type: "scatter",

        data: {
          datasets: [
            { label: "Curated", data: blue, backgroundColor: "blue", pointRadius: 4 },
            { label: "Highest_max", data: orange, backgroundColor: "orange", pointRadius: 4 },
            { label: "Unchanged", data: grey, backgroundColor: "grey", pointRadius: 4 },

            {
              label: "Regression",
              type: "line",
              data: regressionData,
              borderColor: "red",
              borderWidth: 2,
              pointRadius: 0,
              fill: false
            },

            ...lines.map(l => ({
              type: "line",
              data: l,
              label: "",
              borderColor: "black",
              borderWidth: 1,
              pointRadius: 0
            }))
          ]
        },

        options: {
          responsive: true,

          plugins: {
            tooltip: {
              callbacks: {
                label: (tooltipItem) => {
                  const point = tooltipItem.dataset.data[tooltipItem.dataIndex];
                  const species = point.label || "";
                  const finalVal = point.final ? point.final.toFixed(2) : "";
                  const highVal = point.high ? point.high.toFixed(2) : "";

                  return [
                    `Species: ${species}`,
                    `Curated_max: ${finalVal}`,
                    `Highest_max: ${highVal}`
                  ];
                }
              }
            },
            legend: {
              labels: {
                generateLabels: (chart) => {
                  const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                  return labels.filter(
                    item => chart.data.datasets[item.datasetIndex].type !== "line"
                  );
                }
              }
            },
            zoom: {
              pan: {
                enabled: true,
                mode: "xy",
                threshold: 0,
                modifierKey: null
              },
              zoom: {
                wheel: { enabled: true },
                pinch: { enabled: true },
                drag: { enabled: false },
                mode: "xy",
              },
              limits: {
                x: { min: "original", max: "original" },
                y: { min: "original", max: "original" }
               }
            }
          },

          scales: {
            x: {
              type: "linear",
              title: { display: true, text: "log10(Mass)" },
              grid: { display: false }
            },
            y: {
              type: "linear",
              title: { display: true, text: "log10(Lifespan)" },
              grid: { display: false }
            }
          }
        }
      });

      document.getElementById("myChart").onclick = (event) => {
        const elements = chartInstance.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false);
        if (elements.length > 0) {
          const el = elements[0];
          const dataset = chartInstance.data.datasets[el.datasetIndex];
          const point = dataset.data[el.index];
          if (point && point.label) {
            window.location.hash = `#/species?name=${encodeURIComponent(point.label)}`;
          }
        }
      };

      document.getElementById("myChart").style.cursor = "pointer";
    });
}

document.getElementById("downloadBtn").addEventListener("click", (e) => {
  e.preventDefault();

  if (!DOWNLOADS_ENABLED) {
    showToast("Downloads are temporarily disabled");
    return;
  }

  fetch("https://raw.githubusercontent.com/hillerlab/ALE/main/ALE.tsv")
    .then(res => res.text())
    .then(data => {
      const rows = stripExcludedColumns(data.trim().split(/\r?\n/).map(r => r.split("\t")));
      const cleaned = rows.map(r => r.join("\t")).join("\n");
      const blob = new Blob([cleaned], { type: "text/tab-separated-values;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "ale-data.tsv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })
    .catch(err => {
      alert("Could not download the file.");
    });
});
function copyCitation() {
  const citationElement = document.getElementById("citationText");
  const citation = citationElement
    ? citationElement.textContent.trim()
    : "Aggregate Lifespan Encyclopedia (ALE)";

  navigator.clipboard.writeText(citation)
    .then(() => {
      showToast("Copied to clipboard");
    })
    .catch(() => {
      showToast("Failed to copy");
    });
}

// TODO: replace this with the published TSV link for the source-comparison table
// (columns for each collected data source, with each source's lifespan value).
const SOURCE_TABLE_TSV_URL = "REPLACE_WITH_SOURCE_TABLE_TSV_URL";

function downloadSourceTable() {
  if (!DOWNLOADS_ENABLED) {
    showToast("Downloads are temporarily disabled");
    return;
  }

  if (!SOURCE_TABLE_TSV_URL || SOURCE_TABLE_TSV_URL.startsWith("REPLACE_")) {
    showToast("Source table link not set up yet");
    return;
  }

  fetch(SOURCE_TABLE_TSV_URL)
    .then(res => res.text())
    .then(data => {
      const blob = new Blob([data], { type: "text/tab-separated-values;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "ale-source-comparison.tsv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    })
    .catch(err => {
      alert("Could not download the file.");
    });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;

  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000); // fades out after 2s
}

/* =======================================================
   CITATION PAGE — SOURCE / CONTRIBUTOR LIST
   Built from db_titles_links.csv (Author;Source;Link).
   Rendered as "Author. Title" with Title hyperlinked to
   the link from the last column.
   ======================================================= */
const SHEET_CSV_URL = "https://raw.githubusercontent.com/hillerlab/ALE/main/ALE_contributors.csv";

async function renderCitationSources() {
  const list = document.getElementById("citationSourcesList");
  if (!list) return;

  list.innerHTML = "<li>Loading sources…</li>";

  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const csvText = await res.text();
    const rows = parseTSV(csvText);

    list.innerHTML = "";

    // Skip header row
    rows.slice(1).forEach(([author, title, link]) => {
      if (!title) return; // skip blank rows
      const li = document.createElement("li");

      if (author) {
        li.appendChild(document.createTextNode(author + ". "));
      }

      if (link) {
        const a = document.createElement("a");
        a.href = link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = title;
        li.appendChild(a);
      } else {
        li.appendChild(document.createTextNode(title));
      }

      list.appendChild(li);
    });
  } catch (err) {
    console.error("Failed to load citations:", err);
    list.innerHTML = "<li>Unable to load sources right now.</li>";
  }
}

// Minimal CSV parser that handles quoted fields with commas inside them
function parseTSV(text) {
  return text
    .split(/\r?\n/)
    .filter(line => line.length > 0)
    .map(line => line.split(";"));
}

/* =======================================================
   SEARCH PAGE LOGIC
   ======================================================= */
let fullData = [];
let filteredDataGlobal = [];
const TAXID_COLUMN = 2;
let sortColumn = null;
let sortDirection = 1; // 1 = ascending, -1 = descending

function loadSearchPage() {
  fetch("https://raw.githubusercontent.com/hillerlab/ALE/main/ALE.tsv")
    .then(res => res.text())
    .then(data => {
      let rows = data.trim().split("\n").map(r => r.split("\t"));
      rows = stripExcludedColumns(rows);
      fullData = rows;
      filteredDataGlobal = rows;
      renderTable(rows);
    })
    .catch(err => {
      document.getElementById("myTable").innerHTML = `<tr><td style="color: red; text-align: center;">Error streaming dataset resources.</td></tr>`;
    });
}

function sortRows(rows, col, dir) {
  // Keep header row (index 0) fixed, sort the rest.
  const header = rows[0];
  const body = rows.slice(1);

  body.sort((a, b) => {
    const rawA = (a[col] || "").trim();
    const rawB = (b[col] || "").trim();

    const numA = parseFloat(rawA.replace(/,/g, ""));
    const numB = parseFloat(rawB.replace(/,/g, ""));

    const bothNumeric = rawA !== "" && rawB !== "" && Number.isFinite(numA) && Number.isFinite(numB);

    if (bothNumeric) {
      return (numA - numB) * dir;
    }

    return rawA.toUpperCase().localeCompare(rawB.toUpperCase()) * dir;
  });

  return [header, ...body];
}

function renderTable(rows) {
  const table = document.getElementById("myTable");
  table.innerHTML = "";

  // Find the index of the Notes_on_missing_life_history column by header name
  const notesIdx = rows[0]
    ? rows[0].findIndex(h => (h || "").trim().toLowerCase() === "notes_on_missing_life_history")
    : -1;

  rows.forEach((row, i) => {
    const tr = document.createElement("tr");

    row.forEach((cell, j) => {
      const el = document.createElement(i === 0 ? "th" : "td");
      
      if (j === 0 || j === 1 || j === TAXID_COLUMN) {
        el.classList.add("frozen-col");
        if (j === TAXID_COLUMN) el.classList.add("frozen-col-last");
      }
      if (i === 0) {
        el.style.cursor = "pointer";
        el.style.userSelect = "none";
        el.title = "Click to sort";

        const label = document.createElement("span");
        label.textContent = cell;

        const arrow = document.createElement("span");
        arrow.style.marginLeft = "6px";
        arrow.style.opacity = "0.5";
        if (sortColumn === j) {
          arrow.textContent = sortDirection === 1 ? "▲" : "▼";
          arrow.style.opacity = "1";
        } else {
          arrow.textContent = "↕";
        }

        el.appendChild(label);
        el.appendChild(arrow);

        el.addEventListener("click", () => {
          if (sortColumn === j) {
            sortDirection = sortDirection * -1;
          } else {
            sortColumn = j;
            sortDirection = 1;
          }

          filteredDataGlobal = sortRows(filteredDataGlobal, sortColumn, sortDirection);
          renderTable(filteredDataGlobal);
        });
      } else if (i > 0 && j === 0) {
        const wrapper = document.createElement("div");
        wrapper.className = "col0-scroll";
        wrapper.textContent = cell;
        el.appendChild(wrapper); 
      } else if (i > 0 && j === 1) {
        const link = document.createElement("a");
        const queryName = encodeURIComponent(cell.trim());
        link.href = "#/species?name=" + queryName;
        link.textContent = cell;
        el.appendChild(link);
      } else if (i > 0 && j === TAXID_COLUMN) {
        const taxid = cell.trim();
        if (taxid) {
          const link = document.createElement("a");
          link.href = "https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?searchTerm=" +
            encodeURIComponent(taxid) +
            "&searchMode=complete+name&lock=1&unlock=1&command=search";
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = taxid;
          el.appendChild(link);
        } else {
          el.textContent = cell;
        }
      } else if (i > 0 && j === notesIdx && notesIdx !== -1) {
        const wrapper = document.createElement("div");
        wrapper.className = "col0-scroll";
        wrapper.textContent = cell;
        el.appendChild(wrapper);
      } else {
        el.textContent = cell;
      }

      tr.appendChild(el);
    });

    table.appendChild(tr);
  });
  applyFrozenColumnOffsets();
}

function applyFrozenColumnOffsets() {
  const table = document.getElementById("myTable");
  if (!table.rows.length) return;

  const headerCells = Array.from(table.rows[0].cells);
  const frozenIdx = [0, 1, TAXID_COLUMN];

  // cumulative left offset for each frozen column, based on rendered widths
  let cumulative = 0;
  const lefts = {};
  frozenIdx.forEach(j => {
    lefts[j] = cumulative;
    const w = headerCells[j] ? headerCells[j].getBoundingClientRect().width : 0;
    cumulative += w;
  });

  Array.from(table.rows).forEach(row => {
    frozenIdx.forEach(j => {
      const cell = row.cells[j];
      if (cell) cell.style.left = lefts[j] + "px";
    });
  });
}


function myFunction() {
  const input = document.getElementById("myInput").value.toUpperCase();

  const filtered = fullData.filter((row, i) => {
    if (i === 0) return true;

    return [0, 1, 3].some(c =>
      row[c] && row[c].toUpperCase().includes(input)
    );
  });

  filteredDataGlobal = filtered;
  renderTable(filtered);
}

function downloadTable() {
  if (!DOWNLOADS_ENABLED) {
    showToast("Downloads are temporarily disabled");
    return;
  }

  if (filteredDataGlobal.length <= 1) {
    alert("No active data entries matching your filter parameters are available to isolate.");
    return;
  }
  let text = filteredDataGlobal.map(r => r.join("\t")).join("\n");

  let blob = new Blob([text], { type: "text/tab-separated-values" });
  let a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ale_filtered_data.tsv";
  a.click();
}

/* =======================================================
   SPECIES PAGE LOGIC
   ======================================================= */
function loadSpeciesPage(speciesQuery) {
  document.getElementById("speciesName").textContent = "Loading...";
  document.getElementById("commonName").textContent = "—";
  document.getElementById("max").textContent = "—";
  document.getElementById("q90").textContent = "—";
  document.getElementById("e90").textContent = "—";
  document.getElementById("highest_max").textContent = "—";
  document.getElementById("taxidLink").textContent = "—";
  document.getElementById("taxidLink").removeAttribute("href");
  document.getElementById("wikiImage").removeAttribute("src");
  document.getElementById("wikiImageContainer").style.display = "none";
  document.querySelectorAll("#page-species .graph-container")[1].style.display = "";

  fetch("https://raw.githubusercontent.com/hillerlab/ALE/main/ALE.tsv")
    .then(r => r.text())
    .then(data => {
      const rows = data.trim().split("\n").map(r => r.split("\t"));
      const headers = rows[0].map(h => h.trim().toLowerCase());
      const iMax = headers.indexOf("curated_max");

      const iSpecies = headers.indexOf("species");
      const iCommon = headers.indexOf("common_name");
      const iQ90 = headers.indexOf("curated_q90");
      const iE90 = headers.indexOf("curated_e90");
      const iGraph = headers.indexOf("graph_url");
      const iHighestMax = headers.indexOf("highest_max");
      const iTaxid = headers.indexOf("taxid");

      const normalize = (s) => (s || "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
      const target = normalize(speciesQuery);
      const row = rows.find(r => normalize(r[iSpecies]) === target);

      if (!row) {
        document.getElementById("speciesName").textContent = "Species not found";
        document.getElementById("commonName").textContent = `No record matching "${speciesQuery}" in this dataset.`;
        document.querySelector("#page-species .metrics-grid").style.display = "none";
        document.getElementById("wikiImageContainer").style.display = "none";
        document.querySelectorAll("#page-species .graph-container")[1].style.display = "none";
        return;
      }

      document.title = row[iSpecies] + " – ALE";
      document.getElementById("speciesName").textContent = row[iSpecies];
      document.getElementById("commonName").textContent = (iCommon !== -1 && row[iCommon]) ? row[iCommon] : "N/A";
      document.querySelector("#page-species .metrics-grid").style.display = "";

      const wikiName = row[iSpecies].trim().replace(/\s+/g, "_");
      document.getElementById("wikiLink").href =
        `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiName)}`;

      const taxid = iTaxid !== -1 && row[iTaxid] ? row[iTaxid].trim() : "";
      const taxidLink = document.getElementById("taxidLink");
      if (taxid) {
        taxidLink.textContent = taxid;
        taxidLink.href =
          "https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?searchTerm=" +
          encodeURIComponent(taxid) +
          "&searchMode=complete+name&lock=1&unlock=1&command=search";
      } else {
        taxidLink.textContent = "N/A";
        taxidLink.removeAttribute("href");
      }

      document.getElementById("max").textContent = iMax !== -1 && row[iMax] ? parseFloat(row[iMax]).toFixed(1) : "N/A";
      document.getElementById("q90").textContent = iQ90 !== -1 && row[iQ90] ? parseFloat(row[iQ90]).toFixed(1) : "N/A";
      document.getElementById("e90").textContent = iE90 !== -1 && row[iE90] ? parseFloat(row[iE90]).toFixed(1) : "N/A";
      document.getElementById("highest_max").textContent = iHighestMax !== -1 && row[iHighestMax] ? parseFloat(row[iHighestMax]).toFixed(1) : "N/A";

      fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiName)}&prop=pageimages&format=json&pithumbsize=600&origin=*`
      )
        .then(r => r.json())
        .then(data => {
          const pages = data?.query?.pages || {};
          const page = Object.values(pages)[0];
          const img = page?.thumbnail?.source;

          const wikiImage = document.getElementById("wikiImage");
          const wikiImageContainer = document.getElementById("wikiImageContainer");

          if (img) {
            wikiImage.src = img;
            wikiImageContainer.style.display = "block";
          } else {
            wikiImageContainer.style.display = "none";
          }
        })
        .catch(() => {
          document.getElementById("wikiImageContainer").style.display = "none";
        });

       // ---- Lifespan distribution PNG, pulled from the ALE_pdf GitHub repo ----
      const pngUrl = `https://raw.githubusercontent.com/hiller_lab/ALE/main/ALE_pngs/ALE_${wikiName}.png`;
      const graphContainer = document.getElementById("speciesGraphContainer");
      const graphImg = document.getElementById("speciesGraph");

      graphImg.onload = () => { graphContainer.style.display = ""; };
      graphImg.onerror = () => { graphContainer.style.display = "none"; };
      graphImg.src = pngUrl;
    });
}
