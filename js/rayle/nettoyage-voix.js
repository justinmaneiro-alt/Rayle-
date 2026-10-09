"use strict";
  /* ═════════════ NETTOYAGE DU TEXTE POUR LA VOIX ═════════════ */
  function clean(t){
    return String(t||'')
      .replace(/```[\s\S]*?```/g,' ')
      .replace(/```[\s\S]*$/,' ')                       // bloc de code coupé en cours de route
      .replace(/https?:\/\/\S+/g,' ')
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'')
      .replace(/[  ]/g,' ')
      .replace(/(\d)\.(\d)/g,'$1,$2')                   // décimales à la française
      .replace(/(\d)\s?°\s?C\b/g,'$1 degrés').replace(/°\s?C\b/g,' degrés').replace(/°/g,' degrés')
      .replace(/\bkm\/h\b/gi,' kilomètres par heure')
      .replace(/(\d)\s?mm\b/g,'$1 millimètres')
      .replace(/≈/g,' environ ').replace(/×/g,' fois ').replace(/÷/g,' divisé par ').replace(/\s=\s/g,' égale ')
      .replace(/(\d)\s?\+\s?(\d)/g,'$1 plus $2')
      .replace(/(^|[\s(])\+\s?(\d)/g,'$1plus $2')
      .replace(/%/g,' pour cent').replace(/€/g,' euros').replace(/\$/g,' dollars').replace(/&/g,' et ')
      .replace(/[*_`#~>|\\^=+<>{}\[\]]/g,' ')
      .replace(/[«»"“”„]/g,'')
      .replace(/[()]/g,', ')
      .replace(/\s[-–—]+\s/g,', ')
      .replace(/\s+,/g,',').replace(/,\s*,+/g,',')
      .replace(/\s+/g,' ').trim();
  }
