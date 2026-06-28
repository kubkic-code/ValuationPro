import os
import json
from datetime import datetime
import requests
from flask import Flask, request, jsonify, send_from_directory
from groq import Groq
import yfinance as yf
from dotenv import load_dotenv

# Načtení proměnných prostředí z .env souboru (pokud existuje)
load_dotenv()

# NASTAVENÍ A INICIALIZACE
app = Flask(__name__, static_folder='.')

# Načtení API klíče ze systémových proměnných
API_KEY = os.environ.get("GROQ_API_KEY")
if not API_KEY:
    raise ValueError("Chybí GROQ_API_KEY v proměnných prostředí. Vytvořte soubor .env nebo nastavte systémovou proměnnou.")
client = Groq(api_key=API_KEY)

# Cache pro AI odpovědi, abychom zamezili neustálým změnám odhadů (halucinacím)
AI_CACHE = {}

def ziskej_data_z_ai(nazev_firmy):
    prompt = f"""
    Uživatel zadal název firmy takto: "{nazev_firmy}". Zadaný název může obsahovat hrubé překlepy.
    Ignoruj překlepy, zjisti o jakou reálnou firmu se jedná a zjisti její burzovní ticker (u Berkshire Hathaway preferuj BRK.B).
    
    Tvá nejdůležitější role je analyzovat typ firmy pro náš oceňovací model:
    Kategorie A: Technologické a růstové firmy (např. Nvidia, ASML, Alphabet). Hodnota je v růstu.
    Kategorie B: Klasické hodnotové firmy a stabilní giganti (např. McDonald's, Coca-Cola, P&G, Johnson & Johnson). Stabilní růst, obří cashflow, silná značka.
    Kategorie C: Těžký průmysl, komodity, automobilky, banky, těžaři (např. Volkswagen, JPMorgan). Růst je cyklický a nepředvídatelný.

    Dále urči doporučenou diskontní míru (WACC) podle rizikovosti:
    0.08 = Superstabilní monopolní giganti (Apple, ASML, Microsoft)
    0.10 = Standardní zdravé firmy z indexu S&P 500
    0.12 = Rizikovější, malé nebo silně zadlužené firmy

    Požadovaná data (odhadni, pokud neznáš přesně):
    1. Aktuální tržní cena akcie
    2. Výchozí Free Cash Flow (FCF) v milionech
    3. Očekávaný růst 1-5 let: Vezmi konsenzus analytiků pro růst zisků a VYNÁSOB HO KOEFICIENTEM 0.8 (20% bezpečnostní srážka). Vrať desetinné číslo.
    4. Čistý dluh v milionech
    5. Počet akcií v oběhu v milionech
    6. Čistý zisk na akcii (EPS TTM)
    7. Book Value Per Share (BVPS) - účetní hodnota na akcii (velmi důležité pro Kategorii C)
    8. Historické průměrné P/E za posledních 5 let
    9. Zadej Kategorii Firmy jako řetězec: "A", "B", nebo "C"
    10. Doporučené WACC (0.08, 0.10, nebo 0.12)

    Odpověz STRIKTNĚ ve formátu JSON s těmito klíči:
    {{
        "skutecny_nazev": "",
        "ticker": "",
        "kategorie": "A",
        "wacc": 0.10,
        "cena_akcie": 0.0,
        "fcf": 0.0,
        "rust_1_5": 0.0,
        "net_debt": 0.0,
        "shares_outstanding": 0.0,
        "eps": 0.0,
        "bvps": 0.0,
        "historical_pe": 0.0
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
    Výpočet DCF.
    """
    try:
        fcf = float(data.get("fcf", 0))
        rust_1 = float(data.get("rust_1_5", 0))
        rust_2 = terminal_growth # Pevně uzamčeno
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

import math

def vypocet_graham(data, margin_of_safety=0.20):
    """
    Výpočet podle Benjamina Grahama (Grahamovo číslo). V = sqrt(22.5 * EPS * BVPS)
    """
    try:
        eps = float(data.get("eps", 0))
        bvps = float(data.get("bvps", 0))
        
        if eps <= 0 or bvps <= 0:
            return {"value": 0, "safe_value": 0}
            
        intrinsic_value = math.sqrt(22.5 * eps * bvps)
        
        return {
            "value": intrinsic_value,
            "safe_value": intrinsic_value * (1 - margin_of_safety)
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

def vypocet_historical_pe(data, margin_of_safety=0.20):
    """
    Ocenění pomocí Historického P/E (pro Typ C firmy)
    Hodnota = EPS * Historické P/E
    """
    try:
        eps = float(data.get("eps", 0))
        pe = float(data.get("historical_pe", 0))
        
        if eps <= 0 or pe <= 0:
            return {"value": 0, "safe_value": 0}
            
        intrinsic_value = eps * pe
        
        return {
            "value": max(0, intrinsic_value),
            "safe_value": max(0, intrinsic_value * (1 - margin_of_safety))
        }
    except Exception as e:
        print("Chyba při výpočtu Historického P/E:", e)
        return {"value": 0, "safe_value": 0}

# --- ROUTES ---

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@app.route('/api/test_yf')
def test_yf():
    import yfinance as yf
    info = yf.Ticker("PAH3.DE").info
    return jsonify({
        "shortName": info.get("shortName"),
        "longName": info.get("longName"),
        "has_info": bool(info)
    })

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
                    "name": q['shortname'],
                    "exchange": q.get('exchDisp') or q.get('exchange', '')
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
        skutecny_ticker = ticker_upper
        try:
            print(f"Stahuji reálná tržní data pro ticker {skutecny_ticker} z Yahoo Finance...")
            yf_ticker = yf.Ticker(skutecny_ticker)
            info = yf_ticker.info
            
            # Pokud zadaný ticker zřejmě neexistuje, zkusíme ten od AI
            if not info or not info.get("shortName"):
                skutecny_ticker = ai_data.get("ticker", ticker_upper)
                print(f"Původní ticker selhal, zkouším AI odhadovaný ticker {skutecny_ticker}...")
                yf_ticker = yf.Ticker(skutecny_ticker)
                info = yf_ticker.info
                
            if not info or not info.get("shortName"):
                raise ValueError(f"Akcie s tickerem '{ticker_upper}' nebyla nalezena. Zkontrolujte, zda je symbol správný.")

            ai_data["ticker"] = skutecny_ticker
            
            # Nahrazení odhadů reálnými čísly
            if info.get("shortName"):
                ai_data["skutecny_nazev"] = info.get("shortName")
                
            cena = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose")
            if cena: ai_data["cena_akcie"] = cena
                
            if info.get("trailingEps"): ai_data["eps"] = info.get("trailingEps")
            
            if info.get("sharesOutstanding"): 
                ai_data["shares_outstanding"] = info.get("sharesOutstanding") / 1000000 # převod na miliony
                
            yf_fcf = info.get("freeCashflow")
            if yf_fcf is not None and yf_fcf > 0: 
                ai_data["fcf"] = yf_fcf / 1000000
                
            if info.get("totalDebt"): 
                # Pro přesnost bychom odečetli i cash, ale totalDebt je dobrý výchozí bod
                cash = info.get("totalCash", 0)
                ai_data["net_debt"] = (info.get("totalDebt") - cash) / 1000000
                
            if info.get("bookValue"):
                ai_data["bvps"] = info.get("bookValue")
            
            if not ai_data.get("historical_pe") and info.get("trailingPE"):
                ai_data["historical_pe"] = info.get("trailingPE")
                
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
            
            ai_data["currency"] = info.get("currency", "USD")
                
        except Exception as e:
            print(f"Chyba při stahování Yahoo Finance dat: {e}. Použijí se odhady z AI.")
            
        # Konverze měn
        target_currency = req_data.get("targetCurrency", "ORIGINAL")
        if target_currency and target_currency != "ORIGINAL" and ai_data.get("currency") and target_currency != ai_data.get("currency"):
            try:
                base_curr = ai_data["currency"]
                pair = f"{base_curr}{target_currency}=X"
                rate_ticker = yf.Ticker(pair)
                rate = rate_ticker.info.get("currentPrice") or rate_ticker.info.get("regularMarketPrice") or rate_ticker.info.get("previousClose")
                
                if rate:
                    if "cena_akcie" in ai_data: ai_data["cena_akcie"] *= rate
                    if "fcf" in ai_data: ai_data["fcf"] *= rate
                    if "net_debt" in ai_data: ai_data["net_debt"] *= rate
                    if "eps" in ai_data: ai_data["eps"] *= rate
                    if "bvps" in ai_data: ai_data["bvps"] *= rate
                    if "dividend" in ai_data: ai_data["dividend"] *= rate
                    ai_data["currency"] = target_currency
            except Exception as e:
                print(f"Chyba při konverzi měn: {e}")
            
        # Aplikování uživatelských přepisů z frontendu, pokud je uživatel zadal
        if custom_fcf is not None:
            ai_data["fcf"] = float(custom_fcf)
        if custom_rust1 is not None:
            ai_data["rust_1_5"] = float(custom_rust1) / 100.0
        if custom_rust2 is not None:
            ai_data["rust_6_10"] = float(custom_rust2) / 100.0
            
        custom_kategorie = req_data.get("customKategorie")
        if custom_kategorie and custom_kategorie in ["A", "B", "C"]:
            ai_data["kategorie"] = custom_kategorie
            
        # Vypočítáme modely
        dcf_result = vypocet_dcf(ai_data, wacc, terminal_growth, margin_safety)
        graham_result = vypocet_graham(ai_data, margin_safety)
        lynch_result = vypocet_lynch(ai_data, margin_safety)
        hist_pe_result = vypocet_historical_pe(ai_data, margin_safety)
        
        # Triangulace - Vážený průměr
        kategorie = ai_data.get("kategorie", "B").upper().strip()
        if kategorie not in ["A", "B", "C"]: kategorie = "B"

        blended_value = 0
        graham_failed = graham_result["value"] <= 0

        if kategorie == "A":
            blended_value = 0.70 * dcf_result["value"] + 0.30 * lynch_result["value"]
        elif kategorie == "B":
            if graham_failed:
                # Krizové pravidlo: Grahamova váha (30 %) přelita na Historické P/E
                blended_value = 0.50 * dcf_result["value"] + 0.20 * lynch_result["value"] + 0.30 * hist_pe_result["value"]
            else:
                blended_value = 0.50 * dcf_result["value"] + 0.20 * lynch_result["value"] + 0.30 * graham_result["value"]
        elif kategorie == "C":
            if graham_failed:
                # Krizové pravidlo: Grahamova váha (60 %) přelita na Historické P/E
                blended_value = hist_pe_result["value"]
            else:
                blended_value = 0.60 * graham_result["value"] + 0.40 * hist_pe_result["value"]
            
        blended_safe_value = blended_value * (1 - margin_safety)
        
        # Sestavíme odpověď pro frontend
        result = {
            "ticker": ai_data.get("ticker", ticker_upper),
            "name": ai_data.get("skutecny_nazev", ticker_upper),
            "kategorie": kategorie,
            "recommended_wacc": ai_data.get("wacc", 0.10) * 100,
            "currency": ai_data.get("currency", "USD"),
            "price": ai_data.get("cena_akcie", 0),
            "eps": ai_data.get("eps", 0),
            "fcf": ai_data.get("fcf", 0),
            "rust_1_5": ai_data.get("rust_1_5", 0) * 100, # převod zpět na % pro UI
            "rust_6_10": 2.5, # Zafixováno
            
            "report_date": ai_data.get("report_date", "Neznámé datum"),
            
            # Finanční zdraví
            "dividend": ai_data.get("dividend", 0),
            "roe": ai_data.get("roe", 0) * 100, # jako %
            "debt_to_equity": ai_data.get("debt_to_equity", 0),
            "peg": ai_data.get("peg", 0),
            "current_ratio": ai_data.get("current_ratio", 0),
            
            # Aproximace P/E
            "pe": round(ai_data.get("cena_akcie", 0) / ai_data.get("eps", 1), 2) if ai_data.get("eps", 0) > 0 else 0,
            
            "blendedValue": blended_value,
            "blendedSafeValue": blended_safe_value,
            
            "dcfValue": dcf_result["value"],
            "dcfSafeValue": dcf_result["safe_value"],
            "grahamValue": graham_result["value"],
            "grahamSafeValue": graham_result["safe_value"],
            "lynchValue": lynch_result["value"],
            "lynchSafeValue": lynch_result["safe_value"],
            "histPeValue": hist_pe_result["value"],
            "histPeSafeValue": hist_pe_result["safe_value"]
        }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Chyba v API: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/market-health', methods=['GET'])
def get_market_health():
    """Vrátí aktuální data o stavu trhu (VIX a S&P 500 P/E)"""
    try:
        # VIX
        vix_ticker = yf.Ticker("^VIX")
        vix_hist = vix_ticker.history(period="1d")
        vix_value = vix_hist['Close'].iloc[-1] if not vix_hist.empty else 20.0

        # SPY (S&P 500 ETF) P/E
        spy = yf.Ticker("SPY")
        spy_pe = spy.info.get('trailingPE')
        if not spy_pe:
            spy_pe = 22.0 # Očekávaný hrubý průměr jako fallback

        return jsonify({
            "vix": round(float(vix_value), 2),
            "spy_pe": round(float(spy_pe), 2)
        })
    except Exception as e:
        print(f"Chyba při stahování market health: {e}")
        # Bezpečný fallback, pokud by yfinance z nějakého důvodu selhalo
        return jsonify({"vix": 20.0, "spy_pe": 22.0}), 200

if __name__ == '__main__':
    print("Spouštím backendový server na http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
