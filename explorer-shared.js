(function(global){
  const BAD_TERMS = [
    "toy","lego","figure","statue","sculpture","mascot","costume","cosplay","plush",
    "movie","film","jurassic park","jp","minecraft","game","animatronic","theme park",
    "ride","doll","fan art","parody","action figure"
  ];
  const FOSSIL_TERMS = [
    "fossil","holotype","paratype","specimen","skull","skeleton","mounted",
    "mount","cast","bone","bones","femur","vertebra","museum","exhibit","excavation",
    "track","footprint","ichnofossil","fossilised","fossilized","fossils"
  ];

  // CSV helpers (passes through art_url if present)
  function splitCSV(line){ const re=/(,)(?=(?:[^"]*"[^"]*")*[^"]*$)/g;
    return line.split(re).filter(x=>x!==",").map(v=>v.replace(/^"(.*)"$/,'$1').trim());
  }
  function csvToRows(text, requiredHeaders){
    const lines=text.split(/\r?\n/).filter(Boolean);
    const header=splitCSV(lines.shift());
    const headerLower=header.map(h=>h.toLowerCase());
    const ok=requiredHeaders.every(h=>headerLower.includes(h));
    if(!ok) return {ok:false,rows:[],header:[]};
    const idx=Object.fromEntries(headerLower.map((h,i)=>[h,i]));
    const rows=lines.map(ln=>{
      const c=splitCSV(ln), r={};
      requiredHeaders.forEach(h=>r[h]= (c[idx[h]]||"").trim());
      ["art_url"].forEach(opt=>{ if(idx[opt]!=null) r[opt]=(c[idx[opt]]||"").trim(); });
      return r;
    }).filter(r=>r[requiredHeaders[0]]);
    return {ok:true,rows,header:headerLower};
  }

  function parseRange(str){
    if(!str) return null;
    const m=String(str).replace(/[^0-9–\-\.]/g,"").split("–");
    if(m.length!==2) return null;
    let a=parseFloat(m[0]), b=parseFloat(m[1]);
    if(isNaN(a)||isNaN(b)) return null;
    if(a<b) [a,b]=[b,a];
    return {start:a,end:b};
  }
  function colorFor(str){
    str=String(str||"");
    let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))%360;
    return `hsl(${h},70%,60%)`;
  }
  const Periods=[
    {label:"Triassic", start:230, end:201},
    {label:"Jurassic", start:201, end:145},
    {label:"Cretaceous", start:145, end:66}
  ];

  function looksPaleoart(text){
    const s=(text||"").toLowerCase();
    if (BAD_TERMS.some(t=>s.includes(t))) return false;
    return ["life restoration","restoration","paleoart","reconstruction","illustration","painting","drawn","digital art","artwork"].some(k=>s.includes(k));
  }
  function looksFossilOrMount(text){
    const s=(text||"").toLowerCase();
    return FOSSIL_TERMS.some(t=>s.includes(t));
  }

  const FALLBACK_SVG = 'data:image/svg+xml;utf8,'+encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#172448"/><stop offset="1" stop-color="#0b1330"/></linearGradient></defs>
      <rect width="640" height="420" fill="url(#g)"/>
      <g fill="#7aa2ff" opacity=".9">
        <path d="M60,320 Q240,180 360,260 Q440,300 580,290 Q520,330 450,340 Q360,350 280,330 Q200,310 120,350 Z"/>
      </g>
    </svg>`);

  async function imageURLFromFilePage(url){
    try{
      const m = url.match(/^(https?:\/\/[^\/]+)\/wiki\/File:(.+)$/i);
      if(!m) return null;
      const host = m[1];
      const title = "File:" + decodeURIComponent(m[2]);
      const qs = new URLSearchParams({
        action:'query', format:'json', origin:'*',
        titles:title, prop:'imageinfo',
        iiprop:'url|mime|size',
        iiurlwidth:'800'
      });
      const r = await fetch(`${host}/w/api.php?${qs}`);
      if(!r.ok) throw 0;
      const data = await r.json();
      const page = Object.values(data?.query?.pages||{})[0];
      const info = page?.imageinfo?.[0];
      const direct = info?.thumburl || info?.url || null;
      if(direct) return direct;
      return `${host}/wiki/Special:FilePath/${encodeURIComponent(title.replace(/^File:/,''))}?width=800`;
    }catch{
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(url.split('/wiki/File:')[1]||'')}`;
    }
  }

  async function commonsLifeRestoration(genus){
    const qs = new URLSearchParams({
      action:'query', format:'json', origin:'*',
      generator:'categorymembers', gcmtitle:`Category:Life restorations of ${genus}`,
      gcmtype:'file', gcmlimit:'20',
      prop:'imageinfo|info', inprop:'url',
      iiprop:'url|size|mime', iiurlwidth:'800'
    });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${qs}`);
    if(!r.ok) return [];
    const data = await r.json();
    const pages = data?.query?.pages || {};
    return Object.values(pages).map(p => ({
      title:p.title,
      url:p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url || null,
      mime:p.imageinfo?.[0]?.mime || "",
      width:p.imageinfo?.[0]?.width || 0,
      height:p.imageinfo?.[0]?.height || 0
    }));
  }

  async function commonsSearchPaleoart(genus){
    const qs = new URLSearchParams({
      action:'query', format:'json', origin:'*',
      generator:'search', gsrsearch:`filetype:bitmap ${genus} (life restoration OR paleoart OR reconstruction OR illustration)`,
      gsrlimit:'40',
      prop:'imageinfo|info', inprop:'url',
      iiprop:'url|size|mime', iiurlwidth:'800'
    });
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${qs}`);
    if(!r.ok) return [];
    const data = await r.json();
    const pages = data?.query?.pages || {};
    return Object.values(pages).map(p => ({
      title:p.title,
      url:p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url || null,
      mime:p.imageinfo?.[0]?.mime || "",
      width:p.imageinfo?.[0]?.width || 0,
      height:p.imageinfo?.[0]?.height || 0
    }));
  }

  function pickBestArt(cands){
    return cands
      .filter(c => c.url && /^image\/(jpeg|png|gif|webp|svg)/.test(c.mime || "image/jpeg"))
      .filter(c => !looksFossilOrMount(c.title))
      .filter(c => looksPaleoart(c.title))
      .map(c => {
        let score = 0;
        score += Math.min(((c.width||0)*(c.height||0))/120000, 50);
        if (/\blife restoration\b/i.test(c.title)) score += 15;
        return {...c, score};
      })
      .sort((a,b)=>b.score-a.score)[0]?.url || null;
  }

  async function resolvePaleoartImage(rec){
    if (rec.art_url && /^https?:\/\//i.test(rec.art_url)) {
      if (/\/wiki\/File:/i.test(rec.art_url)) {
        const direct = await imageURLFromFilePage(rec.art_url);
        if (direct) return direct;
      }
      if (/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(rec.art_url)) return rec.art_url;
    }
    try { const a = pickBestArt(await commonsLifeRestoration(rec.genus)); if (a) return a; } catch {}
    try { const b = pickBestArt(await commonsSearchPaleoart(rec.genus)); if (b) return b; } catch {}
    return FALLBACK_SVG;
  }

  function debounce(fn,ms=150){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

  global.Explorer = { splitCSV, csvToRows, parseRange, colorFor, Periods, resolvePaleoartImage, debounce };
})(window);
