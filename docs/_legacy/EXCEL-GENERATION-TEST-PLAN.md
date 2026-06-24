# Excel / Spreadsheet Generation — First-Time-User Test Plan (Desktop + Web)

_Tests whether Madav can correctly BUILD spreadsheet (.xlsx) files when you ask. Written for a first-time user. Last updated 18 June 2026._

## What you're testing
That when you ask Madav to make a spreadsheet — a simple table, one with formulas, several tabs, formatting, a chart, or a full report from data — it **produces a real .xlsx file that opens correctly in Excel** and contains what you asked for.

👉 Where spreadsheets come from:
- **In any chat**, ask for a spreadsheet → a **spreadsheet card with Open / Download** appears once the assistant finishes.
- **In Let's Collaborate or a Project** (with a folder), ask it to build a report → the **.xlsx is saved into your folder**, with an Open / Download card.

👉 Do each test on **desktop and web** and note any difference.

## Before you start
1. A model is selected (for best results, a capable model).
2. For the "report from data" test, have a **folder (or Project) with a small data file** in it (a CSV or another spreadsheet).
3. Know where downloads land (web) or where your working folder is (desktop), so you can open the file.

---

## The tests

**Test E1 — Simple table**
- **Steps:** In a chat, send the example.
- **Example:** `Create an Excel spreadsheet listing 5 fruits in column A and their price per kilo in column B.`
- **✅ Pass:** a spreadsheet card appears with **Open / Download**; opening it shows the 5 fruits and prices in a clean table.
- **❌ Problem:** no file/card, the file won't open, or the data is wrong/missing.

**Test E2 — Formulas that actually calculate**
- **Example:** `Make an Excel budget with 6 expense rows and a Total row that automatically adds up the amounts.`
- **✅ Pass:** the Total cell holds a real **formula** (e.g. =SUM(...)) — change a number in Excel and the total updates by itself.
- **❌ Problem:** the total is a typed-in number that doesn't recalculate, or it's wrong.

**Test E3 — Multiple sheets (tabs)**
- **Example:** `Create an Excel workbook with two tabs: "Income" and "Expenses", each with a small sample table.`
- **✅ Pass:** the file opens with **two tabs** named correctly, each with its table.
- **❌ Problem:** only one tab, wrong names, or missing data.

**Test E4 — Formatting**
- **Example:** `Make a spreadsheet of 4 products with a bold header row, prices shown as currency, and sensible column widths.`
- **✅ Pass:** header is **bold**, the price column shows as **currency**, columns are readable.
- **❌ Problem:** no formatting, or it looks broken.

**Test E5 — Build a report from data** _(the important one)_
- **Steps:** Open **Let's Collaborate** or a **Project** linked to a folder that contains a small data file. Then send the example.
- **Example:** `Using the data in this folder, build a summary report for March as an Excel file and save it here.`
- **✅ Pass:** it inspects the data, builds the report, and a **saved .xlsx appears in your folder** with an Open / Download card; the numbers are correct.
- **❌ Problem:** it stalls with no file, saves a broken file, or the numbers are wrong.

**Test E6 — From existing data (CSV → Excel)**
- **Steps:** Attach a small CSV (or point to one in your folder), then send the example.
- **Example:** `Turn this data into a nicely formatted Excel spreadsheet with a header row and a totals row.`
- **✅ Pass:** the data is converted into a clean, formatted .xlsx.
- **❌ Problem:** it ignores the data or produces an empty/garbled file.

**Test E7 — A chart in the spreadsheet** _(if supported by your model)_
- **Example:** `Create an Excel spreadsheet of monthly sales for Jan–Jun and add a bar chart of the figures.`
- **✅ Pass:** the file opens with the data **and a chart**.
- **❌ Problem:** no chart, or the chart is empty/broken. _(If your model can't do charts, note it — not necessarily a bug.)_

**Test E8 — Works on a basic/weak model too** _(the protected capability)_
- **Steps:** Select a simpler/free model, then repeat **Test E5** (build a report in a folder).
- **✅ Pass:** even the basic model produces a correct saved .xlsx with an Open / Download card.
- **❌ Problem:** it produces nothing, or loops without saving a file. _(This is the most important "do not break" case — flag it clearly.)_

**Test E9 — Open and Download buttons work**
- **Steps:** On any spreadsheet card from the tests above, click **Open**, then **Download**.
- **✅ Pass:** **Open** opens the file (in Excel on desktop / your viewer on web); **Download** saves a copy you can find.
- **❌ Problem:** a button does nothing, or opens a broken file.

**Test E10 — Desktop vs web behave correctly**
- **✅ Pass:** **Desktop** saves into your folder and opens in Excel; **Web** downloads the .xlsx to your browser's downloads. **Both produce a valid file with the same contents.**
- **❌ Problem:** one side makes a broken file, or the two differ in content.

---

## Results table

| Test | Desktop ✅/❌ | Web ✅/❌ | Same on both? | Notes |
|------|:---:|:---:|:---:|-------|
| E1 Simple table | | | | |
| E2 Formulas calculate | | | | |
| E3 Multiple tabs | | | | |
| E4 Formatting | | | | |
| E5 Report from data | | | | |
| E6 CSV → Excel | | | | |
| E7 Chart | | | | |
| E8 Basic model works | | | | |
| E9 Open/Download buttons | | | | |
| E10 Desktop vs web valid | | | | |

---

## If something fails
Note: **which test (E#)**, **desktop or web**, **what you typed**, and **what you got** (attach the broken .xlsx if you can). I'll fix it — and I'll also run the automated tests on the spreadsheet engine from my side so we catch issues both ways.
