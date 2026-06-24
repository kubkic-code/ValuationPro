import os
import json
from datetime import datetime
import requests
from flask import Flask, request, jsonify, send_from_directory
from groq import Groq
import yfinance as yf

# NASTAVENÍ A INICIALIZACE
app = Flask(__name__, static_folder='.')

# Načtení API klíče ze systémových proměnných (pro produkci) 
# s fallbackem na natvrdo zapsaný klíč (pro lokální testování).
API_KEY = os.environ.get("GROQ_API_KEY", "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")
client = Groq(api_key=API_KEY)

# Cache pro AI odpovědi, abychom zamezili neustálým změnám odhadů (halucinacím)
AI_CACHE = {}

def ziskej_data_z_ai(nazev_firmy):
    prompt = f"""
    Uživatel zadal název firmy takto: "{nazev_firmy}". Zadaný název může obsahovat hrubé překlepy.
    Ignoruj překlepy, zjisti o jakou reálnou firmu se jedná a zjisti její burzovní ticker (u Berkshire Hathaway preferuj BRK.B).
    Odhadni aktuální finanční data, pokud nemáš přesné informace.
    
    Požadovaná data:
    1. Aktuální tržní cena akcie
    2. Výchozí Free Cash Flow (FCF) v milionech
    3. Očekávaná míra růstu - Fáze 1 jako desetinné číslo (např. 0.15)
    4. Míra růstu - Fáze 2 jako desetinné číslo (např. 0.10)
    5. Čistý dluh v milionech
    6. Počet akcií v oběhu v milionech
    7. Čistý zisk na akcii (EPS TTM)
    8. Očekávaná míra růstu zisku pro Grahama (desetinné číslo, např. 0.15 pro 15%)
    9. Aktuální výnos AAA dluhopisů jako desetinné číslo (např. 0.04)

    Odpověz STRIKTNĚ ve formátu JSON s těmito klíči:
    {{
        "skutecny_nazev": "",
        "ticker": "",
        "cena_akcie": 0.0,
        "fcf": 0.0,
        "rust_1_5": 0.0,
        "rust_6_10": 0.0,
        "net_debt": 0.0,
        "shares_outstanding": 0.0,
        "eps": 0.0,
        "graham_g": 0.0,
        "aaa_yield": 0.0
    }}
    """

    response = client.chat.completions.create(
        messages=[
            {"role": "system", "content": "You are a helpful assistant that strictly outputs JSON."},
            {"role": "user", "content": prompt}
        ],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)

def vypocet_dcf(data, wacc=0.10, terminal_growth=0.025, margin_of_safety=0.20):
    """
    Výpočet DCF. data musí obsahovat: fcf, rust_1_5, rust_6_10, net_debt, shares_outstanding
    Vrací slovník s DCF hodnotou a hodnotou s polštářem.
    """
    try:
        fcf = float(data.get("fcf", 0))
        rust_1 = float(data.get("rust_1_5", 0))
        rust_2 = float(data.get("rust_6_10", 0))
        net_debt = float(data.get("net_debt", 0))
        shares = float(data.get("shares_outstanding", 0))
        
        if shares <= 0: return {"value": 0, "safe_value": 0}
        
        pv_fcf = 0
        current_fcf = fcf
        
        # Fáze 1 (roky 1-5)
        for i in range(1, 6):
            current_fcf = current_fcf * (1 + rust_1)
            pv_fcf += current_fcf / ((1 + wacc) ** i)
            
        # Fáze 2 (roky 6-10)
        for i in range(6, 11):
            current_fcf = current_fcf * (1 + rust_2)
            pv_fcf += current_fcf / ((1 + wacc) ** i)
            
        # Terminální hodnota (Terminal Value)
        # Použijeme FCF v roce 10 a terminální růst
        tv = (current_fcf * (1 + terminal_growth)) / (wacc - terminal_growth)
        pv_tv = tv / ((1 + wacc) ** 10)
        
        # Celková firemní hodnota
        ev = pv_fcf + pv_tv
        
        # Hodnota vlastního kapitálu (Equity Value)
        equity_value = ev - net_debt
        
        # Hodnota na akcii
        intrinsic_value = equity_value / shares
        
        return {
            "value": max(0, intrinsic_value),
            "safe_value": max(0, intrinsic_value * (1 - margin_of_safety))
        }
    except Exception as e:
        print(f"Chyba při DCF: {e}")
        return {"value": 0, "safe_value": 0}

def vypocet_graham(data, margin_of_safety=0.20):
    """
    Výpočet podle Benjamina Grahama. V = (EPS * (8.5 + 2g) * 4.4) / Y
    """
    try:
        eps = float(data.get("eps", 0))
        # Převod g z desetinného čísla zpět na procenta pro tento vzorec (např. 0.15 -> 15)
        # Někdy AI vrátí už celé číslo, ošetříme to:
        g_raw = float(data.get("graham_g", 0))
        g = g_raw * 100 if g_raw < 1 else g_raw 
        
        y = float(data.get("aaa_yield", 0.04))
        y = y * 100 if y < 1 else y # převod na procenta, vzorec bere např. 4.4 % jako 4.4, někdy jako 0.044, standard je Y v procentech
        
        if y <= 0: y = 4.4 # fallback
        
        intrinsic_value = (eps * (8.5 + 2 * g) * 4.4) / y
        
        return {
            "value": max(0, intrinsic_value),
            "safe_value": max(0, intrinsic_value * (1 - margin_of_safety))
        }
    except Exception as e:
        print("Chyba při výpočtu Grahama:", e)
        return {"value": 0, "safe_value": 0}

def vypocet_lynch(data, margin_of_safety=0.20):
    """
    Peter Lynch Fair Value = (Růst zisků v %) * EPS
    Předpokládá, že férové P/E se rovná míře růstu zisků.
    """
    try:
        eps = float(data.get("eps", 0))
        rust_raw = float(data.get("rust_1_5", 0))
        # Lynch používá procentuální vyjádření růstu (např. 15 % = 15)
        rust = rust_raw * 100 if rust_raw < 1 else rust_raw
        
        if eps <= 0 or rust <= 0:
            return {"value": 0, "safe_value": 0}
            
        intrinsic_value = rust * eps
        
        return {
            "value": intrinsic_value,
            "safe_value": intrinsic_value * (1 - margin_of_safety)
        }
    except Exception as e:
        print("Chyba při výpočtu Lynchova modelu:", e)
        return {"value": 0, "safe_value": 0}

def vypocet_ddm(data, wacc=0.10, margin_of_safety=0.20):
    """
    Dividend Discount Model (Gordon Growth Model)
    Hodnota = Dividenda * (1 + Růst) / (Diskontní sazba - Růst)
    """
    try:
        div = float(data.get("dividend", 0))
        # DDM funguje jen pro stabilní, pomalejší růst, obvykle terminální
        rust_div = float(data.get("rust_6_10", 0)) 
        if rust_div >= wacc: 
            rust_div = wacc - 0.01 # Matematická ochrana
            
        if div <= 0:
            return {"value": 0, "safe_value": 0}
            
        intrinsic_value = (div * (1 + rust_div)) / (wacc - rust_div)
        
        return {
            "value": max(0, intrinsic_value),
            "safe_value": max(0, intrinsic_value * (1 - margin_of_safety))
        }
    except Exception as e:
        print("Chyba při výpočtu DDM:", e)
        return {"value": 0, "safe_value": 0}

# --- ROUTES ---

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@app.route('/api/search', methods=['GET'])
def search_ticker():
    query = request.args.get('q', '')
    if not query:
        return jsonify([])
    try:
        url = f"https://query2.finance.yahoo.com/v1/finance/search?q={query}"
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        response = requests.get(url, headers=headers)
        data = response.json()
        quotes = data.get('quotes', [])
        results = []
        for q in quotes:
            # Chceme jen akcie nebo ETF
            if q.get('quoteType') in ['EQUITY', 'ETF'] and 'shortname' in q and 'symbol' in q:
                results.append({
                    "symbol": q['symbol'],
                    "name": q['shortname']
                })
        return jsonify(results[:6])
    except Exception as e:
        print(f"Chyba vyhledávání: {e}")
        return jsonify([])

@app.route('/api/analyze', methods=['POST'])
def analyze():
    req_data = request.json
    ticker = req_data.get("ticker", "")
    wacc = float(req_data.get("wacc", 10)) / 100.0
    terminal_growth = float(req_data.get("terminalGrowth", 2.5)) / 100.0
    margin_safety = float(req_data.get("marginOfSafety", 20)) / 100.0
    
    # Custom overrides z UI (pokud existují)
    custom_fcf = req_data.get("customFcf")
    custom_rust1 = req_data.get("customRust1")
    custom_rust2 = req_data.get("customRust2")
    
    if not ticker:
        return jsonify({"error": "No ticker provided"}), 400

    try:
        # Použijeme Cache, aby AI nehádalo růstová čísla pokaždé jinak
        ticker_upper = ticker.upper()
        if ticker_upper in AI_CACHE:
            ai_data = AI_CACHE[ticker_upper].copy()
            print(f"Používám uložené AI odhady pro {ticker_upper} z paměti.")
        else:
            ai_data = ziskej_data_z_ai(ticker)
            AI_CACHE[ticker_upper] = ai_data.copy()
        
        # FIX: Přepíšeme AI halucinace REÁLNÝMI daty z trhu přes Yahoo Finance
        skutecny_ticker = ai_data.get("ticker", ticker_upper)
        try:
            print(f"Stahuji reálná tržní data pro ticker {skutecny_ticker} z Yahoo Finance...")
            yf_ticker = yf.Ticker(skutecny_ticker)
            info = yf_ticker.info
            
            # Nahrazení odhadů reálnými čísly
            if info.get("shortName"):
                ai_data["skutecny_nazev"] = info.get("shortName")
                
            cena = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
            if cena: ai_data["cena_akcie"] = cena
                
            if info.get("trailingEps"): ai_data["eps"] = info.get("trailingEps")
            
            if info.get("sharesOutstanding"): 
                ai_data["shares_outstanding"] = info.get("sharesOutstanding") / 1000000 # převod na miliony
                
            if info.get("freeCashflow"): 
                ai_data["fcf"] = info.get("freeCashflow") / 1000000
                
            if info.get("totalDebt"): 
                # Pro přesnost bychom odečetli i cash, ale totalDebt je dobrý výchozí bod
                cash = info.get("totalCash", 0)
                ai_data["net_debt"] = (info.get("totalDebt") - cash) / 1000000
                
            # Finanční zdraví (Buffettovy ukazatele) a Dividendy
            ai_data["dividend"] = info.get("dividendRate", 0)
            ai_data["roe"] = info.get("returnOnEquity", 0)
            ai_data["debt_to_equity"] = info.get("debtToEquity", 0) / 100 if info.get("debtToEquity") else 0 # Yahoo vrací např 150 pro 1.5
            ai_data["peg"] = info.get("pegRatio", 0)
            ai_data["current_ratio"] = info.get("currentRatio", 0)
            
            # Datum posledních dat
            mrq = info.get("mostRecentQuarter")
            if mrq:
                # Yahoo vrací unix timestamp
                ai_data["report_date"] = datetime.fromtimestamp(mrq).strftime('%d. %m. %Y')
            else:
                ai_data["report_date"] = "Neznámé datum"
                
        except Exception as e:
            print(f"Chyba při stahování Yahoo Finance dat: {e}. Použijí se odhady z AI.")
            
        # Aplikování uživatelských přepisů z frontendu, pokud je uživatel zadal
        if custom_fcf is not None:
            ai_data["fcf"] = float(custom_fcf)
        if custom_rust1 is not None:
            ai_data["rust_1_5"] = float(custom_rust1) / 100.0
        if custom_rust2 is not None:
            ai_data["rust_6_10"] = float(custom_rust2) / 100.0
        
        # Vypočítáme modely
        dcf_result = vypocet_dcf(ai_data, wacc, terminal_growth, margin_safety)
        graham_result = vypocet_graham(ai_data, margin_safety)
        lynch_result = vypocet_lynch(ai_data, margin_safety)
        ddm_result = vypocet_ddm(ai_data, wacc, margin_safety)
        
        # Sestavíme odpověď pro frontend
        result = {
            "ticker": ai_data.get("ticker", ticker_upper),
            "name": ai_data.get("skutecny_nazev", ticker_upper),
            "price": ai_data.get("cena_akcie", 0),
            "eps": ai_data.get("eps", 0),
            "fcf": ai_data.get("fcf", 0),
            "rust_1_5": ai_data.get("rust_1_5", 0) * 100, # převod zpět na % pro UI
            "rust_6_10": ai_data.get("rust_6_10", 0) * 100,
            
            "report_date": ai_data.get("report_date", "Neznámé datum"),
            
            # Finanční zdraví
            "dividend": ai_data.get("dividend", 0),
            "roe": ai_data.get("roe", 0) * 100, # jako %
            "debt_to_equity": ai_data.get("debt_to_equity", 0),
            "peg": ai_data.get("peg", 0),
            "current_ratio": ai_data.get("current_ratio", 0),
            
            # Aproximace P/E
            "pe": round(ai_data.get("cena_akcie", 0) / ai_data.get("eps", 1), 2) if ai_data.get("eps", 0) > 0 else 0,
            
            "dcfValue": dcf_result["value"],
            "dcfSafeValue": dcf_result["safe_value"],
            "grahamValue": graham_result["value"],
            "grahamSafeValue": graham_result["safe_value"],
            "lynchValue": lynch_result["value"],
            "lynchSafeValue": lynch_result["safe_value"],
            "ddmValue": ddm_result["value"],
            "ddmSafeValue": ddm_result["safe_value"]
        }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Chyba v API: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("Spouštím backendový server na http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
