// Verificación de ficha.html y listado.html en Chromium real.
// Comprueba los cinco cambios del 30 de julio de 2026 y saca capturas.
// 30/07/2026 (tarde): añade el desplegable de Personajes, la omisión de los
// rótulos de CUADRO (integrados en su acto) y el rótulo «Actos II y III».
// ACTUALIZAR OBRAS_ESPERADAS tras escribir cada tanda de reescritura.
const OBRAS_ESPERADAS = 327;
const {chromium} = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const MIME = {'.html':'text/html','.js':'application/javascript','.css':'text/css'};
const srv = http.createServer((req,res)=>{
  const f = path.join('/tmp/work', decodeURIComponent(req.url.split('?')[0]));
  if(!fs.existsSync(f)){ res.writeHead(404); return res.end('no'); }
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'text/plain'});
  res.end(fs.readFileSync(f));
});

let fallos = 0, avisos = 0;
const ok  = (c,m)=>{ if(!c){ fallos++; console.log('  ✗ FALLO  '+m); } else console.log('  ✓ '+m); };
const nota = m => { avisos++; console.log('  · '+m); };

(async () => {
  await new Promise(r=>srv.listen(8099,r));
  const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const pg = await b.newPage({viewport:{width:1100,height:1400}});
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  const go = async u => { await pg.goto('http://localhost:8099/'+u,{waitUntil:'load'}); await pg.waitForTimeout(120); };
  const clic = async sel => { await Promise.all([pg.waitForNavigation({waitUntil:'load'}), pg.click(sel)]); await pg.waitForTimeout(120); };

  // ---------- FICHA: obra con actos y varios compositores ----------
  console.log('\n=== ficha.html?id=benamor (números por actos) ===');
  await go('ficha.html?id=benamor');
  const h2s = await pg.$$eval('#fBody h2', ns=>ns.map(n=>n.textContent));
  console.log('  bloques:', h2s.join(' / '));
  ok(!h2s.includes('Autoría'), '1. no hay bloque «Autoría»');
  ok(await pg.$$eval('#fBody details', n=>n.length)===0, '1. no quedan biografías desplegables');
  ok(await pg.$$eval('.genero', n=>n.length)===0, '2. no se pinta el género bajo el título');
  const iP = h2s.indexOf('Personajes'), iA = h2s.indexOf('Argumento');
  ok(iP>=0 && iA>=0 && iP<iA, '4. Personajes va encima del Argumento');

  // 3. enlaces
  const chipLinks = await pg.$$eval('.chip a', as=>as.map(a=>({t:a.textContent,h:a.getAttribute('href')})));
  console.log('  enlaces de la cabecera:'); chipLinks.forEach(l=>console.log(`      ${l.t}  ->  ${l.h}`));
  ok(chipLinks.some(l=>l.h.includes('tipo=persona')), '3. compositor/libretista enlazan a listado.html?tipo=persona');
  ok(chipLinks.some(l=>l.h.includes('tipo=anio')), '3. el año enlaza a listado.html?tipo=anio');
  ok(chipLinks.some(l=>l.h.includes('tipo=teatro')), '3. el teatro enlaza a listado.html?tipo=teatro');
  const estreno = await pg.$eval('.chips-row:nth-of-type(3) .chip', e=>e.textContent);
  console.log('  chip de estreno:', JSON.stringify(estreno));
  // el teatro se rotula con nombre canónico + ciudad entre paréntesis
  const teatroTxt = await pg.$eval('.chip a[href*="tipo=teatro"]', a=>a.textContent);
  const teatroEsp = await pg.evaluate(()=>{
    const o=OBRAS.find(x=>x.id==='benamor'), t=TEATROS.find(x=>x.k===o.teatroK);
    return t.n+' ('+t.c+')';
  });
  console.log('  rótulo del teatro:', JSON.stringify(teatroTxt));
  ok(teatroTxt===teatroEsp, `3. el teatro se rotula «nombre (ciudad)»: ${teatroTxt}`);
  ok(/\([^)]+\)$/.test(teatroTxt), '3. la ciudad va entre paréntesis al final del rótulo');

  // 4. personajes en columna
  const pers = await pg.$$eval('.personajes li', ls=>ls.map(l=>({
    txt:l.textContent,
    voz:(l.querySelector('.pv')||{}).textContent||null,
    italic:l.querySelector('.pv')?getComputedStyle(l.querySelector('.pv')).fontStyle:null,
    display:getComputedStyle(l).display
  })));
  console.log('  primeros personajes:'); pers.slice(0,5).forEach(p=>console.log('      '+JSON.stringify(p.txt)));
  ok(await pg.$$eval('.personajes', e=>getComputedStyle(e[0]).display==='block'), '4. la lista es columna, no rejilla de cuadritos');
  ok(pers.filter(p=>p.voz).every(p=>/^\(.*\)$/.test(p.voz.trim())), '4. la voz va entre paréntesis');
  ok(pers.filter(p=>p.voz).every(p=>p.italic==='italic'), '4. la voz va en cursiva');

  // 5. números por actos
  const grupos = await pg.$$eval('.acto-grupo', gs=>gs.map(g=>({
    tit:(g.querySelector('.acto-tit')||{}).textContent||'(sin título)',
    n:g.querySelectorAll('li').length
  })));
  console.log('  grupos de números:', JSON.stringify(grupos));
  ok(grupos.length>1, '5. los números se agrupan por actos');
  const totalNum = grupos.reduce((s,g)=>s+g.n,0);
  const esperados = await pg.evaluate(()=>OBRAS.find(o=>o.id==='benamor').num.filter(n=>!n.h).length);
  ok(totalNum===esperados, `5. no se pierde ni se duplica ningún número (${totalNum}/${esperados})`);
  await pg.screenshot({path:'_cap_ficha_benamor.png', fullPage:true});

  // ---------- FICHA: obra en un acto, rotulada «Acto único» (5-8-2026) ----------
  // Hasta el 5-8-2026 esta obra servía de ejemplo de ficha SIN cabecera de acto.
  // César pidió que toda obra en un acto rotulara «Acto único» en el argumento y
  // en los números musicales, así que ahora el caso que se comprueba es el
  // contrario: que la cabecera está y está bien escrita (minúscula, con tilde).
  console.log('\n=== ficha.html?id=al-agua-patos («Acto único», sin «(conjunto)» y voces vacías) ===');
  await go('ficha.html?id=al-agua-patos');
  const g2 = await pg.$$eval('.acto-grupo', gs=>gs.map(g=>({tit:(g.querySelector('.acto-tit')||{}).textContent||'(sin título)',n:g.querySelectorAll('li').length})));
  console.log('  grupos:', JSON.stringify(g2));
  ok(g2.length===1 && g2[0].tit==='Acto único', '5. la obra en un acto rotula «Acto único» en los números musicales');
  const tit2 = await pg.$eval('h1', h=>h.textContent.trim());
  ok(tit2.startsWith('¡Al agua patos!'), '1. el título lleva el signo de apertura: «¡Al agua patos!»');
  const p2 = await pg.$$eval('.personajes li', ls=>ls.map(l=>l.textContent));
  console.log('  personajes:', p2.length);
  console.log('  muestra:', JSON.stringify(p2.slice(0,4)), '...', JSON.stringify(p2.slice(-3)));
  // 15-8-2026 (decisión de César): «(conjunto)» deja de ser un tipo de voz. La columna de
  // voz solo admite cuerdas de cantante y actor/actriz, y col15 no lleva paréntesis.
  // Hasta hoy aquí se comprobaba lo contrario: que el «(conjunto)» estaba.
  ok(p2.every(t=>!t.includes('(conjunto)')), '4. ningún personaje lleva ya «(conjunto)»');
  // OJO: la plantilla imprime la voz entre paréntesis («Lola (tiple)»), así que aquí NO
  // se puede exigir que no haya paréntesis: se exige que no haya MÁS DE UNO por línea,
  // que es lo que delataría un paréntesis venido del propio nombre en col15.
  ok(p2.every(t=>(t.match(/\(/g)||[]).length<=1), '4. ningún personaje arrastra paréntesis en el nombre');
  ok(p2.every(t=>!/\(\s*\)/.test(t)), '4. ningún paréntesis vacío');
  await pg.screenshot({path:'_cap_ficha_al_agua_patos.png', fullPage:true});

  // ---------- ROTULOS DE ACTO (5-8-2026) ----------
  // Tres comprobaciones que nacen de la revisión del 5 de agosto de 2026.
  console.log('\n=== ficha.html?id=la-verbena-de-la-paloma (rótulo de acto en el argumento) ===');
  await go('ficha.html?id=la-verbena-de-la-paloma');
  const hv = await pg.$$eval('.acto-sub', hs=>hs.map(h=>h.textContent.trim()));
  console.log('  cabeceras del argumento:', JSON.stringify(hv));
  ok(hv.length===1 && hv[0]==='Acto único', '2. el argumento de una obra en un acto encabeza «Acto único»');
  ok(!hv.some(t=>/^cuadro/i.test(t)), '2. los rótulos de cuadro siguen sin pintarse en el argumento');
  const gv = await pg.$$eval('.acto-tit', gs=>gs.map(g=>g.textContent.trim()));
  ok(gv.length===1 && gv[0]==='Acto único', '5. los números musicales encabezan «Acto único»');

  // 5-8-2026: ya NO queda ninguna ficha publicada sin cabecera de acto —las diez
  // que faltaban se resolvieron con el libreto o con el Diccionario—, así que la
  // prueba deja de apoyarse en una obra concreta y pasa a mirar el dato entero.
  console.log('\n=== cabeceras de acto en las 240 (dato completo) ===');
  await go('ficha.html?id=la-parranda');
  const sinCab = await pg.evaluate(()=>{
    const esActo = n => n.h && /^(actos?|jornada|parte)\b/i.test(n.t.trim());
    const sinNum = OBRAS.filter(o=>(o.num||[]).length && !o.num.some(esActo)).map(o=>o.id);
    const sinSyn = OBRAS.filter(o=>(o.synA||[]).length && !o.synA.some(esActo)).map(o=>o.id);
    return {sinNum, sinSyn};
  });
  console.log('  sin cabecera en números:', JSON.stringify(sinCab.sinNum), '| en argumento:', JSON.stringify(sinCab.sinSyn));
  ok(sinCab.sinNum.length===0, '5. ninguna ficha sirve los números musicales sin cabecera de acto');
  ok(sinCab.sinSyn.length===0, '2. ninguna ficha sirve el argumento sin cabecera de acto');
  // …y la plantilla sigue sin inventar: pinta exactamente los grupos que traen los datos
  const g2b = await pg.$$eval('.acto-grupo', gs=>gs.map(g=>(g.querySelector('.acto-tit')||{}).textContent||'(sin título)'));
  const espera = await pg.evaluate(()=>OBRAS.find(o=>o.id==='la-parranda').num.filter(n=>n.h && !/^cuadro\b/i.test(n.t.trim())).map(n=>n.t));
  console.log('  grupos pintados:', JSON.stringify(g2b), '| esperados:', JSON.stringify(espera));
  ok(JSON.stringify(g2b)===JSON.stringify(espera), '5. la plantilla pinta exactamente las cabeceras del dato, ni una más');

  // El quinto botón «Texto digitalizado (BNE)» (col13) se retiró el 5-8-2026:
  // la ficha publica solo cuatro tipos de enlace.
  console.log('\n=== ficha.html?id=la-bruja (materiales: solo cuatro tipos de enlace) ===');
  await go('ficha.html?id=la-bruja');
  const mats = await pg.$$eval('#materiales .mat', as=>as.map(a=>a.textContent.trim()));
  console.log('  botones de material:', JSON.stringify(mats));
  ok(!mats.some(t=>/digitalizado/i.test(t)), '6. no queda ningún botón «Texto digitalizado (BNE)»');
  const rot = await pg.evaluate(()=>OBRAS.filter(o=>o.ocr).length);
  ok(rot===0, '6. el generador ya no vuelca col13 al archivo de datos');

  // obra con personajes SIN tipo de voz documentado
  console.log('\n=== ficha.html?id=al-fin-se-casa-la-nieves (voces sin documentar) ===');
  await go('ficha.html?id=al-fin-se-casa-la-nieves');
  const p3 = await pg.$$eval('.personajes li', ls=>ls.map(l=>({t:l.textContent,voz:!!l.querySelector('.pv')})));
  console.log('  personajes:', p3.length, '| con voz:', p3.filter(p=>p.voz).length, '| sin voz:', p3.filter(p=>!p.voz).length);
  console.log('  muestra:', JSON.stringify(p3.slice(0,5).map(p=>p.t)));
  ok(p3.some(p=>!p.voz), '4. donde no hay voz documentada no se escribe paréntesis');
  ok(p3.filter(p=>!p.voz).every(p=>!p.t.includes('(')), '4. sin voz, la línea es solo el nombre');

  console.log('\n=== ficha.html?id=amar-sin-conocer (dos compositores) ===');
  await go('ficha.html?id=amar-sin-conocer');
  const cl = await pg.$$eval('.chip a', as=>as.map(a=>a.textContent+' -> '+a.getAttribute('href')));
  cl.forEach(x=>console.log('      '+x));
  const nComp = await pg.evaluate(()=>OBRAS.find(o=>o.id==='amar-sin-conocer').cIds.length);
  ok(cl.filter(x=>x.includes('tipo=persona')).length>=nComp, '3. cada autor lleva su propio enlace');

  // ---------- LISTADO: persona ----------
  console.log('\n=== listado.html?tipo=persona&v=ruperto-chapi ===');
  await go('listado.html?tipo=persona&v=ruperto-chapi');
  console.log('  título:', await pg.$eval('#lTitulo',e=>e.textContent));
  console.log('  bloques:', (await pg.$$eval('#lBody h2',ns=>ns.map(n=>n.textContent))).join(' / '));
  const anios = await pg.$$eval('#lBody .obras .yr', ys=>ys.map(y=>y.textContent));
  console.log('  años en pantalla:', anios.join(', '));
  const asc = anios.every((a,i)=>i===0||parseInt(anios[i-1])<=parseInt(a));
  ok(asc, '3. el catálogo del autor está ordenado por año de estreno');
  ok((await pg.$$eval('#lBody .bio, #lBody .pend',n=>n.length))>0, '3. la ficha de autor tiene bloque de biografía');
  ok((await pg.$$eval('#lBody .cobertura',n=>n.length))>0, 'aviso de cobertura visible (el catálogo web no está completo)');
  await pg.screenshot({path:'_cap_listado_persona.png', fullPage:true});

  // ---------- LISTADO: año ----------
  console.log('\n=== listado.html?tipo=anio&v=1897 ===');
  await go('listado.html?tipo=anio&v=1897');
  const filas = await pg.$$eval('#lBody .obras li', ls=>ls.map(l=>l.textContent.replace(/\s+/g,' ').trim()));
  filas.forEach(f=>console.log('      '+f));
  ok(filas.length>0, '3. el listado por año devuelve obras');
  const todas1897 = await pg.evaluate(()=>OBRAS.filter(o=>o.anioN==='1897').length);
  ok(filas.length===todas1897, `3. salen todas las obras de ese año (${filas.length}/${todas1897})`);
  await pg.screenshot({path:'_cap_listado_anio.png', fullPage:true});

  // ---------- LISTADO: teatro ----------
  console.log('\n=== listado.html?tipo=teatro ===');
  // el teatro con más obras servidas
  const kTop = await pg.evaluate(()=>{
    const c={}; OBRAS.forEach(o=>{ if(o.teatroK) c[o.teatroK]=(c[o.teatroK]||0)+1; });
    return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
  });
  await go('listado.html?tipo=teatro&v='+encodeURIComponent(kTop));
  console.log('  clave:', kTop, '| título:', await pg.$eval('#lTitulo',e=>e.textContent),
              '| subtítulo:', await pg.$eval('#lSub',e=>e.textContent));
  const tf = await pg.$$eval('#lBody .obras li', ls=>ls.map(l=>l.textContent.replace(/\s+/g,' ').trim()));
  tf.slice(0,6).forEach(f=>console.log('      '+f));
  const espTop = await pg.evaluate(k=>OBRAS.filter(o=>o.teatroK===k).length, kTop);
  ok(tf.length===espTop, `3. salen todas las obras del teatro (${tf.length}/${espTop})`);
  const anT = await pg.$$eval('#lBody .obras .yr', ys=>ys.map(y=>parseInt(y.textContent)));
  ok(anT.every((a,i)=>i===0||anT[i-1]<=a), '3. el listado del teatro va en orden cronológico');
  ok((await pg.$eval('#lTitulo',e=>e.textContent))!==kTop, '3. la cabecera muestra el nombre real, no la clave de la URL');
  await pg.screenshot({path:'_cap_listado_teatro.png', fullPage:true});

  // homónimos en ciudades distintas: fichas separadas
  const homs = await pg.evaluate(()=>{
    const porN={}; (typeof TEATROS!=='undefined'?TEATROS:[]).forEach(t=>{(porN[t.n]=porN[t.n]||[]).push(t);});
    return Object.values(porN).filter(v=>v.length>1).flat();
  });
  if(homs.length){
    console.log('  homónimos servidos:', homs.map(t=>`${t.n} (${t.c})`).join(' | '));
    const cnt=[];
    for(const h of homs){
      await go('listado.html?tipo=teatro&v='+encodeURIComponent(h.k));
      const n=await pg.$$eval('#lBody .obras li', ls=>ls.length);
      const sub=await pg.$eval('#lSub',e=>e.textContent);
      cnt.push({n:h.n,c:h.c,obras:n,sub});
      console.log(`      ${h.n} (${h.c}): ${n} obras | subtítulo «${sub}»`);
    }
    ok(cnt.every(x=>x.sub.includes(x.c)), '3. cada homónimo declara su ciudad en el subtítulo');
    ok(new Set(homs.map(h=>h.k)).size===homs.length, '3. los homónimos tienen claves distintas: no se funden');
  } else console.log('  (no hay teatros homónimos entre los servidos)');

  // ---------- desplegable de Personajes (30/07/2026 tarde) ----------
  // 6-8-2026: estos asertos apuntaban a '.pers-toggle', pero la sesión del
  // «argumento plegado» dio ESA MISMA CLASE al botón «Leer más» del argumento
  // (class="pers-toggle arg-toggle"). El selector cazaba los dos botones y una
  // obra con pocos personajes pero argumento largo daba falso positivo
  // (aventura-de-un-cantante: 7 personajes, 1.627 caracteres). Se apunta al id
  // propio del botón de personajes, #persBtn, que ficha.html ya le pone.
  console.log('\n=== desplegable de Personajes ===');
  // una obra con más de 7 personajes y otra con 7 o menos, elegidas del propio dato
  const idGrande = await pg.evaluate(()=>(OBRAS.find(o=>(o.pers||[]).length>7)||{}).id);
  const idChica  = await pg.evaluate(()=>(OBRAS.find(o=>(o.pers||[]).length>0 && o.pers.length<=7)||{}).id);
  await go('ficha.html?id='+idGrande);
  const nPers = await pg.evaluate(id=>OBRAS.find(o=>o.id===id).pers.length, idGrande);
  let visibles = await pg.$$eval('.personajes li', ls=>ls.filter(l=>getComputedStyle(l).display!=='none').length);
  console.log(`  ${idGrande}: ${nPers} personajes, visibles plegado: ${visibles}`);
  ok(visibles===6, 'plegado por defecto: solo se ven los 6 primeros (vista previa)');
  ok(await pg.$$eval('#persBtn', b=>b.length)===1, 'hay botón de desplegar');
  const txtBtn = await pg.$eval('#persBtn', b=>b.textContent);
  ok(txtBtn.includes(String(nPers)), `el botón anuncia el total («${txtBtn.trim()}»)`);
  await pg.click('#persBtn');
  visibles = await pg.$$eval('.personajes li', ls=>ls.filter(l=>getComputedStyle(l).display!=='none').length);
  ok(visibles===nPers, `desplegado: se ven los ${nPers}`);
  ok((await pg.$eval('#persBtn',b=>b.textContent)).includes('menos'), 'el botón pasa a «Mostrar menos»');
  await pg.click('#persBtn');
  visibles = await pg.$$eval('.personajes li', ls=>ls.filter(l=>getComputedStyle(l).display!=='none').length);
  ok(visibles===6, 'vuelve a plegarse');
  if(idChica){
    await go('ficha.html?id='+idChica);
    ok(await pg.$$eval('#persBtn', b=>b.length)===0, `con pocos personajes (${idChica}) no hay botón: se listan todos`);
    const nCh = await pg.evaluate(id=>OBRAS.find(o=>o.id===id).pers.length, idChica);
    const visCh = await pg.$$eval('.personajes li', ls=>ls.filter(l=>getComputedStyle(l).display!=='none').length);
    ok(visCh===nCh, 'todos visibles sin plegar');
  }

  // ---------- cuadros integrados en su acto (30/07/2026 tarde) ----------
  console.log('\n=== cuadros integrados en el acto ===');
  // todas las obras servidas: ningún rótulo «Cuadro…» pintado ni en argumento ni en números
  const conCuadro = await pg.evaluate(()=>OBRAS.filter(o=>
    (o.synA||[]).some(n=>n.h&&/^cuadro\b/i.test(n.t)) || (o.num||[]).some(n=>n.h&&/^cuadro\b/i.test(n.t))
  ).map(o=>o.id));
  console.log('  obras con rótulos de cuadro en el dato:', conCuadro.length);
  let cuadrosPintados = 0, numerosPerdidos = 0;
  for(const cid of conCuadro){
    await go('ficha.html?id='+cid);
    const subs = await pg.$$eval('.acto-sub, .acto-tit', ns=>ns.map(n=>n.textContent));
    if(subs.some(t=>/^cuadro\b/i.test(t.trim()))) { cuadrosPintados++; console.log('    ✗ pinta cuadro:', cid); }
    const esp = await pg.evaluate(id=>OBRAS.find(o=>o.id===id).num.filter(n=>!n.h).length, cid);
    const got = await pg.$$eval('.numeros li', ls=>ls.length);
    if(esp !== got){ numerosPerdidos++; console.log(`    ✗ ${cid}: números ${got}/${esp}`); }
  }
  ok(cuadrosPintados===0, 'ningún rótulo «Cuadro…» se pinta: quedan integrados en su acto');
  ok(numerosPerdidos===0, 'al omitir los cuadros no se pierde ningún número musical');
  // el dato NO se ha tocado: los cuadros siguen en synA/num
  ok(conCuadro.length>0, 'los cuadros siguen en el dato (solo se filtran al pintar)');
  // La parranda: desde el 19-8-2026 (punto 4, tanda 9) el argumento trae los TRES
  // actos completos, cada uno con su propia cabecera («Acto I», «Acto II», «Acto III»).
  // Antes de esa fecha los actos II y III no estaban redactados y se probaba un
  // rótulo provisional «Actos II y III»; esa comprobación queda retirada.
  const idParranda = await pg.evaluate(()=>(OBRAS.find(o=>/parranda/i.test(o.t))||{}).id);
  if(idParranda){
    await go('ficha.html?id='+idParranda);
    const subsP = await pg.$$eval('.acto-sub', ns=>ns.map(n=>n.textContent));
    console.log('  La parranda, cabeceras del argumento:', JSON.stringify(subsP));
    const esperadas = ['Acto I','Acto II','Acto III'];
    ok(esperadas.every(e=>subsP.some(t=>t.trim()===e)), 'La parranda pinta cabecera propia para Acto I, II y III');
  } else nota('La parranda no está entre las obras servidas; no se comprueba sus cabeceras de acto');

  // ---------- «Nueva búsqueda» a la altura de «Materiales» + flechas (31/07/2026) ----------
  console.log('\n=== «Nueva búsqueda» a la altura de «Materiales y descargas» ===');
  await go('ficha.html?id=benamor');
  const mismaFila = await pg.evaluate(()=>{
    const mat=document.querySelector('.lnk-mat'), nueva=document.querySelector('.btn-nueva');
    return !!mat && !!nueva && mat.parentElement===nueva.parentElement;
  });
  ok(mismaFila, '«Nueva búsqueda» y «Materiales y descargas» comparten fila (misma altura)');

  console.log('\n=== flechas anterior/siguiente entre fichas filtradas ===');
  await pg.evaluate(()=>sessionStorage.clear());
  await go('buscador.html');
  const idsFiltro = await pg.evaluate(()=>JSON.parse(sessionStorage.getItem('zzFichaIds')||'null'));
  ok(Array.isArray(idsFiltro) && idsFiltro.length>1, 'buscador.html guarda en sessionStorage el orden de la lista mostrada');
  const primerHref = await pg.$eval('#lista a.row', a=>a.getAttribute('href'));
  ok(primerHref.includes(encodeURIComponent(idsFiltro[0])), 'el primer resultado en pantalla es el primero de la lista guardada');
  await clic('#lista a.row');
  ok(await pg.$eval('#fhNav', e=>getComputedStyle(e).display!=='none'), 'al entrar desde el buscador aparecen las flechas de la ficha');
  ok(await pg.$eval('#fhPrev', a=>a.classList.contains('disabled')), 'en la primera ficha de la lista, «Anterior» está deshabilitada');
  const nextHref = await pg.$eval('#fhNext', a=>a.getAttribute('href'));
  ok(!!nextHref && nextHref.includes(encodeURIComponent(idsFiltro[1])), '«Siguiente» apunta a la segunda ficha de la lista');
  await clic('#fhNext');
  ok(new URL(pg.url()).searchParams.get('id')===idsFiltro[1], 'al pulsar «Siguiente» se navega a la ficha correcta');
  const prevHref = await pg.$eval('#fhPrev', a=>a.getAttribute('href'));
  ok(!!prevHref && prevHref.includes(encodeURIComponent(idsFiltro[0])), 'desde la 2ª ficha, «Anterior» vuelve a la 1ª');
  ok((await pg.$eval('#fhPos', e=>e.textContent))===`2 de ${idsFiltro.length}`, `el contador de la cabecera dice «2 de ${idsFiltro.length}»`);

  // el extremo final de la lista (31/07/2026): antes solo se comprobaba el
  // primero, y «Siguiente» en la última ficha no lo miraba nadie.
  await go('ficha.html?id='+encodeURIComponent(idsFiltro[idsFiltro.length-1]));
  ok(await pg.$eval('#fhNext', a=>a.classList.contains('disabled')), 'en la última ficha de la lista, «Siguiente» está deshabilitada');
  ok(await pg.$eval('#fhNext', a=>a.getAttribute('href'))===null, 'la flecha deshabilitada no lleva a ninguna parte (sin href)');
  ok(await pg.$eval('#fhNext', a=>a.getAttribute('aria-disabled'))==='true', 'la flecha deshabilitada se anuncia como tal (aria-disabled)');
  ok(!(await pg.$eval('#fhPrev', a=>a.classList.contains('disabled'))), 'en la última ficha, «Anterior» sí funciona');
  ok((await pg.$eval('#fhPos', e=>e.textContent))===`${idsFiltro.length} de ${idsFiltro.length}`, 'el contador dice que es la última');

  // segunda pareja de flechas al final de la ficha (31/07/2026)
  await go('ficha.html?id='+encodeURIComponent(idsFiltro[1]));
  ok(await pg.$eval('#fhNavFin', e=>getComputedStyle(e).display!=='none'), 'la ficha repite las flechas al final, para no tener que subir');
  const parejas = await pg.evaluate(()=>({
    prev:[document.getElementById('fhPrev').getAttribute('href'), document.getElementById('fhPrevFin').getAttribute('href')],
    next:[document.getElementById('fhNext').getAttribute('href'), document.getElementById('fhNextFin').getAttribute('href')],
    pos:[document.getElementById('fhPos').textContent, document.getElementById('fhPosFin').textContent]
  }));
  ok(parejas.prev[0]===parejas.prev[1] && parejas.next[0]===parejas.next[1] && parejas.pos[0]===parejas.pos[1],
     'las dos parejas de flechas apuntan a lo mismo y muestran el mismo contador');
  const ordenVertical = await pg.evaluate(()=>{
    const a=document.getElementById('fhNav').getBoundingClientRect().top+scrollY;
    const b=document.getElementById('fhNavFin').getBoundingClientRect().top+scrollY;
    const cuerpo=document.getElementById('fBody').getBoundingClientRect().bottom+scrollY;
    return b>a && b>=cuerpo-2;
  });
  ok(ordenVertical, 'la segunda pareja va debajo del contenido de la ficha, no en medio');
  await clic('#fhNextFin');
  ok(new URL(pg.url()).searchParams.get('id')===idsFiltro[2], 'la flecha del final también navega correctamente');

  // ids que ya no existen en los datos (31/07/2026): una pestaña abierta desde
  // antes de regenerar zarzuteca-data.js guarda ids muertos; sin filtrarlos la
  // flecha llevaba a «Obra no encontrada», donde no hay flechas para volver.
  await pg.evaluate(ids=>sessionStorage.setItem('zzFichaIds',
    JSON.stringify(['obra-fantasma-1', ids[0], ids[1], 'obra-fantasma-2'])), idsFiltro);
  await go('ficha.html?id='+encodeURIComponent(idsFiltro[0]));
  ok((await pg.$eval('#fhPos', e=>e.textContent))==='1 de 2', 'los ids que ya no existen se descartan de la lista guardada');
  ok(await pg.$eval('#fhPrev', a=>a.classList.contains('disabled')), 'no se ofrece «Anterior» hacia una obra que ya no se sirve');
  const destinoNext = await pg.$eval('#fhNext', a=>a.getAttribute('href'));
  ok(!!destinoNext && destinoNext.includes(encodeURIComponent(idsFiltro[1])), '«Siguiente» salta al primer id vivo, no al fantasma');
  await clic('#fhNext');
  ok(!(await pg.$eval('#fTitulo', e=>e.textContent)).includes('no encontrada'), 'ninguna flecha lleva a un callejón sin salida');

  await pg.evaluate(()=>sessionStorage.removeItem('zzFichaIds'));
  await go('ficha.html?id=benamor');
  ok(await pg.$eval('#fhNav', e=>getComputedStyle(e).display==='none'), 'sin lista guardada (enlace directo) no se muestran flechas');
  ok(await pg.$eval('#fhNavFin', e=>getComputedStyle(e).display==='none'), 'sin lista guardada tampoco aparecen las del final');

  // lista de una sola obra: no hay a dónde ir, así que no se pinta nada
  await pg.evaluate(()=>sessionStorage.setItem('zzFichaIds', JSON.stringify(['benamor'])));
  await go('ficha.html?id=benamor');
  ok(await pg.$eval('#fhNav', e=>getComputedStyle(e).display==='none'), 'con un solo resultado filtrado no se muestran flechas');

  // listado.html también guarda su lista al pulsar una obra
  await pg.evaluate(()=>sessionStorage.clear());
  await go('listado.html?tipo=anio&v=1897');
  const idsAnio = await pg.$$eval('#lBody .obras a', as=>as.map(a=>new URL(a.href).searchParams.get('id')));
  await clic('#lBody .obras a');
  const idsGuardadosListado = await pg.evaluate(()=>JSON.parse(sessionStorage.getItem('zzFichaIds')||'null'));
  ok(Array.isArray(idsGuardadosListado) && idsGuardadosListado.join(',')===idsAnio.join(','), 'listado.html guarda su propia lista al pulsar una obra');
  const navListado = await pg.$eval('#fhNav', e=>getComputedStyle(e).display!=='none').catch(()=>false);
  ok(idsAnio.length<2 || navListado, 'las flechas también funcionan llegando desde un listado');

  console.log('\n=== casos límite ===');
  await go('listado.html?tipo=teatro&v=clave-que-no-existe');
  ok((await pg.$eval('#lTitulo',e=>e.textContent)).includes('No encontrado'), 'teatro inexistente: mensaje limpio');
  await go('listado.html');
  ok((await pg.$eval('#lTitulo',e=>e.textContent)).includes('No encontrado'), 'listado sin tipo: no revienta');
  await go('persona.html?id=ruperto-chapi');
  await pg.waitForTimeout(300);
  ok(pg.url().includes('listado.html?tipo=persona&v=ruperto-chapi'), 'persona.html redirige a listado.html (enlaces antiguos siguen vivos)');
  await go('ficha.html?id=no-existe');
  ok((await pg.$eval('#fTitulo',e=>e.textContent)).includes('no encontrada'), 'ficha inexistente: mensaje limpio');

  // ---------- no se publica ningún literal del Diccionario ----------
  console.log('\n=== control de literales ===');
  const rutaPend = fs.existsSync('_reescritura_pendiente.json') ? '_reescritura_pendiente.json' : '../_reescritura_pendiente.json';
  const lits = JSON.parse(fs.readFileSync(rutaPend,'utf8')).map(o=>o.fila);
  const ids = await pg.evaluate(()=>OBRAS.length);
  console.log(`  obras servidas: ${ids} | filas con argumento literal excluidas: ${lits.length}`);
  ok(ids===OBRAS_ESPERADAS, `siguen siendo ${OBRAS_ESPERADAS} obras: el filtro no se ha tocado`);

  console.log('\n=== errores de JavaScript ===');
  ok(errs.length===0, 'ninguna excepción en consola'+(errs.length?': '+errs.join(' | '):''));

  await b.close(); srv.close();
  console.log(`\nRESULTADO: ${fallos} fallos`);
  process.exit(fallos?1:0);
})();
