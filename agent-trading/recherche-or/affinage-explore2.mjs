import { serie13 } from './fleches-v6-diag.mjs'; import { atrSerie } from '../front/or/fleches-terminal-v1.js'; import * as V7 from '../front/or/fleches-simples-v7.js';
const K=serie13(),A=atrSerie(K); const d=t=>new Date(t).toISOString().slice(5,16);
const i=K.findIndex(b=>b.t===Date.UTC(2026,10,1,23)); const a=A[i]; console.log(d(K[i].t),K[i].c,a);
let hi=-1e9,lo=1e9; for(let L=1;L<=48;L++){const b=K[i-L];hi=Math.max(hi,b.h);lo=Math.min(lo,b.l);console.log(L,d(b.t),hi.toFixed(1),lo.toFixed(1),(hi-lo).toFixed(1),1.5*a); if(hi-lo>1.5*a)break;}
console.log(V7.rebondApresBase(K,A,i,1));
