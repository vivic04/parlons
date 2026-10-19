/* "Votre quartier" — a Parisian neighbourhood that builds itself as you earn XP. */
window.CITY = [
  {xp:0,    name:"Un terrain vide",                 emoji:"🚧", desc:"Tout commence ici. Gagnez de l'XP pour construire votre quartier."},
  {xp:40,   name:"Un réverbère et un banc",         emoji:"🪑", desc:"Un premier coin pour s'asseoir et réviser."},
  {xp:120,  name:"La boulangerie",                  emoji:"🥖", desc:"Le cœur de tout quartier français."},
  {xp:240,  name:"Le café",                         emoji:"☕", desc:"Avec sa terrasse, pour pratiquer l'oral."},
  {xp:400,  name:"Les maisons",                     emoji:"🏠", desc:"Des voisins arrivent."},
  {xp:600,  name:"La fontaine",                     emoji:"⛲", desc:"La place prend vie."},
  {xp:850,  name:"La bibliothèque",                 emoji:"📚", desc:"Pour la compréhension écrite."},
  {xp:1150, name:"Les immeubles haussmanniens",     emoji:"🏢", desc:"Balcons en fer forgé et toits en zinc."},
  {xp:1500, name:"La Seine et son pont",            emoji:"🌉", desc:"Le quartier s'ouvre sur le fleuve."},
  {xp:1900, name:"L'Arc de triomphe",               emoji:"🏛️", desc:"Un monument, déjà !"},
  {xp:2400, name:"Le bateau-mouche",                emoji:"⛴️", desc:"Il navigue sur la Seine."},
  {xp:3000, name:"La tour Eiffel",                  emoji:"🗼", desc:"Le niveau B2 n'est plus très loin."},
  {xp:3800, name:"La montgolfière",                 emoji:"🎈", desc:"Votre français prend de la hauteur."},
  {xp:5000, name:"Le feu d'artifice du 14 juillet", emoji:"🎆", desc:"Quartier terminé. Bravo !"}
];
window.cityStage = xp => { let s = 0; CITY.forEach((c,i) => { if (xp >= c.xp) s = i; }); return s; };

let citySvgN = 0;
window.citySVG = (stage, {night = false, fresh = -1, flag = false} = {}) => {
  const gid = "sky" + (++citySvgN);
  const W = night ? "#FFD66B" : "#A9C4DC";           // windows
  const roof = night ? "#3B4659" : "#5D6C85", iron = night ? "#2A3142" : "#3F4A5C";
  const g = (i, inner, cls = "") => stage >= i ? `<g class="${cls} ${fresh === i ? "pop" : ""}">${inner}</g>` : "";
  const win = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".6" fill="${W}"/>`;
  const river = night ? "#22345E" : "#4F86C9";

  const hb = (x, w, top, c) => {
    let s = `<rect x="${x+w-9}" y="${top-5}" width="4" height="7" fill="${roof}"/>
      <path d="M${x-1} ${top+10}L${x+3} ${top}H${x+w-3}L${x+w+1} ${top+10}Z" fill="${roof}"/>
      <rect x="${x}" y="${top+10}" width="${w}" height="${160-top}" fill="${c}"/>`;
    for (let y = top + 16; y < 156; y += 13) {
      for (let cx = x + 4; cx < x + w - 5; cx += 9) s += win(cx, y, 5, 8);
      s += `<line x1="${x+2}" y1="${y+9}" x2="${x+w-2}" y2="${y+9}" stroke="${iron}" stroke-width=".8"/>`;
    }
    return s;
  };
  const house = (x, w, top, peak, body, rc) => `<path d="M${x-2} ${top}L${x+w/2} ${peak}L${x+w+2} ${top}Z" fill="${rc}"/>
    <rect x="${x}" y="${top}" width="${w}" height="${170-top}" fill="${body}"/>${win(x+4, top+7, 6, 6)}${win(x+w-10, top+7, 6, 6)}
    <rect x="${x+w/2-3}" y="${162}" width="6" height="8" fill="${rc}"/>`;
  const burst = (cx, cy, col, delay) => { let s = ""; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6;
      s += `<line x1="${cx+Math.cos(a)*3}" y1="${cy+Math.sin(a)*3}" x2="${cx+Math.cos(a)*11}" y2="${cy+Math.sin(a)*11}" stroke="${col}" stroke-width="1.4" stroke-linecap="round"/>`; }
    return `<g class="fw" style="animation-delay:${delay}s">${s}</g>`; };

  return `<svg viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Votre quartier, étape ${stage + 1}">
  <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${night ? "#0B1330" : "#9FD3F2"}"/><stop offset="1" stop-color="${night ? "#34406E" : "#F4EEE1"}"/></linearGradient></defs>
  <rect width="360" height="220" fill="url(#${gid})"/>
  ${night
    ? `<circle cx="40" cy="36" r="10" fill="#F3EBD3"/><circle cx="45" cy="32" r="9" fill="#14204A"/>
       ${[[90,20],[150,14],[210,28],[250,12],[130,45],[340,22],[20,70],[180,60]].map(([x,y],i)=>`<circle class="tw" style="animation-delay:${i*.4}s" cx="${x}" cy="${y}" r="1" fill="#fff"/>`).join("")}`
    : `<circle cx="40" cy="36" r="11" fill="#FFD66B"/>
       <g class="cloud"><ellipse cx="0" cy="30" rx="16" ry="6" fill="#fff" opacity=".9"/><ellipse cx="10" cy="26" rx="10" ry="6" fill="#fff" opacity=".9"/></g>
       <g class="cloud" style="animation-delay:-30s;animation-duration:80s"><ellipse cx="0" cy="58" rx="20" ry="6" fill="#fff" opacity=".8"/><ellipse cx="-8" cy="54" rx="10" ry="6" fill="#fff" opacity=".8"/></g>`}
  <rect y="170" width="360" height="50" fill="${night ? "#4A4A60" : "#E5D8BB"}"/>
  <line x1="0" y1="170.5" x2="360" y2="170.5" stroke="${night ? "#2E2E40" : "#CBBB98"}"/>
  ${g(13, burst(150, 40, "#FFD66B", 0) + burst(225, 28, "#FF7A6E", .8) + burst(255, 70, "#9DB4FF", 1.6))}
  ${g(12, `<g class="balloon"><line x1="92" y1="50" x2="97" y2="62" stroke="#8B5E3C" stroke-width=".6"/><line x1="108" y1="50" x2="103" y2="62" stroke="#8B5E3C" stroke-width=".6"/>
     <ellipse cx="100" cy="40" rx="11" ry="13" fill="#D93B30"/><ellipse cx="100" cy="40" rx="4.5" ry="13" fill="#fff"/><ellipse cx="100" cy="40" rx="1.6" ry="13" fill="#2346C9"/>
     <rect x="96.5" y="61" width="7" height="5" rx="1" fill="#8B5E3C"/></g>`)}
  ${g(11, `<path d="M283 170Q296 122 302 62L303 32H307L308 62Q314 122 327 170H318Q305 142 292 170Z" fill="${night ? "#6E5A40" : "#8A6E4B"}"/>
     <rect x="288" y="127" width="34" height="3" fill="${night ? "#5A4932" : "#6F583A"}"/><rect x="296" y="92" width="18" height="2.5" fill="${night ? "#5A4932" : "#6F583A"}"/>
     <path d="M296 100L314 125M314 100L296 125M299 70L311 90M311 70L299 90" stroke="${night ? "#5A4932" : "#6F583A"}" stroke-width=".6"/>
     <line x1="305" y1="32" x2="305" y2="18" stroke="${night ? "#6E5A40" : "#8A6E4B"}" stroke-width="1.2"/>
     ${night ? [[300,60],[310,85],[295,115],[316,140],[289,160],[305,45]].map(([x,y],i)=>`<circle class="tw" style="animation-delay:${i*.3}s" cx="${x}" cy="${y}" r="1.1" fill="#FFE9A8"/>`).join("") : ""}`)}
  ${g(9, `<rect x="20" y="96" width="50" height="8" fill="#CDBF9C"/><rect x="22" y="104" width="46" height="66" fill="#DCCFB0"/>
     <path d="M37 170V140A8 8 0 0 1 53 140V170Z" fill="${night ? "#2B3150" : "#B9AA86"}"/><rect x="26" y="112" width="8" height="12" fill="#CDBF9C"/><rect x="56" y="112" width="8" height="12" fill="#CDBF9C"/>`)}
  ${g(7, hb(110, 34, 90, night ? "#B9AE98" : "#EADFC8") + hb(145, 32, 100, night ? "#ADA38E" : "#E2D3B5"))}
  ${g(6, `<rect x="176" y="164" width="60" height="6" fill="#D8CFBD"/><rect x="182" y="130" width="48" height="34" fill="${night ? "#CFC8B8" : "#EFE8D8"}"/>
     <path d="M178 130L206 114L234 130Z" fill="#E4DBC6"/>${[0,1,2,3,4].map(i=>`<rect x="${185+i*9.5}" y="132" width="4" height="32" fill="#F8F4EA" stroke="#D8CFBD" stroke-width=".4"/>`).join("")}
     <text x="206" y="127.5" font-size="3.6" text-anchor="middle" fill="#6B5E45" font-family="Georgia,serif">BIBLIOTHÈQUE</text>
     ${flag ? `<line x1="206" y1="114" x2="206" y2="101" stroke="#555" stroke-width=".7"/><rect x="206.3" y="101" width="3" height="5" fill="#2346C9"/><rect x="209.3" y="101" width="3" height="5" fill="#fff"/><rect x="212.3" y="101" width="3" height="5" fill="#D93B30"/>` : ""}`)}
  ${g(4, house(6, 24, 140, 126, "#E8A87C", "#A0523D") + house(32, 24, 144, 130, "#9FC1D9", "#4E6A86"))}
  ${g(2, `<rect x="58" y="130" width="50" height="6" fill="#6B4A3A"/><rect x="60" y="136" width="46" height="34" fill="#F3E6CB"/>
     <text x="83" y="142.5" font-size="4.4" text-anchor="middle" fill="#6B4A3A" font-family="Georgia,serif" font-weight="bold">BOULANGERIE</text>
     ${[0,1,2,3,4,5,6,7].map(i=>`<rect x="${60+i*5.75}" y="145" width="5.75" height="6" fill="${i%2?"#fff":"#D93B30"}"/>`).join("")}
     ${win(64, 154, 22, 12)}<path d="M67 162l6-4M72 163l7-5M78 163l6-4" stroke="#C8913F" stroke-width="1.6" stroke-linecap="round"/>
     <rect x="91" y="153" width="11" height="17" fill="#6B4A3A"/>`)}
  ${g(3, `<rect x="236" y="128" width="50" height="5" fill="#1F4237"/><rect x="238" y="133" width="46" height="37" fill="#2F5D50"/>
     <text x="261" y="140" font-size="5" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-weight="bold">CAFÉ</text>
     ${[0,1,2,3,4,5,6,7].map(i=>`<rect x="${238+i*5.75}" y="143" width="5.75" height="5" fill="${i%2?"#fff":"#3E7D68"}"/>`).join("")}
     ${win(242, 152, 16, 12)}${win(264, 152, 16, 12)}
     <line x1="295" y1="146" x2="295" y2="170" stroke="#555" stroke-width=".8"/><path d="M285 150L295 142L305 150Z" fill="#D93B30"/>
     <rect x="289" y="160" width="12" height="1.6" fill="#555"/><line x1="292" y1="161" x2="292" y2="170" stroke="#555" stroke-width=".7"/><line x1="298" y1="161" x2="298" y2="170" stroke="#555" stroke-width=".7"/>
     <rect x="307" y="162" width="9" height="1.4" fill="#555"/><line x1="311.5" y1="163" x2="311.5" y2="170" stroke="#555" stroke-width=".7"/>`)}
  ${g(1, `<rect x="139" y="129" width="2" height="41" fill="#2E3440"/><circle cx="140" cy="127" r="${night ? 5 : 3.5}" fill="${night ? "#FFD66B" : "#2E3440"}" ${night ? 'opacity=".95"' : ""}/>
     ${night ? '<circle cx="140" cy="127" r="14" fill="#FFD66B" opacity=".18"/>' : ""}
     <rect x="146" y="160" width="20" height="2.5" fill="#6B4A3A"/><rect x="146" y="155" width="20" height="2" fill="#6B4A3A"/>
     <line x1="148" y1="162" x2="148" y2="170" stroke="#2E3440"/><line x1="164" y1="162" x2="164" y2="170" stroke="#2E3440"/>`)}
  ${stage === 0 ? `<rect x="178" y="150" width="2.4" height="22" fill="#8B5E3C"/><rect x="160" y="140" width="40" height="14" rx="2" fill="#C8913F"/>
     <text x="180" y="149" font-size="5" text-anchor="middle" fill="#fff" font-family="Georgia,serif">Bientôt ici…</text>` : ""}
  ${g(5, `<rect x="175" y="180" width="30" height="7" rx="2" fill="#BFB6A3"/><rect x="177" y="180" width="26" height="2" fill="#8EC9F0"/>
     <rect x="188" y="172" width="4" height="8" fill="#BFB6A3"/><ellipse cx="190" cy="172" rx="8" ry="2" fill="#BFB6A3"/>
     <path class="jet" d="M190 171Q186 160 182 172M190 171Q194 160 198 172M190 171V161" stroke="#8EC9F0" stroke-width="1.2" fill="none" stroke-linecap="round"/>`)}
  ${g(8, `<rect y="194" width="360" height="3" fill="#A89B80"/><rect y="197" width="360" height="23" fill="${river}"/>
     <path d="M10 205h14M60 212h18M120 207h12M170 214h16" stroke="#fff" stroke-width=".8" opacity=".5" stroke-linecap="round"/>
     <rect x="205" y="188" width="115" height="32" fill="#CFC3A8"/><line x1="205" y1="187.5" x2="320" y2="187.5" stroke="#9C9077"/>
     ${[0,1,2].map(i=>{const cx=224+i*38;return `<path d="M${cx-15} 220V209A15 12 0 0 1 ${cx+15} 209V220Z" fill="${river}"/>`;}).join("")}`)}
  ${g(10, `<g class="boat"><path d="M0 207H44L39 214H5Z" fill="#F2F2F2"/><rect x="8" y="200" width="28" height="7" rx="1.5" fill="#2346C9"/>
     ${[11,17,23,29].map(x=>`<rect x="${x}" y="202" width="4" height="3" fill="${night ? "#FFD66B" : "#CFE0F5"}"/>`).join("")}<line x1="38" y1="207" x2="38" y2="199" stroke="#555" stroke-width=".6"/><rect x="38" y="199" width="4" height="2.5" fill="#D93B30"/></g>`)}
  ${g(1, `<g class="walker"><circle cx="0" cy="174" r="2.2" fill="#16213E"/><line x1="0" y1="176" x2="0" y2="183" stroke="#16213E" stroke-width="1.4"/>
     <line class="leg1" x1="0" y1="183" x2="-2" y2="188" stroke="#16213E" stroke-width="1.2"/><line class="leg2" x1="0" y1="183" x2="2" y2="188" stroke="#16213E" stroke-width="1.2"/>
     <rect x="1" y="177" width="3" height="4" fill="#C8913F"/></g>`)}
  </svg>`;
};
