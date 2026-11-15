/* ═════════════ CORRESPONDANCES XTB ═════════════
   Tickers xStation (colonne « Ticker » de l'export) ↔ identifiants de l'appli. Seules les correspondances SÛRES sont écrites ; un ticker inconnu reste affiché tel quel, sans devinette. */
export const ID_DEPUIS_TICKER = Object.freeze({ GOLD: 'XAUUSD', SILVER: 'XAGUSD', US100: 'US100', US500: 'US500', BITCOIN: 'BTC', SOLANA: 'SOL', 'OIL.WTI': 'WTI', EURUSD: 'EURUSD', DXY: 'DXY', USDX: 'DXY' });
export const idDepuisTicker = t => ID_DEPUIS_TICKER[String(t || '').toUpperCase()] || null;
export const CLE_POSITIONS_OUVERTES = 'rayle_pf_ouvertes_v1';   // écrit par la fenêtre Portefeuille, lu par Couverture : [{ id, ticker, sens: 'BUY'|'SELL', volume, valeur, prixOuverture, stopLoss }]
