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

// Pomocná funkce pro formátování měny
function formatCurrency(value, currency = 'USD') {
    if (value === null || value === undefined || isNaN(value)) return '--';
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 2,
            minimumFractionDigits: 2
        }).format(value);
    } catch (e) {
        return `${value.toFixed(2)} ${currency}`;
    }
}

// Globální výchozí hodnoty
// Výchozí hodnoty (odstraněn globální WACC a Terminal, budou se načítat z AI per akcie)
let DEFAULT_MARGIN   = parseFloat(localStorage.getItem('valpro_margin'))   || 20;
let DEFAULT_CURRENCY = localStorage.getItem('valpro_currency') || 'ORIGINAL';

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
const btnCloseSettings = document.getElementById('btnCloseSettings');
const settingsModal    = document.getElementById('settingsModal');
const btnSaveSettings  = document.getElementById('btnSaveSettings');
const globalMargin     = document.getElementById('globalMargin');
const globalCurrency   = document.getElementById('globalCurrency');
const btnCancelSettings = document.getElementById('btnCancelSettings');

// Průvodce
const btnGuide = document.getElementById('btnGuide');
const guideModal = document.getElementById('guideModal');
const btnCloseGuide = document.getElementById('btnCloseGuide');
const btnGuideNext = document.getElementById('btnGuideNext');
const btnGuidePrev = document.getElementById('btnGuidePrev');
const guideSteps = document.querySelectorAll('.guide-step');
const guideDots = document.querySelectorAll('.guide-dots .dot');

// Import CSV
const importBtn = document.getElementById('importBtn');
const importCsvInput = document.getElementById('importCsvInput');

// Parametry akcie
const inputFcf           = document.getElementById('inputFcf');
const inputRust1         = document.getElementById('inputRust1');
const inputRust2         = document.getElementById('inputRust2');
const inputWacc          = document.getElementById('inputWacc');
const inputTerminal      = document.getElementById('inputTerminal');
const inputMargin        = document.getElementById('inputMargin');
const inputKategorie     = document.getElementById('inputKategorie');
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

// ==========================================
//  INICIALIZACE
// ==========================================
function init() {
    applyTheme();

    // Vybrat obsah při kliknutí do políčka (lepší UX)
    document.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('focus', function() {
            this.select();
        });
    });

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
            await fetchStockData(s.ticker, s.wacc, s.terminal, s.margin);
        }
        btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Obnovit Portfolio';
        btn.disabled = false;
    });

    // Přepočítat
    btnRecalculateStock.addEventListener('click', async () => {
        if (!activeStockTicker) return;
        const stockObj = selectedStocks.find(s => s.ticker === activeStockTicker);
        const waccValue = parseFloat(inputWacc.value) || (stockObj.data ? stockObj.data.recommended_wacc : 10);
        const marginValue = parseFloat(inputMargin.value) || DEFAULT_MARGIN;
        const fcfValue = inputFcf.value !== '' ? parseFloat(inputFcf.value) : null;
        const rust1Value = inputRust1.value !== '' ? parseFloat(inputRust1.value) : null;
        const rust2Value = inputRust2.value !== '' ? parseFloat(inputRust2.value) : null;
        const terminalValue = parseFloat(inputTerminal.value) || 2.5;
        const customKategorie = inputKategorie ? inputKategorie.value : null;

        btnRecalculateStock.textContent = 'Počítám...';
        btnRecalculateStock.disabled = true;
        await fetchStockData(activeStockTicker, waccValue, terminalValue, marginValue, fcfValue, rust1Value, rust2Value, customKategorie);
        btnRecalculateStock.textContent = 'Přepočítat';
        btnRecalculateStock.disabled = false;
    });

    // Reset na AI data
    btnResetStock.addEventListener('click', async () => {
        if (!activeStockTicker) return;
        btnResetStock.innerHTML = '<i class="fa-solid fa-rotate-left fa-spin"></i>';
        btnResetStock.disabled = true;

        await fetchStockData(activeStockTicker);

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
        globalMargin.value   = DEFAULT_MARGIN;
        if (globalCurrency) globalCurrency.value = DEFAULT_CURRENCY;
        settingsModal.classList.remove('hidden');
    });

    const closeSettings = () => settingsModal.classList.add('hidden');
    btnCloseSettings.addEventListener('click', closeSettings);
    btnCancelSettings.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });

    btnSaveSettings.addEventListener('click', async () => {
        DEFAULT_MARGIN   = parseFloat(globalMargin.value)   || 20;
        
        let currencyChanged = false;
        if (globalCurrency) {
            currencyChanged = (DEFAULT_CURRENCY !== globalCurrency.value);
            DEFAULT_CURRENCY = globalCurrency.value;
        }

        localStorage.setItem('valpro_margin',   DEFAULT_MARGIN);
        localStorage.setItem('valpro_currency', DEFAULT_CURRENCY);
        
        // Obnovit zobrazení aktuální akcie a překreslit
        if (currencyChanged && selectedStocks.length > 0) {
            const refreshBtn = document.getElementById('analyzeAllBtn');
            const originalText = refreshBtn.innerHTML;
            refreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Aktualizuji...';
            refreshBtn.disabled = true;
            
            // Postupně obnovíme všechny akcie kvůli změně měny
            for (const s of selectedStocks) {
                await fetchStockData(s.ticker, s.wacc, s.terminal, s.margin);
            }
            
            refreshBtn.innerHTML = originalText;
            refreshBtn.disabled = false;
        } else if (activeStockTicker) {
            btnRecalculateStock.click();
        }
        
        closeSettings();
    });

    // Export CSV
    exportBtn.addEventListener('click', exportCSV);

    // Import CSV
    if (importBtn && importCsvInput) {
        importBtn.addEventListener('click', () => importCsvInput.click());
        importCsvInput.addEventListener('change', handleImportCSV);
    }

    // Průvodce
    let currentGuideStep = 1;
    const maxGuideSteps = 5;

    const updateGuideUI = () => {
        guideSteps.forEach(step => {
            const stepNum = parseInt(step.getAttribute('data-step'));
            step.classList.remove('active', 'exit-left');
            if (stepNum === currentGuideStep) {
                step.classList.add('active');
            } else if (stepNum < currentGuideStep) {
                step.classList.add('exit-left');
            }
        });

        guideDots.forEach((dot, idx) => {
            if (idx + 1 === currentGuideStep) dot.classList.add('active');
            else dot.classList.remove('active');
        });

        btnGuidePrev.disabled = currentGuideStep === 1;
        if (currentGuideStep === maxGuideSteps) {
            btnGuideNext.textContent = 'Zavřít průvodce';
        } else {
            btnGuideNext.textContent = 'Další krok';
        }
    };

    if (btnGuide && guideModal) {
        btnGuide.addEventListener('click', () => {
            currentGuideStep = 1;
            updateGuideUI();
            guideModal.classList.remove('hidden');
        });

        const closeGuide = () => guideModal.classList.add('hidden');
        btnCloseGuide.addEventListener('click', closeGuide);
        guideModal.addEventListener('click', (e) => {
            if (e.target === guideModal) closeGuide();
        });

        btnGuideNext.addEventListener('click', () => {
            if (currentGuideStep < maxGuideSteps) {
                currentGuideStep++;
                updateGuideUI();
            } else {
                closeGuide();
            }
        });

        btnGuidePrev.addEventListener('click', () => {
            if (currentGuideStep > 1) {
                currentGuideStep--;
                updateGuideUI();
            }
        });
        
        guideDots.forEach((dot, idx) => {
            dot.addEventListener('click', () => {
                currentGuideStep = idx + 1;
                updateGuideUI();
            });
        });
    }

    // Inicializace renderování
    renderSidebarStocks();
    renderTable();

    if (selectedStocks.length > 0) {
        try { setActiveStock(selectedStocks[0].ticker); } catch (e) { console.error(e); }
    }
    
    // Načtení tržního teploměru
    fetchMarketHealth();
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
//  KOMUNIKACE API & LOGIKA
// ==========================================
async function fetchStockData(ticker, wacc=null, terminal=2.5, margin=null, customFcf=null, customRust1=null, customRust2=null, customKategorie=null) {
    try {
        const payload = { ticker, terminalGrowth: 2.5, marginOfSafety: margin !== null ? margin : DEFAULT_MARGIN, targetCurrency: DEFAULT_CURRENCY };
        if (wacc !== null && !isNaN(wacc)) payload.wacc = wacc;
        if (customFcf   !== null && !isNaN(customFcf))   payload.customFcf   = customFcf;
        if (customRust1 !== null && !isNaN(customRust1)) payload.customRust1 = customRust1;
        if (customRust2 !== null && !isNaN(customRust2)) payload.customRust2 = customRust2;
        if (customKategorie) payload.customKategorie = customKategorie;

        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        let stockObj = selectedStocks.find(s => s.ticker === ticker);
        if (!stockObj) {
            stockObj = { ticker: data.ticker || ticker, wacc: data.wacc, terminal: 2.5, margin: margin || DEFAULT_MARGIN, data, originalData: data, isPortfolio: false };
            selectedStocks.push(stockObj);
        } else {
            if (!stockObj.originalData || (customFcf === null && customRust1 === null && customRust2 === null)) {
                stockObj.originalData = data;
            }
            stockObj.wacc     = wacc || data.wacc;
            stockObj.terminal = terminal;
            stockObj.margin   = margin || stockObj.margin;
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
        wacc: null,
        terminal: 2.5,
        margin: DEFAULT_MARGIN,
        data: null,
        originalData: null,
        isPortfolio: false
    };
    selectedStocks.push(tempObj);
    setActiveStock(ticker);
    renderSidebarStocks();

    await fetchStockData(ticker);
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
            const exchBadge = item.exchange ? `<span class="exchange-badge">${item.exchange}</span>` : '';
            div.innerHTML = `<div style="display:flex; align-items:center; gap:0.5rem;"><span class="sym">${item.symbol}</span>${exchBadge}</div><span class="name">${item.name}</span>`;
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
        const price = stock.data ? formatCurrency(stock.data.price, stock.data.currency) : '--';

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

    if (!stockObj.data) {
        detailName.textContent = 'Načítám data...';
        detailPrice.textContent = '--';
        detailReportDate.textContent = '--';
        inputFcf.value = '';
        inputRust1.value = '';
        inputRust2.value = '';
        ['detailDcfValue','detailDcfSafe','detailGrahamValue','detailGrahamSafe',
         'detailLynchValue','detailLynchSafe','detailHistPeValue','detailHistPeSafe'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '--';
        });
        ['detailDcfStatus','detailGrahamStatus','detailLynchStatus','detailHistPeStatus'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.className = 'status-badge status-neutral';
                el.textContent = '...';
            }
        });
        [healthRoe, healthDebt, healthPeg, healthCurrent].forEach(el => { if (el) el.textContent = '--'; });
        chartContainer.classList.add('hidden');
        return;
    }

    const d = stockObj.data;

    detailName.textContent          = d.name;
    detailPrice.textContent         = formatCurrency(d.price, d.currency);
    detailReportDate.textContent    = d.report_date || 'Neznámé datum';

    inputWacc.value     = stockObj.wacc?.toFixed(1) ?? d.recommended_wacc?.toFixed(1) ?? "10.0";
    inputTerminal.value = stockObj.terminal ?? 2.5;
    inputMargin.value   = stockObj.margin ?? DEFAULT_MARGIN;

    inputFcf.value   = d.fcf    !== undefined ? d.fcf.toFixed(0)    : '';
    inputRust1.value = d.rust_1_5  !== undefined ? d.rust_1_5.toFixed(1)  : '';
    inputRust2.value = d.rust_6_10 !== undefined ? d.rust_6_10.toFixed(1) : '';
    if (inputKategorie) {
        inputKategorie.value = d.kategorie || 'B';
    }

    // Kategorie Badge
    const kategorieBadge = document.getElementById('kategorieBadge');
    if(kategorieBadge) {
        if(d.kategorie === 'A') kategorieBadge.innerHTML = 'Typ A: Růstová';
        else if(d.kategorie === 'B') kategorieBadge.innerHTML = 'Typ B: Klasická';
        else if(d.kategorie === 'C') kategorieBadge.innerHTML = 'Typ C: Cyklická';
        else kategorieBadge.innerHTML = '';
    }

    function updateModelCard(vId, sId, stId, val, safe, price, curr) {
        const vEl = document.getElementById(vId);
        const sEl = document.getElementById(sId);
        const stEl = document.getElementById(stId);
        vEl.textContent = formatCurrency(val, curr);
        sEl.textContent = formatCurrency(safe, curr);
        const status = getStatus(price, val, safe);
        stEl.textContent = status.text;
        stEl.className = `status-badge ${status.class}`;
    }

    updateModelCard('detailDcfValue', 'detailDcfSafe', 'detailDcfStatus', d.dcfValue, d.dcfSafeValue, d.price, d.currency);
    updateModelCard('detailGrahamValue', 'detailGrahamSafe', 'detailGrahamStatus', d.grahamValue, d.grahamSafeValue, d.price, d.currency);
    updateModelCard('detailLynchValue', 'detailLynchSafe', 'detailLynchStatus', d.lynchValue, d.lynchSafeValue, d.price, d.currency);
    updateModelCard('detailHistPeValue', 'detailHistPeSafe', 'detailHistPeStatus', d.histPeValue, d.histPeSafeValue, d.price, d.currency);

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
    const chartTitle = document.getElementById('chartTitle');
    const chartPrice = document.getElementById('chartPrice');
    chartTitle.textContent = `Vážená Hodnota: ${formatCurrency(d.blendedValue, d.currency)}`;
    chartPrice.textContent = `Cena: ${formatCurrency(d.price, d.currency)}`;

    const maxVal  = Math.max(d.blendedValue, d.price) * 1.2;
    const dcfPct  = maxVal > 0 ? Math.min((d.blendedValue / maxVal) * 100, 100) : 0;
    const pricePct = maxVal > 0 ? (d.price   / maxVal) * 100 : 0;

    chartBarDcf.style.width       = `${dcfPct}%`;
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
        const price = d.price;
        const safeVal = d.blendedSafeValue || 0;
        const val = d.blendedValue || 0;
        const statusClass = price < safeVal ? 'status-good' : (price > val ? 'status-bad' : 'status-fair');
        const statusText = price < safeVal ? 'Koupit' : (price > val ? 'Předraženo' : 'Férová');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ticker-cell" style="font-weight:700;">${d.ticker} <span class="exchange-badge">${d.kategorie || '?'}</span></td>
            <td>${formatCurrency(price, d.currency)}</td>
            <td style="font-weight:600;">${formatCurrency(val, d.currency)}</td>
            <td style="color:var(--text-secondary);">${formatCurrency(safeVal, d.currency)}</td>
            <td>${d.pe ?? '--'}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
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
    const rows = [['Ticker','Cena','DCF','Graham','Lynch','Hist P/E','EPS','Závěr']];
    selectedStocks.forEach(s => {
        if (!s.data) return;
        const d = s.data;
        let total = 0, safe = 0, cnt = 0;
        
        if (d.dcfValue > 0) { total += d.dcfValue; safe += d.dcfSafeValue; cnt++; }
        if (d.grahamValue > 0) { total += d.grahamValue; safe += d.grahamSafeValue; cnt++; }
        if (d.lynchValue > 0) { total += d.lynchValue; safe += d.lynchSafeValue; cnt++; }
        if (d.histPeValue > 0) { total += d.histPeValue; safe += d.histPeSafeValue; cnt++; }
        
        const avgTotal = cnt > 0 ? total / cnt : 0;
        const avgSafe = cnt > 0 ? safe / cnt : 0;
        const st = getStatus(d.price, avgTotal, avgSafe);
        
        rows.push([d.ticker, d.price.toFixed(2), (d.dcfValue || 0).toFixed(2), (d.grahamValue || 0).toFixed(2), (d.lynchValue || 0).toFixed(2), (d.histPeValue || 0).toFixed(2), d.eps ?? '', st.text]);
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
//  IMPORT CSV
// ==========================================
async function handleImportCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(event) {
        const text = event.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) {
            alert('Soubor je prázdný nebo nemá správný formát.');
            return;
        }

        const refreshBtn = document.getElementById('analyzeAllBtn');
        const originalText = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Importuji...';
        refreshBtn.disabled = true;

        let addedCount = 0;
        
        // Začínáme od indexu 1 (přeskakujeme hlavičku)
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length > 0 && cols[0]) {
                const ticker = cols[0].trim().toUpperCase();
                // Přidáme jen pokud už v portfoliu není
                let stockObj = selectedStocks.find(s => s.ticker === ticker);
                if (!stockObj) {
                    stockObj = {
                        ticker,
                        wacc: null,
                        terminal: 2.5,
                        margin: DEFAULT_MARGIN,
                        data: null,
                        originalData: null,
                        isPortfolio: true
                    };
                    selectedStocks.push(stockObj);
                    addedCount++;
                    // Stáhneme pro něj nejnovější data
                    await fetchStockData(ticker);
                } else if (!stockObj.isPortfolio) {
                    stockObj.isPortfolio = true;
                    addedCount++;
                    saveState();
                }
            }
        }

        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
        
        renderSidebarStocks();
        if (addedCount > 0) {
            alert(`Úspěšně importováno ${addedCount} akcií do portfolia!`);
        } else {
            alert('Všechny akcie ze souboru už ve vašem portfoliu jsou.');
        }
    };
    reader.readAsText(file);
    // Reset inputu pro další import
    e.target.value = '';
}

// ==========================================
//  MARKET HEALTH (Teploměr trhu)
// ==========================================
async function fetchMarketHealth() {
    const mhWidget = document.getElementById('marketHealthWidget');
    const mhIcon = document.getElementById('mhIcon');
    const mhIndicator = document.getElementById('mhIndicator');
    const mhStatusText = document.getElementById('mhStatusText');
    const mhPe = document.getElementById('mhPe');
    const mhVix = document.getElementById('mhVix');

    if (!mhWidget) return;

    try {
        const response = await fetch('/api/market-health');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        mhPe.textContent = data.spy_pe;
        mhVix.textContent = data.vix;
        mhWidget.classList.remove('hidden');
        
        // Reset classes
        mhStatusText.className = 'mh-status';
        mhIcon.className = 'fa-solid fa-temperature-half';
        mhIndicator.className = 'mh-indicator';

        if (data.spy_pe >= 23 || data.vix <= 15) {
            mhStatusText.textContent = "Extrémní euforie";
            mhStatusText.classList.add('mh-status-red');
            mhIcon.classList.add('mh-status-red-icon', 'fa-temperature-full');
            mhIndicator.classList.add('mh-bg-red');
            mhWidget.style.borderColor = "var(--status-danger)";
        } 
        else if (data.spy_pe <= 18 || data.vix >= 25) {
            mhStatusText.textContent = "Panika na trhu";
            mhStatusText.classList.add('mh-status-green');
            mhIcon.classList.add('mh-status-green-icon', 'fa-temperature-empty');
            mhIndicator.classList.add('mh-bg-green');
            mhWidget.style.borderColor = "var(--status-success)";
        } 
        else {
            mhStatusText.textContent = "Trh je neutrální";
            mhStatusText.classList.add('mh-status-yellow');
            mhIcon.classList.add('mh-status-yellow-icon');
            mhIndicator.classList.add('mh-bg-yellow');
            mhWidget.style.borderColor = "var(--status-warning)";
        }
        
    } catch (e) {
        console.error("Chyba při načítání Teploměru trhu:", e);
        mhWidget.classList.remove('hidden');
        mhStatusText.textContent = "Data nedostupná";
        mhStatusText.style.color = "var(--text-muted)";
        mhIcon.className = 'fa-solid fa-temperature-half';
        mhIcon.style.color = "var(--text-muted)";
        mhIndicator.className = 'mh-indicator mh-bg-gray';
        mhWidget.style.borderColor = "rgba(255,255,255,0.05)";
    }
}

// ==========================================
//  START
// ==========================================
init();
