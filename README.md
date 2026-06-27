# 📈 ValuationPro – Pokročilá Kalkulačka Vnitřní Hodnoty Akcií

**ValuationPro** je komplexní a profesionální webová aplikace navržená pro investory, kteří chtějí oceňovat akcie na základě jejich skutečných fundamentů, a ne pouhých spekulací. Aplikace kombinuje reálná tržní data (Yahoo Finance) se schopnostmi umělé inteligence (Groq, LLaMA 3.3) pro odhadování finančních metrik, automatickou kategorizaci firem a výpočet vážené férové ceny podle čtyř ověřených investičních modelů.

![ValuationPro Preview](https://img.shields.io/badge/Status-Active-success) ![License](https://img.shields.io/badge/License-MIT-blue) ![Python](https://img.shields.io/badge/Python-3.8+-blue) ![Flask](https://img.shields.io/badge/Framework-Flask-green)

---

## 🌟 Hlavní funkce

### 1. 🧠 Inteligentní vyhledávání a klasifikace AI
Zadáte název firmy (klidně s překlepem) a AI model okamžitě zjistí správný burzovní ticker a **zařadí firmu do jedné ze 3 kategorií**, které určují, jakým způsobem se bude akcie oceňovat:
- **Typ A (Růstová):** Technologické a růstové firmy (Nvidia, Tesla). Důraz na budoucí hotovost (DCF a Lynch).
- **Typ B (Klasická):** Stabilní giganti s velkým cashflow (Apple, Coca-Cola). Mix všech modelů.
- **Typ C (Cyklická):** Těžký průmysl, banky, automobilky. Důraz na současný majetek a historii (Graham a Hist. P/E).

### 2. 🧮 Čtyři robustní modely ocenění
Aplikace nespoléhá na jeden výpočet, ale trianguluje vnitřní hodnotu pomocí uznávaných modelů:
- **DCF Model (Discounted Cash Flow):** Zlatý standard Wall Street počítající současnou hodnotu budoucích volných peněžních toků (FCF).
- **Grahamova hodnota:** Konzervativní model otce hodnotového investování B. Grahama zaměřený na EPS a účetní hodnotu (BVPS).
- **Peter Lynch Model:** Ocenění zaměřené na růst firmy (P/E = Growth). Ideální pro rychle rostoucí firmy.
- **Historické P/E:** Zohlednění historického nacenění akcie trhem, zásadní pro cyklické společnosti.

### 3. 🛡️ Finanční zdraví a Bezpečnostní polštář (Margin of Safety)
Každá firma je podrobena kontrole fundamentů podle "Buffettových ukazatelů":
- **ROE (Návratnost):** Jak dobře vedení zhodnocuje peníze akcionářů.
- **D/E (Zadluženost):** Poměr dluhů vůči majetku.
- **PEG Ratio:** Cena akcie v poměru k jejímu růstu.
- **Current Ratio (Likvidita):** Schopnost splácet krátkodobé závazky.

Všechna ocenění lze automaticky ponížit o tzv. **Bezpečnostní polštář** (např. 20 %), který chrání investora před omyly v odhadech.

### 4. 🌡️ Teploměr trhu (Market Health)
Na hlavní obrazovce vidíte aktuální stav amerického trhu. Aplikace na pozadí analyzuje:
- **P/E indexu S&P 500** (Zda je trh drahý nebo levný).
- **Index VIX** (Míra strachu a volatility).
Sami tak víte, zda je ideální čas na výprodejové nákupy, nebo zda na trzích panuje extrémní euforie.

### 5. 💼 Portfolio a Scénáře
- **Vlastní Portfolio:** Uložení sledovaných akcií s možností Importu a Exportu přes CSV.
- **Stresové testování:** Možnost přepínat mezi scénáři Bear (-5 % k růstu), Base a Bull (+5 % k růstu).
- **Konverze měn:** Výpočet lze zobrazit v USD, EUR, CZK nebo v původní měně akcie.

---

## 🛠️ Architektura a Technologie

Projekt je rozdělen na backend v Pythonu a moderní frontend napsaný v čistém HTML/CSS/JS.

### Backend (Python / Flask)
- **[Flask](https://flask.palletsprojects.com/):** Lehký a rychlý webový framework obsluhující API a statické soubory.
- **[yfinance](https://pypi.org/project/yfinance/):** Získávání reálných cen akcií, historických dat a finančních výkazů přímo z Yahoo Finance.
- **[Groq API](https://groq.com/):** Využití super-rychlého LLM modelu (`llama-3.3-70b-versatile`) pro parsování uživatelského vstupu, odhad neúplných dat a přiřazování kategorií (s využitím in-memory cache pro omezení halucinací a úsporu API volání).

### Frontend (HTML, CSS, JS)
- **Vanilla JS:** Veškerá logika, dynamické výpočty, aktualizace DOMu a komunikace s API bez závislosti na velkých frameworcích typu React.
- **Moderní UI/UX:**
  - **Glassmorphism:** Poloprůhledné prvky (backdrop-filter) pro prémiový vzhled.
  - **Dark/Light Mode:** Plná podpora pro světlý a tmavý režim přepínatelný jedním kliknutím.
  - Využití CSS proměnných pro snadnou správu design systému.
- **Fonty a Ikony:** [Google Fonts (Inter)](https://fonts.google.com/specimen/Inter) a [FontAwesome 6](https://fontawesome.com/).

---

## 🚀 Instalace a spuštění (Lokální vývoj)

### Předpoklady
- Python 3.8 nebo novější
- Získaný API klíč od [Groq](https://console.groq.com/) (pro AI funkce)

### Postup

1. **Naklonujte si repozitář:**
   ```bash
   git clone https://github.com/vase_jmeno/ValuationPro.git
   cd ValuationPro
   ```

2. **Vytvořte virtuální prostředí a nainstalujte závislosti:**
   ```bash
   python -m venv venv
   # Pro Windows:
   venv\Scripts\activate
   # Pro Mac/Linux:
   source venv/bin/activate
   
   pip install -r requirements.txt
   ```

3. **Nastavte API klíč:**
   Aplikace hledá klíč v systémové proměnné `GROQ_API_KEY`. Pokud není nalezena, použije fallback uvedený v kódu (doporučeno změnit na vlastní!).
   ```bash
   # Windows (PowerShell)
   $env:GROQ_API_KEY="vas_klic_zde"
   ```

4. **Spusťte server:**
   ```bash
   python app.py
   ```

5. **Otevřete aplikaci:**
   Přejděte v prohlížeči na adresu `http://127.0.0.1:5000`.

---

## 📂 Struktura repozitáře

```text
ValuationPro/
│
├── app.py                # Hlavní aplikační logika a API (Flask)
├── app.js                # Frontendová logika, interakce s DOMem a API
├── index.html            # Struktura uživatelského rozhraní
├── styles.css            # Design systém, Glassmorphism, Dark/Light theme
├── requirements.txt      # Seznam Python závislostí
└── README.md             # Dokumentace projektu
```

---

## 🤝 Přispívání
Budu rád za jakékoliv návrhy, nahlášení chyb (Issues) nebo Pull Requesty! Aplikace je napsaná jednoduše, takže úprava vzorců nebo přidání nové funkce do `app.py` či `app.js` je velmi snadné.

---
*Disclaimer: Aplikace slouží výhradně k edukativním a analytickým účelům. Vypočítané hodnoty nejsou finančním poradenstvím. Vždy si dělejte vlastní průzkum před nákupem akcií.*
