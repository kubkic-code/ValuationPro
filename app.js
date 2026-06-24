// ==========================================
//  VALUATION PRO — app.js
// ==========================================

// --- Stav aplikace ---
let selectedStocks = [];
try {
    selectedStocks = JSON.parse(localStorage.getItem('valpro_stocks')) || [];
} catch(e) {
    selectedStocks = [];
}

let activeStockTicker = null;
let isDarkMode = localStorage.getItem('valpro_theme') !== 'light';

// Globální výchozí hodnoty
let DEFAULT_WACC     = parseFloat(localStorage.getItem('valpro_wacc'))     || 10;
let DEFAULT_TERMINAL = parseFloat(localStorage.getItem('valpro_terminal')) || 2.5;
let DEFAULT_MARGIN   = parseFloat(localStorage.getItem('valpro_margin'))   || 20;

// ==========================================
//  DOM ELEMENTY
// ==========================================
const portfolioListEl  = document.getElementById('portfolioList');
const historyListEl    = document.getElementById('historyList');
const portfolioCountEl = document.getElementById('portfolioCount');
const searchInput      = document.getElementById('searchInput');
const searchSuggestions = document.getElementById('searchSuggestions');
const themeToggleBtn   = document.getElementById('themeToggleBtn');
const dataTableBody    = document.getElementById('dataTableBody');
const exportBtn        = document.getElementById('exportBtn');

// Detail panel
const detailPanel         = document.getElementById('stockDetailPanel');
const detailTicker        = document.getElementById('detailTicker');
const btnTogglePortfolio  = document.getElementById('btnTogglePortfolio');
const detailName          = document.getElementById('detailName');
const btnRename           = document.getElementById('btnRename');
const detailPrice         = document.getElementById('detailPrice');
const detailReportDate    = document.getElementById('detailReportDate');

// Modely
const detailDcfValue    = document.getElementById('detailDcfValue');
const detailDcfSafe     = document.getElementById('detailDcfSafe');
const detailDcfStatus   = document.getElementById('detailDcfStatus');
const detailGrahamValue  = document.getElementById('detailGrahamValue');
const detailGrahamSafe   = document.getElementById('detailGrahamSafe');
const detailGrahamStatus = document.getElementById('detailGrahamStatus');
const detailLynchValue   = document.getElementById('detailLynchValue');
const detailLynchSafe    = document.getElementById('detailLynchSafe');
const detailLynchStatus  = document.getElementById('detailLynchStatus');
const detailDdmValue     = document.getElementById('detailDdmValue');
const detailDdmSafe      = document.getElementById('detailDdmSafe');
const detailDdmStatus    = document.getElementById('detailDdmStatus');

// Finanční zdraví
const healthRoe     = document.getElementById('healthRoe');
const healthDebt    = document.getElementById('healthDebt');
const healthPeg     = document.getElementById('healthPeg');
const healthCurrent = document.getElementById('healthCurrent');

// Nastavení modal
const btnSettings      = document.getElementById('btnSettings');
const settingsModal    = document.getElementById('settingsModal');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnCancelSettings = document.getElementById('btnCancelSettings');
const btnSaveSettings  = document.getElementById('btnSaveSettings');
const globalWacc       = document.getElementById('globalWacc');
const globalTerminal   = document.getElementById('globalTerminal');
const globalMargin     = document.getElementById('globalMargin');

// Parametry akcie
const inputFcf           = document.getElementById('inputFcf');
const inputRust1         = document.getElementById('inputRust1');
const inputRust2         = document.getElementById('inputRust2');
const inputWacc          = document.getElementById('inputWacc');
const inputTerminal      = document.getElementById('inputTerminal');
const inputMargin        = document.getElementById('inputMargin');
const btnRecalculateStock = document.getElementById('btnRecalculateStock');
const btnResetStock      = document.getElementById('btnResetStock');

// Scénáře
const btnBear   = document.getElementById('btnBear');
const btnBase   = document.getElementById('btnBase');
const btnBull   = document.getElementById('btnBull');
const btnMinus1 = document.getElementById('btnMinus1');
const btnPlus1  = document.getElementById('btnPlus1');

// Graf
const chartContainer   = document.getElementById('valuationChartContainer');
const chartBarDcf      = document.getElementById('chartBarDcf');
const chartMarkerPrice = document.getElementById('chartMarkerPrice');
const chartLabelDcf    = document.getElementById('chartLabelDcf');
const chartLabelPrice  = document.getElementById('chartLabelPrice');

// ==========================================
//  INICIALIZACE
// ==========================================
function init() {
    applyTheme();

    // Vyhledávání – živý našeptávač
    let searchTimeout = null;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        if (query.length < 2) {
            searchSuggestions.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => fetchSuggestions(query), 300);
    });

    // Vyhledávání – Enter
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const ticker = searchInput.value.trim().toUpperCase();
            if (ticker) {
                searchSuggestions.classList.add('hidden');
                addOrFetchStock(ticker);
                searchInput.value = '';
            }
        }
    });

    // Zavření našeptávače kliknutím mimo
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container') && !e.target.closest('.search-wrapper')) {
            searchSuggestions.classList.add('hidden');
        }
    });

    // Přejmenování akcie
    btnRename.addEventListener('click', () => {
        if (!activeStockTicker) return;
        const stockObj = selectedStocks.find(s => s.ticker === activeStockTicker);
        if (!stockObj || !stockObj.data) return;
        const newName = prompt('Zadejte nový název pro ' + stockObj.ticker + ':', stockObj.data.name);
        if (newName && newName.trim() !== '') {
            stockObj.data.name = newName.trim();
            saveState();
            renderSidebarStocks();
            updateDetailView(activeStockTicker);
        }
    });

    // Přepnutí motivu
    themeToggleBtn.addEventListener('click', toggleTheme);

    // Přidat/odebrat z portfolia (hvězdička)
    btnTogglePortfolio.addEventListener('click', () => {
        if (!activeStockTicker) return;
        const stockObj = selectedStocks.find(s => s.ticker === activeStockTicker);
        if (!stockObj) return;
        stockObj.isPortfolio = !stockObj.isPortfolio;
        saveState();
        renderSidebarStocks();
        updateDetailView(activeStockTicker);
    });

    // Obnovit portfolio
    document.getElementById('analyzeAllBtn').addEventListener('click', async () => {
        const btn = document.getElementById('analyzeAllBtn');
        const portfolioStocks = selectedStocks.filter(s => s.isPortfolio);
        if (portfolioStocks.length === 0) {
            alert('Vaše portfolio je prázdné. Přidejte akcie pomocí hvězdičky ☆ v detailu akcie.');
            return;
        }
        btn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Aktualizuji...';
        btn.disabled = true;
        for (const s of portfolioStocks) {
            await fetchStockData(s.ticker, s.wacc || DEFAULT_WACC, s.terminal || DEFAULT_TERMINAL, s.margin || DEFAULT_MARGIN);
        }
        btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Obnovit Portfolio';
        btn.disabled = false;
    });

    // Přepočítat
    btnRecalculateStock.addEventListener('click', async () => {
        if (!activeStockTicker) return;
        const wacc     = parseFloat(inputWacc.value)     || DEFAULT_WACC;
        const terminal = parseFloat(inputTerminal.value) || DEFAULT_TERMINAL;
        const margin   = parseFloat(inputMargin.value)   || DEFAULT_MARGIN;
        const customFcf   = inputFcf.value   !== '' ? parseFloat(inputFcf.value)   : null;
        const customRust1 = inputRust1.value !== '' ? parseFloat(inputRust1.value) : null;
        const customRust2 = inputRust2.value !== '' ? parseFloat(inputRust2.value) : null;

        btnRecalculateStock.textContent = 'Počítám...';
        btnRecalculateStock.disabled = true;
        await fetchStockData(activeStockTicker, wacc, terminal, margin, customFcf, customRust1, customRust2);
        btnRecalculateStock.textContent = 'Přepočítat';
        btnRecalculateStock.disabled = false;
    });

    // Reset na AI data
    btnResetStock.addEventListener('click', async () => {
        if (!activeStockTicker) return;
        btnResetStock.innerHTML = '<i class="fa-solid fa-rotate-left fa-spin"></i>';
        btnResetStock.disabled = true;

        // Reset inputů na výchozí
        inputWacc.value    = DEFAULT_WACC;
        inputTerminal.value = DEFAULT_TERMINAL;
        inputMargin.value  = DEFAULT_MARGIN;
        inputFcf.value     = '';
        inputRust1.value   = '';
        inputRust2.value   = '';

        await fetchStockData(activeStockTicker, DEFAULT_WACC, DEFAULT_TERMINAL, DEFAULT_MARGIN);

        btnResetStock.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Reset';
        btnResetStock.disabled = false;
        setScenarioActive(btnBase);
    });

    // Scénáře Bear / Base / Bull
    const setScenario = (type) => {
        if (!activeStockTicker) return;
        const stockObj = selectedStocks.find(s => s.ticker === activeStockTicker);
        if (!stockObj || !stockObj.originalData) return;

        setScenarioActive(type === 'bear' ? btnBear : type === 'base' ? btnBase : btnBull);

        let mod = type === 'bear' ? -5 : type === 'bull' ? 5 : 0;
        inputRust1.value = ((stockObj.originalData.rust_1_5 || 0) + mod).toFixed(1);
        inputRust2.value = ((stockObj.originalData.rust_6_10 || 0) + mod).toFixed(1);

        btnRecalculateStock.click();
    };

    btnBear.addEventListener('click', () => setScenario('bear'));
    btnBase.addEventListener('click', () => setScenario('base'));
    btnBull.addEventListener('click', () => setScenario('bull'));

    // ±1% tlačítka
    const adjustGrowth = (amount) => {
        if (!activeStockTicker) return;
        [btnBear, btnBase, btnBull].forEach(b => b.classList.remove('active'));
        inputRust1.value = ((parseFloat(inputRust1.value) || 0) + amount).toFixed(1);
        inputRust2.value = ((parseFloat(inputRust2.value) || 0) + amount).toFixed(1);
        btnRecalculateStock.click();
    };

    btnMinus1.addEventListener('click', () => adjustGrowth(-1));
    btnPlus1.addEventListener('click', () =>  adjustGrowth(1));

    // Nastavení modal
    btnSettings.addEventListener('click', () => {
        globalWacc.value     = DEFAULT_WACC;
        globalTerminal.value = DEFAULT_TERMINAL;
        globalMargin.value   = DEFAULT_MARGIN;
        settingsModal.classList.remove('hidden');
    });

    const closeSettings = () => settingsModal.classList.add('hidden');
    btnCloseSettings.addEventListener('click', closeSettings);
    btnCancelSettings.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });

    btnSaveSettings.addEventListener('click', () => {
        DEFAULT_WACC     = parseFloat(globalWacc.value)     || 10;
        DEFAULT_TERMINAL = parseFloat(globalTerminal.value) || 2.5;
        DEFAULT_MARGIN   = parseFloat(globalMargin.value)   || 20;
        localStorage.setItem('valpro_wacc',     DEFAULT_WACC);
        localStorage.setItem('valpro_terminal', DEFAULT_TERMINAL);
        localStorage.setItem('valpro_margin',   DEFAULT_MARGIN);
        closeSettings();
    });

    // Export CSV
    exportBtn.addEventListener('click', exportCSV);

    // Inicializace renderování
    renderSidebarStocks();
    renderTable();

    if (selectedStocks.length > 0) {
        try { setActiveStock(selectedStocks[0].ticker); } catch (e) { console.error(e); }
    }
}

// ==========================================
//  ULOŽENÍ
// ==========================================
function saveState() {
    try {
        localStorage.setItem('valpro_stocks', JSON.stringify(selectedStocks));
    } catch(e) {
        console.warn('Nelze uložit stav:', e);
    }
}

// ==========================================
//  KOMUNIKACE S API
// ==========================================
async function fetchStockData(ticker, wacc, terminal, margin, customFcf=null, customRust1=null, customRust2=null) {
    try {
        const payload = { ticker, wacc, terminalGrowth: terminal, marginOfSafety: margin };
        if (customFcf   !== null && !isNaN(customFcf))   payload.customFcf   = customFcf;
        if (customRust1 !== null && !isNaN(customRust1)) payload.customRust1 = customRust1;
        if (customRust2 !== null && !isNaN(customRust2)) payload.customRust2 = customRust2;

        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        let stockObj = selectedStocks.find(s => s.ticker === ticker);
        if (!stockObj) {
            stockObj = { ticker: data.ticker || ticker, wacc, terminal, margin, data, originalData: data, isPortfolio: false };
            selectedStocks.push(stockObj);
        } else {
            // Uloží originální data při čistém fetch (bez custom override)
            if (!stockObj.originalData || (customFcf === null && customRust1 === null && customRust2 === null)) {
                stockObj.originalData = data;
            }
            stockObj.wacc     = wacc;
            stockObj.terminal = terminal;
            stockObj.margin   = margin;
            stockObj.data     = data;
        }

        saveState();
        renderSidebarStocks();
        renderTable();

        if (activeStockTicker === ticker) updateDetailView(ticker);

    } catch (err) {
        console.error('fetchStockData error:', err);
        alert('Chyba při stahování dat: ' + err.message);
    }
}

async function addOrFetchStock(ticker) {
    ticker = ticker.toUpperCase().trim();
    const exists = selectedStocks.find(s => s.ticker === ticker);
    if (exists) {
        setActiveStock(ticker);
        return;
    }

    const tempObj = {
        ticker,
        wacc: DEFAULT_WACC,
        terminal: DEFAULT_TERMINAL,
        margin: DEFAULT_MARGIN,
        data: null,
        originalData: null,
        isPortfolio: false
    };
    selectedStocks.push(tempObj);
    setActiveStock(ticker);
    renderSidebarStocks();

    await fetchStockData(ticker, DEFAULT_WACC, DEFAULT_TERMINAL, DEFAULT_MARGIN);
}

async function fetchSuggestions(query) {
    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const results = await res.json();

        searchSuggestions.innerHTML = '';
        if (!results.length) {
            searchSuggestions.classList.add('hidden');
            return;
        }

        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<span class="sym">${item.symbol}</span><span class="name">${item.name}</span>`;
            div.addEventListener('click', () => {
                searchSuggestions.classList.add('hidden');
                searchInput.value = '';
                addOrFetchStock(item.symbol);
            });
            searchSuggestions.appendChild(div);
        });

        searchSuggestions.classList.remove('hidden');
    } catch (err) {
        console.error('Autocomplete error:', err);
    }
}

// ==========================================
//  STATUS LOGIKA
// ==========================================
function getStatus(price, value, safeValue) {
    if (!price || !value || value <= 0) return { text: 'Nelze spočítat', class: 'status-neutral' };
    if (price <= safeValue)  return { text: 'Koupit ✓', class: 'status-good' };
    if (price <= value)      return { text: 'Férová cena', class: 'status-fair' };
    return { text: 'Nadhodnoceno', class: 'status-bad' };
}

// ==========================================
//  VYKRESLENÍ SIDEBARU
// ==========================================
function setActiveStock(ticker) {
    activeStockTicker = ticker;
    renderSidebarStocks();
    updateDetailView(ticker);
}

function renderSidebarStocks() {
    portfolioListEl.innerHTML = '';
    historyListEl.innerHTML   = '';

    let portfolioCount = 0;

    selectedStocks.forEach(stock => {
        const isActive = activeStockTicker === stock.ticker;
        const li = document.createElement('li');
        li.className = `stock-item${isActive ? ' active' : ''}`;

        const name  = stock.data ? stock.data.name  : 'Načítám...';
        const price = stock.data ? `$${stock.data.price.toFixed(2)}` : '--';

        // Bezpečné vložení přes DOM (ne innerHTML) pro ochranu před XSS a ikonkovým fontem
        const infoDiv = document.createElement('div');
        infoDiv.className = 'stock-item-info';

        const tickerSpan = document.createElement('span');
        tickerSpan.className = 'ticker';
        tickerSpan.textContent = stock.ticker;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = name;

        infoDiv.appendChild(tickerSpan);
        infoDiv.appendChild(nameSpan);

        const priceDiv = document.createElement('div');
        priceDiv.className = 'stock-item-price';
        priceDiv.textContent = price;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon delete-stock-btn';
        deleteBtn.title = 'Smazat akcii';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeStock(stock.ticker);
        });

        li.appendChild(infoDiv);
        li.appendChild(priceDiv);
        li.appendChild(deleteBtn);

        li.addEventListener('click', () => setActiveStock(stock.ticker));

        if (stock.isPortfolio) {
            portfolioListEl.appendChild(li);
            portfolioCount++;
        } else {
            historyListEl.appendChild(li);
        }
    });

    portfolioCountEl.textContent = portfolioCount;
}

// ==========================================
//  DETAIL AKCIE
// ==========================================
function updateDetailView(ticker) {
    const stockObj = selectedStocks.find(s => s.ticker === ticker);
    if (!stockObj) {
        detailPanel.classList.add('hidden');
        return;
    }

    detailPanel.classList.remove('hidden');
    detailTicker.textContent = stockObj.ticker;

    // Hvězdička portfolia
    if (stockObj.isPortfolio) {
        btnTogglePortfolio.innerHTML = '<i class="fa-solid fa-star"></i>';
        btnTogglePortfolio.classList.add('btn-star-active');
        btnTogglePortfolio.title = 'Odebrat z Portfolia';
    } else {
        btnTogglePortfolio.innerHTML = '<i class="fa-regular fa-star"></i>';
        btnTogglePortfolio.classList.remove('btn-star-active');
        btnTogglePortfolio.title = 'Přidat do Portfolia';
    }

    // Parametry
    inputWacc.value     = stockObj.wacc     ?? DEFAULT_WACC;
    inputTerminal.value = stockObj.terminal ?? DEFAULT_TERMINAL;
    inputMargin.value   = stockObj.margin   ?? DEFAULT_MARGIN;

    if (!stockObj.data) {
        detailName.textContent = 'Načítám data...';
        detailPrice.textContent = '--';
        detailReportDate.textContent = '--';
        inputFcf.value = '';
        inputRust1.value = '';
        inputRust2.value = '';
        ['detailDcfValue','detailDcfSafe','detailGrahamValue','detailGrahamSafe',
         'detailLynchValue','detailLynchSafe','detailDdmValue','detailDdmSafe'].forEach(id => {
            document.getElementById(id).textContent = '--';
        });
        ['detailDcfStatus','detailGrahamStatus','detailLynchStatus','detailDdmStatus'].forEach(id => {
            const el = document.getElementById(id);
            el.className = 'status-badge status-neutral';
            el.textContent = '...';
        });
        [healthRoe, healthDebt, healthPeg, healthCurrent].forEach(el => el.textContent = '--');
        chartContainer.classList.add('hidden');
        return;
    }

    const d = stockObj.data;

    detailName.textContent          = d.name;
    detailPrice.textContent         = `$${d.price.toFixed(2)}`;
    detailReportDate.textContent    = d.report_date || 'Neznámé datum';

    inputFcf.value   = d.fcf    !== undefined ? d.fcf.toFixed(0)    : '';
    inputRust1.value = d.rust_1_5  !== undefined ? d.rust_1_5.toFixed(1)  : '';
    inputRust2.value = d.rust_6_10 !== undefined ? d.rust_6_10.toFixed(1) : '';

    // DCF
    const dcf = getStatus(d.price, d.dcfValue, d.dcfSafeValue);
    detailDcfValue.textContent  = `$${d.dcfValue.toFixed(2)}`;
    detailDcfSafe.textContent   = `$${d.dcfSafeValue.toFixed(2)}`;
    detailDcfStatus.textContent = dcf.text;
    detailDcfStatus.className   = `status-badge ${dcf.class}`;

    // Graham
    const graham = getStatus(d.price, d.grahamValue, d.grahamSafeValue);
    detailGrahamValue.textContent  = `$${d.grahamValue.toFixed(2)}`;
    detailGrahamSafe.textContent   = `$${d.grahamSafeValue.toFixed(2)}`;
    detailGrahamStatus.textContent = graham.text;
    detailGrahamStatus.className   = `status-badge ${graham.class}`;

    // Lynch
    if (d.lynchValue !== undefined) {
        const lynch = getStatus(d.price, d.lynchValue, d.lynchSafeValue);
        detailLynchValue.textContent  = d.lynchValue > 0 ? `$${d.lynchValue.toFixed(2)}` : 'N/A';
        detailLynchSafe.textContent   = d.lynchSafeValue > 0 ? `$${d.lynchSafeValue.toFixed(2)}` : 'N/A';
        detailLynchStatus.textContent = d.lynchValue > 0 ? lynch.text : 'N/A';
        detailLynchStatus.className   = `status-badge ${d.lynchValue > 0 ? lynch.class : 'status-neutral'}`;
    }

    // DDM
    if (d.ddmValue !== undefined) {
        const ddm = getStatus(d.price, d.ddmValue, d.ddmSafeValue);
        detailDdmValue.textContent  = d.ddmValue > 0 ? `$${d.ddmValue.toFixed(2)}` : 'N/A';
        detailDdmSafe.textContent   = d.ddmSafeValue > 0 ? `$${d.ddmSafeValue.toFixed(2)}` : 'N/A';
        detailDdmStatus.textContent = d.ddmValue > 0 ? ddm.text : 'Nevyplácí dividendu';
        detailDdmStatus.className   = `status-badge ${d.ddmValue > 0 ? ddm.class : 'status-neutral'}`;
    }

    // Finanční zdraví
    if (d.roe !== undefined) {
        healthRoe.textContent = `${d.roe.toFixed(1)} %`;
        healthRoe.className   = `metric-value ${d.roe > 15 ? 'metric-good' : d.roe < 5 ? 'metric-bad' : 'metric-neutral'}`;

        healthDebt.textContent = d.debt_to_equity.toFixed(2);
        healthDebt.className   = `metric-value ${d.debt_to_equity < 1 ? 'metric-good' : d.debt_to_equity > 2 ? 'metric-bad' : 'metric-neutral'}`;

        healthPeg.textContent = d.peg.toFixed(2);
        healthPeg.className   = `metric-value ${d.peg > 0 && d.peg < 1 ? 'metric-good' : d.peg > 2 ? 'metric-bad' : 'metric-neutral'}`;

        healthCurrent.textContent = d.current_ratio.toFixed(2);
        healthCurrent.className   = `metric-value ${d.current_ratio > 1.5 ? 'metric-good' : d.current_ratio < 1 ? 'metric-bad' : 'metric-neutral'}`;
    }

    // Graf
    chartContainer.classList.remove('hidden');
    chartLabelDcf.textContent   = `DCF: $${d.dcfValue.toFixed(2)}`;
    chartLabelPrice.textContent = `Cena: $${d.price.toFixed(2)}`;

    const maxVal  = Math.max(d.dcfValue, d.price) * 1.2;
    const dcfPct  = maxVal > 0 ? (d.dcfValue / maxVal) * 100 : 0;
    const pricePct = maxVal > 0 ? (d.price   / maxVal) * 100 : 0;

    chartBarDcf.style.width       = `${Math.min(100, dcfPct)}%`;
    chartMarkerPrice.style.left   = `${Math.min(98, pricePct)}%`;
}

// ==========================================
//  TABULKA
// ==========================================
function renderTable() {
    dataTableBody.innerHTML = '';

    selectedStocks.forEach(stockObj => {
        if (!stockObj.data) return;
        const d = stockObj.data;

        let totalValue = d.dcfValue + d.grahamValue;
        let totalSafe  = d.dcfSafeValue + d.grahamSafeValue;
        let count = 2;

        if (d.lynchValue && d.lynchValue > 0) { totalValue += d.lynchValue; totalSafe += d.lynchSafeValue; count++; }
        if (d.ddmValue   && d.ddmValue   > 0) { totalValue += d.ddmValue;   totalSafe += d.ddmSafeValue;   count++; }

        const finalStatus = getStatus(d.price, totalValue / count, totalSafe / count);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ticker-cell">${d.ticker}</td>
            <td>$${d.price.toFixed(2)}</td>
            <td>$${d.dcfValue.toFixed(2)}</td>
            <td>$${d.grahamValue.toFixed(2)}</td>
            <td>${d.eps ?? '--'}</td>
            <td>${d.pe  ?? '--'}</td>
            <td><span class="status-badge ${finalStatus.class}">${finalStatus.text}</span></td>
            <td>
                <button class="action-btn" title="Odebrat" data-ticker="${d.ticker}">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;

        tr.querySelector('.action-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeStock(d.ticker);
        });

        tr.addEventListener('click', () => setActiveStock(d.ticker));
        dataTableBody.appendChild(tr);
    });
}

// ==========================================
//  MAZÁNÍ AKCIE
// ==========================================
function removeStock(ticker) {
    selectedStocks = selectedStocks.filter(s => s.ticker !== ticker);
    saveState();

    if (activeStockTicker === ticker) {
        if (selectedStocks.length > 0) {
            setActiveStock(selectedStocks[0].ticker);
        } else {
            activeStockTicker = null;
            detailPanel.classList.add('hidden');
        }
    }

    renderSidebarStocks();
    renderTable();
}

// Globální funkce pro zpětnou kompatibilitu (v případě starých onclick v HTML)
window.removeStock = removeStock;

// ==========================================
//  SCÉNÁŘE – HELPER
// ==========================================
function setScenarioActive(activeBtn) {
    [btnBear, btnBase, btnBull].forEach(b => b.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
}

// ==========================================
//  EXPORT CSV
// ==========================================
function exportCSV() {
    const rows = [['Ticker','Cena','DCF','Graham','EPS','P/E','Závěr']];
    selectedStocks.forEach(s => {
        if (!s.data) return;
        const d = s.data;
        let total = d.dcfValue + d.grahamValue;
        let safe  = d.dcfSafeValue + d.grahamSafeValue;
        let cnt   = 2;
        if (d.lynchValue > 0) { total += d.lynchValue; safe += d.lynchSafeValue; cnt++; }
        if (d.ddmValue   > 0) { total += d.ddmValue;   safe += d.ddmSafeValue;   cnt++; }
        const st = getStatus(d.price, total/cnt, safe/cnt);
        rows.push([d.ticker, d.price.toFixed(2), d.dcfValue.toFixed(2), d.grahamValue.toFixed(2), d.eps ?? '', d.pe ?? '', st.text]);
    });

    const csv     = rows.map(r => r.join(',')).join('\n');
    const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `valuation_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ==========================================
//  TÉMA
// ==========================================
function toggleTheme() {
    isDarkMode = !isDarkMode;
    localStorage.setItem('valpro_theme', isDarkMode ? 'dark' : 'light');
    applyTheme();
}

function applyTheme() {
    if (isDarkMode) {
        document.body.classList.remove('light-theme');
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    } else {
        document.body.classList.add('light-theme');
        themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
}

// ==========================================
//  START
// ==========================================
init();
