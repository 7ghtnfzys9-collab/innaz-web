/* Lista de países en español para los formularios de Mi INNAZ (30-10-2026).
   Los nombres los da el propio navegador (Intl.DisplayNames); el servidor comprueba el código con la misma regla.
   Uso: Paises.rellenar(selectElement, 'ES') */
window.Paises = (() => {
  // ISO 3166-1 alfa-2 en vigor + XK (Kosovo). La misma lista está en functions/_lib/basicos.js.
  const ISO = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' ');
  let lista = null;
  function todos() {
    if (lista) return lista;
    const dn = new Intl.DisplayNames(['es'], { type: 'region', fallback: 'code' });
    lista = ISO.map(c => { let n; try { n = dn.of(c); } catch { n = c; } return [c, n || c]; });
    lista.sort((x, y) => x[1].localeCompare(y[1], 'es'));
    return lista;
  }
  function rellenar(sel, valor) {
    sel.textContent = '';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Elige tu país…'; sel.append(o0);
    for (const [c, n] of todos()) { const o = document.createElement('option'); o.value = c; o.textContent = n; sel.append(o); }
    sel.value = valor || '';
  }
  return { todos, rellenar };
})();
