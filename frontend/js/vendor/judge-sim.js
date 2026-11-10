/*! MootCoach Judge Simulator 1.0.0. No dependencies, no build step, no network calls. See JUDGE_SIM_API.md. */
(function (global) {
'use strict';

/* ===== JUDGE (SVG + animation) ===== */
/*
  Every portrait is one inline SVG built from named groups (data-layer / data-part). The animation
  code only writes `transform` on those groups; the drawing lives in inner groups marked data-art.
  Five portraits, all in Indian bench attire (black robe, white bands):
    mentor   bearded man, middle-aged, steepled hands, unhurried
    purist   elderly man, bald with white side hair, rectangular glasses, pen in hand, slow and formal
    hawk     grey-haired man with a moustache, pen in hand, brisk
    rights   older woman, grey hair drawn up, round glasses, measured
    skeptic  younger woman, dark hair, quick and restless
  profile = how the portrait moves (speed, speech rate, resting lean, blink range, gesture size, hand pose).
*/
var ART = { ink: '#1B1613', paper: '#F1E7D0', crimson: '#B0392E', crimsonDark: '#8E2C23', brass: '#A98C4F', bench: '#241C17', benchtop: '#B89B6C' };

var PORTRAITS = {
  purist: {
    profile: { speed: .72, speech: 13, baseLean: -.06, baseTilt: 0, blink: [3.4, 6.5], gesture: .35, hands: 'pen', shoulder: 1 },
    art: {
      skin: '#E7D4B2', eyeY: 141, mouthY: 182, browW: 3, brow: 'M-11,1.5 Q-2,-2.5 10,0',
      faceTop: 'M165,150 L165,118 C163,84 182,70 200,70 C218,70 237,84 235,118 L235,150 L233,166',
      jaw: 'C231,180 220,197 208,203 C203,205 197,205 192,203 C180,197 169,180 167,166',
      back: '',
      hair: '<path d="M167,132 C154,128 152,102 164,90 C169,85 174,82 179,80 C171,92 168,108 169,130 Z" fill="' + ART.paper + '" stroke="' + ART.ink + '" stroke-width="1.6"/>' +
            '<path d="M233,132 C246,128 248,102 236,90 C231,85 226,82 221,80 C229,92 232,108 231,130 Z" fill="' + ART.paper + '" stroke="' + ART.ink + '" stroke-width="1.6"/>' +
            '<path d="M160,104 L166,110 M159,114 L166,119 M240,104 L234,110 M241,114 L234,119" stroke="' + ART.ink + '" stroke-width="1.1" fill="none"/>' +
            '<path d="M184,97 Q200,93 216,97 M187,105 Q200,102 213,105" stroke="' + ART.ink + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
      marks: '<path d="M190,163 Q186,172 189,183 M210,163 Q214,172 211,183" stroke="' + ART.ink + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
             '<path d="M230,116 L227,134 M232,150 L227,168 M229,170 L222,186 M226,180 L218,194" stroke="' + ART.ink + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
      extras: '<g fill="rgba(241,231,208,.35)" stroke="' + ART.ink + '" stroke-width="1.15"><rect x="172.5" y="132" width="23" height="17" rx="6"/><rect x="204.5" y="132" width="23" height="17" rx="6"/></g>' +
              '<path d="M195.5,139 Q200,135.5 204.5,139 M172.5,138 L165,136 M227.5,138 L235,136" stroke="' + ART.ink + '" stroke-width="1.15" fill="none"/>',
      jawExtras: ''
    }
  },
  skeptic: {
    profile: { speed: 1.5, speech: 18, baseLean: .3, baseTilt: -1.5, blink: [2, 4], gesture: 1, hands: 'flat', shoulder: .93 },
    art: {
      skin: '#D9BC93', eyeY: 137, mouthY: 177, browW: 2.6, brow: 'M-10,3 Q-3,-5 10,-1.5',
      faceTop: 'M169,146 L169,114 C169,90 184,78 200,78 C216,78 231,90 231,114 L231,146 L229,162',
      jaw: 'C226,178 214,193 205,199 C202,201 198,201 195,199 C186,193 174,178 171,162',
      back: '<path d="M162,122 C156,150 160,176 169,190 L231,190 C240,176 244,150 238,122 C237,84 221,64 200,64 C179,64 163,84 162,122 Z" fill="' + ART.ink + '"/>',
      hair: '<path d="M167,126 C164,92 181,72 200,72 C219,72 236,92 233,126 C229,106 220,93 207,90 C197,97 180,102 167,126 Z" fill="' + ART.ink + '"/>' +
            '<path d="M176,96 Q186,80 204,78 M183,98 Q192,87 206,84 M222,92 Q229,102 231,114" stroke="' + ART.paper + '" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
            '<circle cx="166.5" cy="153" r="2" fill="' + ART.paper + '"/><circle cx="233.5" cy="153" r="2" fill="' + ART.paper + '"/>',
      marks: '<path d="M226,142 L221,160 M225,158 L217,176 M219,174 L211,188" stroke="' + ART.ink + '" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
             '<path d="M178,152 Q181,158 186,160" stroke="' + ART.ink + '" stroke-width="1" fill="none" stroke-linecap="round"/>',
      extras: '', jawExtras: ''
    }
  },
  mentor: {
    profile: { speed: .95, speech: 15, baseLean: -.12, baseTilt: 3, blink: [3, 5.5], gesture: .6, hands: 'steeple', shoulder: 1.05 },
    art: {
      skin: '#CBA77A', eyeY: 138, mouthY: 180, browW: 4.2, brow: 'M-11,1 Q0,-4.5 10,1',
      faceTop: 'M161,150 L161,116 C160,86 180,74 200,74 C220,74 240,86 239,116 L239,150 L237,166',
      jaw: 'C234,182 222,198 210,204 C204,207 196,207 190,204 C178,198 166,182 163,166',
      back: '',
      hair: '<path d="M159,128 C150,92 171,60 202,60 C233,60 250,92 241,128 C239,108 233,99 222,95 C211,100 196,99 184,93 C172,97 162,108 159,128 Z" fill="' + ART.ink + '"/>' +
            '<path d="M170,92 Q180,72 200,68 M178,90 Q190,76 210,73" stroke="' + ART.paper + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
            '<path d="M214,74 Q230,80 238,100 M222,84 Q232,92 236,108" stroke="' + ART.paper + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
      marks: '<path d="M233,118 L230,136 M235,138 L231,152" stroke="' + ART.ink + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
      extras: '',
      jawExtras: '<path d="M161.5,150 C163,180 177,199 190,205 C196,208 204,208 210,205 C223,199 237,180 238.5,150 C233,163 226,170 215,169 C207,165 193,165 185,169 C174,170 167,163 161.5,150 Z" fill="' + ART.ink + '"/>' +
                 '<path d="M170,172 L174,184 M178,178 L183,193 M188,186 L192,200 M212,186 L208,200 M222,178 L217,193 M230,172 L226,184 M200,190 L200,203" stroke="' + ART.paper + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
                 '<ellipse cx="200" cy="181" rx="11.5" ry="6.5" fill="#CBA77A"/>' +
                 '<path d="M185,174.5 Q200,165 215,174.5 Q200,171.5 185,174.5 Z" fill="' + ART.ink + '" stroke="' + ART.ink + '" stroke-width="2" stroke-linejoin="round"/>'
    }
  },
  hawk: {
    profile: { speed: 1.25, speech: 17, baseLean: .2, baseTilt: 0, blink: [2.6, 4.6], gesture: .5, hands: 'pen', shoulder: .98 },
    art: {
      skin: '#C99B6E', eyeY: 139, mouthY: 183, browW: 3.6, brow: 'M-11,-.5 Q-1,-2 10,2.5',
      faceTop: 'M167,148 L167,114 C166,86 183,73 200,73 C217,73 234,86 233,114 L233,148 L231,164',
      jaw: 'C228,181 216,197 206,203 C202,205 198,205 194,203 C184,197 172,181 169,164',
      back: '',
      hair: '<path d="M165,126 C160,92 179,66 203,66 C226,66 240,92 235,126 C233,110 228,99 219,93 C204,99 186,97 176,90 C170,99 166,111 165,126 Z" fill="' + ART.paper + '" stroke="' + ART.ink + '" stroke-width="1.6" stroke-linejoin="round"/>' +
            '<path d="M180,88 Q191,75 208,72 M188,91 Q199,81 214,78 M223,91 Q229,99 232,110 M170,100 Q172,94 176,90" stroke="' + ART.ink + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
      marks: '<path d="M228,120 L225,138 M230,148 L227,162" stroke="' + ART.ink + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
             '<path d="M193,121 L194,128 M207,121 L206,128" stroke="' + ART.ink + '" stroke-width="1" fill="none" stroke-linecap="round"/>',
      extras: '',
      jawExtras: '<path d="M227,170 L220,186 M224,182 L216,195" stroke="' + ART.ink + '" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
                 '<path d="M185,177.5 Q192,168.5 200,172 Q208,168.5 215,177.5 Q207,174.5 200,175.5 Q193,174.5 185,177.5 Z" fill="' + ART.paper + '" stroke="' + ART.ink + '" stroke-width="1.3" stroke-linejoin="round"/>'
    }
  },
  rights: {
    profile: { speed: .85, speech: 14, baseLean: .05, baseTilt: 2, blink: [3, 5.5], gesture: .55, hands: 'flat', shoulder: .95 },
    art: {
      skin: '#DDB98C', eyeY: 139, mouthY: 179, browW: 2.4, brow: 'M-10,1 Q-1,-4 10,0',
      faceTop: 'M166,148 L166,116 C165,90 182,77 200,77 C218,77 235,90 234,116 L234,148 L232,163',
      jaw: 'C229,180 217,195 206,200 C202,202 198,202 194,200 C183,195 171,180 168,163',
      back: '<ellipse cx="200" cy="64" rx="18" ry="11.5" fill="' + ART.paper + '" stroke="' + ART.ink + '" stroke-width="1.6"/>' +
            '<path d="M188,60 Q200,54 212,60 M191,66 Q200,62 209,66" stroke="' + ART.ink + '" stroke-width="1" fill="none" stroke-linecap="round"/>',
      hair: '<path d="M164,130 C159,95 178,69 200,69 C222,69 241,95 236,130 C233,111 222,96 200,89 C178,96 167,111 164,130 Z" fill="' + ART.paper + '" stroke="' + ART.ink + '" stroke-width="1.6" stroke-linejoin="round"/>' +
            '<path d="M200,70 L200,89 M191,74 Q179,84 172,104 M209,74 Q221,84 228,104 M184,81 Q176,90 171,112 M216,81 Q224,90 229,112" stroke="' + ART.ink + '" stroke-width="1.05" fill="none" stroke-linecap="round"/>' +
            '<circle cx="166" cy="154" r="2.2" fill="' + ART.brass + '" stroke="' + ART.ink + '" stroke-width=".8"/><circle cx="234" cy="154" r="2.2" fill="' + ART.brass + '" stroke="' + ART.ink + '" stroke-width=".8"/>',
      marks: '<path d="M228,140 L224,157" stroke="' + ART.ink + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
      extras: '<g fill="rgba(241,231,208,.3)" stroke="' + ART.ink + '" stroke-width="1.15"><circle cx="184" cy="139.5" r="10.5"/><circle cx="216" cy="139.5" r="10.5"/></g>' +
              '<path d="M194.5,138.5 Q200,135.5 205.5,138.5 M173.5,138 L166,136 M226.5,138 L234,136" stroke="' + ART.ink + '" stroke-width="1.15" fill="none"/>',
      jawExtras: '<path d="M225,166 L218,180" stroke="' + ART.ink + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>'
    }
  }
};
var PORTRAIT_KEYS = ['mentor', 'purist', 'hawk', 'rights', 'skeptic'];
var STATES = ['idle', 'listening', 'skeptical', 'interrupting', 'speaking', 'impressed', 'stern', 'verdict'];

/* Eight mouth shapes, drawn around (0,0); the mouth layer is translated to art.mouthY. */
var VISEMES = {
  rest:  { open: 0,   d: '<path d="M-9.5,0 Q0,2 9.5,0" fill="none" stroke-width="2.4"/>' },
  mbp:   { open: 0,   d: '<path d="M-9,0 L9,0" fill="none" stroke-width="3.1"/>' },
  ee:    { open: .25, d: '<path d="M-11,-1 Q0,-4 11,-1 Q0,5.5 -11,-1 Z" stroke-width="1.4"/><path d="M-7,-1 L7,-1" stroke="' + ART.paper + '" stroke-width="1.6"/>' },
  ah:    { open: 1,   d: '<path d="M-9,-3 Q0,-6 9,-3 Q8.5,10 0,11 Q-8.5,10 -9,-3 Z" stroke-width="1.4"/><path d="M-6,-2.5 L6,-2.5" stroke="' + ART.paper + '" stroke-width="1.6"/>' },
  oh:    { open: .7,  d: '<ellipse cx="0" cy="2" rx="5.4" ry="6.4" stroke-width="1.4"/>' },
  oo:    { open: .4,  d: '<ellipse cx="0" cy="1" rx="3.4" ry="3.8" stroke-width="1.4"/>' },
  fv:    { open: .15, d: '<path d="M-9,-1 Q0,-3 9,-1 Q0,3.5 -9,-1 Z" stroke-width="1.4"/><path d="M-6,4 Q0,5.5 6,4" fill="none" stroke-width="1.4"/>' },
  smile: { open: 0,   d: '<path d="M-10,-1 Q0,4.5 10,-1" fill="none" stroke-width="2.4"/>' }
};

function armMarkup(side, kind) {
  /* local coords: elbow at 0,0, forearm pointing up; wrist at y=-60 */
  var flip = side === 'L' ? ' transform="scale(-1,1)"' : '';
  var pen = (kind === 'pen' && side === 'R')
    ? '<path d="M7,-72 L-9,-128" stroke="' + ART.ink + '" stroke-width="3.4" stroke-linecap="round"/><path d="M-8.2,-125 L-9,-128" stroke="' + ART.paper + '" stroke-width="1.6" stroke-linecap="round"/>' : '';
  return '<g' + flip + '>' +
    '<path d="M-18,8 C-19,-20 -15,-44 -12.5,-56 L12.5,-56 C15,-44 19,-20 18,8 Z" fill="' + ART.ink + '" stroke="' + ART.paper + '" stroke-width=".9"/>' +
    '<path d="M-10,-6 C-11,-24 -8,-40 -6,-52 M4,-4 C4,-22 5,-40 6,-52" stroke="' + ART.paper + '" stroke-width=".9" fill="none" opacity=".75"/>' +
    '<path d="M-13,-55.5 L13,-55.5 L11.5,-64 L-11.5,-64 Z" fill="' + ART.paper + '" stroke="' + ART.ink + '" stroke-width="1.3"/>' +
    pen +
    '<g transform="translate(0,-63)">' +
      '<path d="M-10,0 L-12.5,-22 C-13,-31 -9,-41 -6,-45 C-3,-48.5 3,-48.5 6,-45 C10,-39 12.5,-30 12.5,-20 L10,0 Z" fill="var(--skin)" stroke="' + ART.ink + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M10.5,-11 C18,-17 20,-26 16,-31 C12.5,-31 11.5,-25 11,-20" fill="var(--skin)" stroke="' + ART.ink + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M-5.5,-44 L-5,-27 M.5,-46.5 L.5,-27 M6.5,-43 L6,-27" stroke="' + ART.ink + '" stroke-width="1.1" fill="none" stroke-linecap="round"/>' +
    '</g></g>';
}

function buildJudgeSVG(spec, compact) {
  var a = spec.art, ink = ART.ink, eL = 184, eR = 216, ey = a.eyeY, by = ey - 13;
  var face = a.faceTop + ' ' + a.jaw + ' Z';
  var jawStart = a.faceTop.split('L').pop().trim();
  var sh = spec.profile.shoulder;
  function art(key, inner) {
    return '<g data-art="' + key + '">' + inner + '</g>';
  }
  var vis = Object.keys(VISEMES).map(function (k) {
    return '<g data-viseme="' + k + '" fill="' + ink + '" stroke="' + ink + '" stroke-linecap="round" stroke-linejoin="round"' + (k === 'rest' ? '' : ' style="display:none"') + '>' + art('mouth.' + k, VISEMES[k].d) + '</g>';
  }).join('');
  var lid = function (cx) { return '<ellipse cx="' + cx + '" cy="' + ey + '" rx="8.2" ry="5.4" fill="' + a.skin + '" stroke="' + ink + '" stroke-width="1.1"/>'; };
  var eye = function (cx) { return '<ellipse cx="' + cx + '" cy="' + ey + '" rx="7.2" ry="4.3" fill="' + ART.paper + '" stroke="' + ink + '" stroke-width="1.2"/><path d="M' + (cx - 8) + ',' + (ey - 1.5) + ' Q' + cx + ',' + (ey - 7) + ' ' + (cx + 8) + ',' + (ey - 1.5) + '" fill="none" stroke="' + ink + '" stroke-width="2"/>'; };
  return '' +
  '<svg viewBox="' + (compact ? '60 30 280 392' : '-40 0 480 420') + '" preserveAspectRatio="xMidYMax ' + (compact ? 'meet' : 'slice') + '" role="img" style="--skin:' + a.skin + '">' +
    '<g data-layer="chair">' + art('chair',
      '<path d="M112,340 L112,96 C112,62 150,44 200,44 C250,44 288,62 288,96 L288,340 Z" fill="' + ART.crimson + '" stroke="' + ink + '" stroke-width="2.5"/>' +
      '<path d="M124,340 L124,100 C124,74 158,58 200,58 C242,58 276,74 276,100 L276,340" fill="none" stroke="' + ART.crimsonDark + '" stroke-width="1.5"/>' +
      '<g fill="' + ART.crimsonDark + '"><circle cx="146" cy="110" r="2.6"/><circle cx="254" cy="110" r="2.6"/><circle cx="140" cy="160" r="2.6"/><circle cx="260" cy="160" r="2.6"/><circle cx="200" cy="72" r="2.6"/></g>' +
      '<path d="M132,130 L132,240 M268,130 L268,240 M140,210 L140,300 M260,210 L260,300" stroke="' + ART.crimsonDark + '" stroke-width="1.2"/>') + '</g>' +
    '<g data-part="figure">' +
      '<g data-layer="robe"><g data-part="robeIn" transform="translate(200,0) scale(' + sh + ',1) translate(-200,0)">' + art('robe',
        '<path d="M186,184 L186,214 L214,214 L214,184 Z" fill="' + a.skin + '" stroke="' + ink + '" stroke-width="1.4"/>' +
        '<path d="M188,200 L196,205 M191,196 L197,200" stroke="' + ink + '" stroke-width="1" fill="none"/>' +
        '<path d="M172,200 C140,208 106,222 94,252 C82,282 72,312 66,340 L334,340 C328,312 318,282 306,252 C294,222 260,208 228,200 L200,222 Z" fill="' + ink + '" stroke="' + ART.paper + '" stroke-width=".8"/>' +
        '<g stroke="' + ART.paper + '" stroke-width="1.05" fill="none" stroke-linecap="round" opacity=".82">' +
          '<path d="M150,214 C128,240 112,280 104,334"/><path d="M162,222 C146,250 136,290 132,334"/><path d="M176,236 C168,262 164,300 163,334"/>' +
          '<path d="M250,214 C272,240 288,280 296,334"/><path d="M238,222 C254,250 264,290 268,334"/><path d="M224,236 C232,262 236,300 237,334"/>' +
          '<path d="M118,236 L102,268 M282,236 L298,268 M110,262 L96,296 M290,262 L304,296"/>' +
        '</g>' +
        '<path d="M178,201 L200,217 L222,201 L215,195 L200,207 L185,195 Z" fill="' + ART.paper + '" stroke="' + ink + '" stroke-width="1.4" stroke-linejoin="round"/>' +
        '<path d="M192,212 L199.2,214 L198,250 L187,250 Z M208,212 L200.8,214 L202,250 L213,250 Z" fill="' + ART.paper + '" stroke="' + ink + '" stroke-width="1.3" stroke-linejoin="round"/>' +
        '<path d="M190,244 L197,244 M203,244 L210,244" stroke="' + ink + '" stroke-width=".8"/>') + '</g></g>' +
      '<g data-layer="head">' +
        art('hairBack', a.back) +
        art('head',
          '<path d="M165,136 C157,133 156,152 165,157 M235,136 C243,133 244,152 235,157" fill="' + a.skin + '" stroke="' + ink + '" stroke-width="1.5"/>' +
          '<path d="' + face + '" fill="' + a.skin + '" stroke="' + ink + '" stroke-width="2" stroke-linejoin="round"/>' + a.marks +
          '<path d="M200,' + (ey + 3) + ' L195.5,' + (ey + 24) + ' Q200,' + (ey + 28.5) + ' 205.5,' + (ey + 24) + '" fill="none" stroke="' + ink + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>') +
        '<g data-layer="jaw">' + art('jaw',
          '<path d="M' + jawStart + ' ' + a.jaw + ' Z" fill="' + a.skin + '"/><path d="M' + jawStart + ' ' + a.jaw + '" fill="none" stroke="' + ink + '" stroke-width="2" stroke-linecap="round"/>' + a.jawExtras) + '</g>' +
        '<g data-layer="mouth" transform="translate(200,' + a.mouthY + ')">' + vis + '</g>' +
        '<g data-layer="eyes">' + art('eyeWhites', eye(eL) + eye(eR)) +
          '<g data-part="pupils">' + art('pupils', '<circle cx="' + eL + '" cy="' + (ey + .3) + '" r="2.9" fill="' + ink + '"/><circle cx="' + eR + '" cy="' + (ey + .3) + '" r="2.9" fill="' + ink + '"/>') + '</g></g>' +
        '<g data-layer="eyelids"><g data-part="lidL">' + art('lidL', lid(eL)) + '</g><g data-part="lidR">' + art('lidR', lid(eR)) + '</g></g>' +
        '<g data-layer="brows" fill="none" stroke="' + ink + '" stroke-width="' + a.browW + '" stroke-linecap="round">' +
          '<g data-part="browL">' + art('browL', '<path transform="translate(' + eL + ',' + by + ')" d="' + a.brow + '"/>') + '</g>' +
          '<g data-part="browR">' + art('browR', '<path transform="translate(' + eR + ',' + by + ') scale(-1,1)" d="' + a.brow + '"/>') + '</g></g>' +
        art('hair', a.hair) + art('extras', a.extras) +
      '</g>' +
    '</g>' +
    '<g data-layer="bench">' + art('bench',
      '<rect x="-40" y="326" width="480" height="16" fill="' + ART.benchtop + '" stroke="' + ink + '" stroke-width="1.5"/>' +
      '<path d="M-30,331 L70,331 M110,336 L190,336 M250,331 L330,331 M360,336 L430,336" stroke="' + ink + '" stroke-width=".7" opacity=".45"/>' +
      '<rect x="-40" y="342" width="480" height="80" fill="' + ART.bench + '"/>' +
      '<path d="M-40,350 L440,350" stroke="' + ART.benchtop + '" stroke-width="1.2"/>' +
      '<g fill="none" stroke="' + ART.paper + '" stroke-width=".9" opacity=".5"><rect x="-26" y="360" width="150" height="54"/><rect x="138" y="360" width="150" height="54"/><rect x="302" y="360" width="130" height="54"/></g>' +
      '<g stroke="' + ART.paper + '" stroke-width=".7" opacity=".28"><path d="M-18,368 L-18,406 M-8,366 L-8,408 M312,368 L312,406 M322,366 L322,408 M420,368 L420,406"/></g>') + '</g>' +
    '<g data-layer="nameplate"' + (compact ? ' transform="translate(78,0)"' : '') + '>' + art('nameplate',
      '<rect data-plate="mark" x="20" y="411" width="204" height="4" fill="' + ART.crimson + '"/>' +
      '<rect x="20" y="362" width="204" height="46" fill="' + ART.brass + '" stroke="' + ink + '" stroke-width="1.4"/>' +
      '<rect x="24" y="366" width="196" height="38" fill="none" stroke="#2E230C" stroke-width=".7" opacity=".7"/>' +
      '<circle cx="29.5" cy="385" r="1.6" fill="#2E230C"/><circle cx="214.5" cy="385" r="1.6" fill="#2E230C"/>' +
      '<text x="122" y="380" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8.6" font-weight="600" letter-spacing="1.3" fill="#2E230C" data-plate="top"></text>' +
      '<text x="122" y="398" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="18.5" font-weight="700" fill="#1B1408" data-plate="name"></text>') + '</g>' +
    '<g data-layer="hands"><g data-part="armsIn">' +
      '<g data-part="armL">' + art('armL', armMarkup('L', spec.profile.hands)) + '</g>' +
      '<g data-part="armR">' + art('armR', armMarkup('R', spec.profile.hands)) + '</g></g></g>' +
    '<g data-layer="gavel">' + art('gavelBlock', '<ellipse cx="398" cy="333" rx="24" ry="6" fill="' + ART.bench + '" stroke="' + ink + '" stroke-width="1.3"/><ellipse cx="398" cy="330.5" rx="20" ry="4.4" fill="#5A4630" stroke="' + ink + '" stroke-width="1"/>') +
      '<g data-part="gavel">' + art('gavel',
        '<path d="M352,320 L392,319.5 L392,324.5 L352,324 Z" fill="#5A4630" stroke="' + ink + '" stroke-width="1.2"/>' +
        '<rect x="388" y="306" width="20" height="24" rx="3" fill="' + ART.bench + '" stroke="' + ink + '" stroke-width="1.4"/>' +
        '<path d="M388,311 L408,311 M388,325 L408,325" stroke="' + ART.brass + '" stroke-width="1.6"/>') + '</g></g>' +
  '</svg>';
}

var ARM_POSE = {
  /* rest and lifted transforms for each hand style: [elbowX, elbowY, angleDeg] */
  pen:     { L: [80, 331, 97],  R: [322, 331, -97], Rlift: [304, 328, -20] },
  flat:    { L: [84, 331, 97],  R: [318, 331, -97], Rlift: [298, 326, -14] },
  steeple: { L: [139, 338, 35], R: [261, 338, -35], Rlift: [272, 336, -6] }
};
var STATE_POSE = {
  idle: {},
  listening:    { lean: .35, gy: .7, browL: -.6, browR: -.6 },
  skeptical:    { lean: .1, tilt: 5, browR: -4.6, browRotR: -9, browL: 1.3, browRotL: 4, lid: .2 },
  interrupting: { lean: 1, lift: 1, browL: -3, browR: -3, gy: .5, hy: 1.5 },
  speaking:     { lean: .22, gy: .45 },
  impressed:    { lean: .15, browL: -2.2, browR: -2.2, browRotL: -6, browRotR: 6, lid: .12, gy: .3 },
  stern:        { browL: 2.8, browR: 2.8, browRotL: 10, browRotR: -10, lid: .3, gy: .35 },
  verdict:      { lean: .2, gx: .9, gy: .5, lift: .16 }
};
var POSE_KEYS = ['lean', 'tilt', 'hx', 'hy', 'browL', 'browR', 'browRotL', 'browRotR', 'gx', 'gy', 'lid', 'lift', 'jaw', 'rise'];

function createJudge(host, opts) {
  var spec, parts = {}, visemes = {}, cur = {}, state = 'idle', mood = null, stateT = 0, t = 0;
  var patience = 70, curVis = 'rest', visHold = 0, nextBlink = 3, blinkT = -1, nextNod = 4, nodT = -1, tapT = 0;
  var gav = { t: -1, cb: null }, reduced = !!opts.reducedMotion, level = 0, riseTarget = 0;
  POSE_KEYS.forEach(function (k) { cur[k] = 0; });

  function setJudge(j) {
    j = j || {};
    spec = PORTRAITS[j.portrait] || PORTRAITS.purist;
    host.innerHTML = buildJudgeSVG(spec, !!opts.compact);          // static artwork only; names are set as text below
    var name = String(j.name || 'The Presiding Judge').slice(0, 40), top = String(opts.plateTop || '').toUpperCase().slice(0, 30);
    host.querySelector('svg').setAttribute('aria-label', name + ', seated at the bench');
    var tn = host.querySelector('[data-plate="name"]'), tt = host.querySelector('[data-plate="top"]');
    tn.textContent = name; tt.textContent = top;
    if (name.length > 19) tn.setAttribute('font-size', Math.max(10.5, 18.5 * 19 / name.length).toFixed(1));
    if (top.length > 24) tt.setAttribute('font-size', (8.6 * 24 / top.length).toFixed(1));
    parts = {}; visemes = {};
    host.querySelectorAll('[data-part],[data-layer]').forEach(function (el) { parts[el.getAttribute('data-part') || el.getAttribute('data-layer')] = el; });
    host.querySelectorAll('[data-viseme]').forEach(function (el) { visemes[el.getAttribute('data-viseme')] = el; });
    curVis = 'rest'; apply(0);
  }
  function setState(s, m) {
    if (STATES.indexOf(s) < 0) s = 'idle';
    if (s !== state) { stateT = 0; nodT = -1; }
    state = s; mood = m || null;
    if (s !== 'speaking') setViseme(s === 'stern' ? 'mbp' : s === 'impressed' ? 'smile' : 'rest', true);
    if (reduced) apply(0);
  }
  function setViseme(name, force) {
    if (!visemes[name] || name === curVis) return;
    if (!force && visHold > 0) return;
    visemes[curVis].style.display = 'none'; visemes[name].style.display = '';
    curVis = name; visHold = .065;
  }
  /* Lip-sync source A: live audio level 0..1 from the AnalyserNode (already smoothed by caller). */
  function mouthFromLevel(v) {
    level = v;
    setViseme(v < .035 ? 'rest' : v < .09 ? 'ee' : v < .2 ? 'oh' : 'ah');
  }
  /* Lip-sync source B (demo fallback): pick a shape from the character being "spoken". */
  function mouthFromChar(ch) {
    ch = (ch || ' ').toLowerCase();
    var v = 'ee';
    if (ch === 'a') v = 'ah'; else if (ch === 'o') v = 'oh'; else if (ch === 'u' || ch === 'w') v = 'oo';
    else if ('mbp'.indexOf(ch) >= 0) v = 'mbp'; else if ('fv'.indexOf(ch) >= 0) v = 'fv';
    else if (!/[a-z]/.test(ch)) v = 'rest';
    level = VISEMES[v].open * .3;
    setViseme(v);
  }
  function strikeGavel(cb) {
    if (reduced) { if (cb) cb(); return; }
    gav.t = 0; gav.cb = cb || null;
  }
  function enter() { cur.rise = reduced ? 0 : 1; riseTarget = 0; }

  function target() {
    var base = STATE_POSE[state] || {}, p = spec.profile, o = {};
    POSE_KEYS.forEach(function (k) { o[k] = base[k] || 0; });
    if (state === 'speaking' && mood && STATE_POSE[mood]) {
      var m = STATE_POSE[mood];
      ['browL', 'browR', 'browRotL', 'browRotR', 'lid', 'tilt'].forEach(function (k) { o[k] += (m[k] || 0) * .65; });
    }
    o.lean += p.baseLean; o.tilt += p.baseTilt;
    if (patience < 40) { var low = (40 - patience) / 40; o.browL += low * 1.6; o.browR += low * 1.6; o.browRotL += low * 4; o.browRotR -= low * 4; }
    o.jaw = state === 'speaking' ? VISEMES[curVis].open : 0;
    o.rise = riseTarget;
    return o;
  }
  function apply(dt) {
    if (!spec) return;
    var p = spec.profile, tg = target(), rate = (state === 'interrupting' ? 15 : 6.5) * p.speed;
    var k = reduced ? 1 : 1 - Math.exp(-dt * rate);
    POSE_KEYS.forEach(function (key) {
      var kk = key === 'jaw' ? (reduced ? 1 : 1 - Math.exp(-dt * 30)) : key === 'rise' ? (reduced ? 1 : 1 - Math.exp(-dt * 2.2)) : k;
      cur[key] += (tg[key] - cur[key]) * kk;
    });
    var c = {}; POSE_KEYS.forEach(function (key) { c[key] = cur[key]; });
    var breath = 0, tap = 0;
    if (!reduced) {
      /* ambient layer: the judge is never perfectly still */
      breath = Math.sin(t * 1.15);
      c.hx += Math.sin(t * .37) * 1.1; c.tilt += Math.sin(t * .23 + 1) * .7;
      c.gx += Math.sin(t * .51) * .12;
      nextBlink -= dt;
      if (nextBlink <= 0 && blinkT < 0) { blinkT = 0; nextBlink = p.blink[0] + Math.random() * (p.blink[1] - p.blink[0]); }
      if (blinkT >= 0) { blinkT += dt; c.lid = Math.max(c.lid, Math.sin(Math.min(1, blinkT / .17) * Math.PI)); if (blinkT > .17) blinkT = -1; }
      if (state === 'listening') {
        nextNod -= dt; if (nextNod <= 0 && nodT < 0) { nodT = 0; nextNod = 3 + Math.random() * 3; }
        if (nodT >= 0) { nodT += dt; c.hy += Math.sin(Math.min(1, nodT / .55) * Math.PI) * 2.6; c.browL -= Math.sin(Math.min(1, nodT / .55) * Math.PI); if (nodT > .55) nodT = -1; }
      }
      if (state === 'impressed' && stateT < 1.1) c.hy += Math.abs(Math.sin(stateT / 1.1 * Math.PI * 2)) * 3.4;
      if (state === 'stern' && stateT < 2.2) c.hx += Math.sin(stateT / 2.2 * Math.PI * 4) * 3.6 * (1 - stateT / 2.2);
      if (state === 'skeptical') { tapT = (tapT + dt) % 2.4; if (tapT < .75) tap = Math.abs(Math.sin(tapT * 20)) * 4.5; }
      if (state === 'speaking') { c.hy += cur.jaw * 1.3; c.lift += Math.max(0, Math.sin(t * 1.9)) * .13 * p.gesture; c.hx += Math.sin(t * 2.3) * .8 * p.gesture; }
      if (state === 'verdict' && gav.t >= 0) c.gx = .9;
    }
    var lean = c.lean, fig = 'translate(0,' + (lean * 5 + c.rise * 150).toFixed(2) + ') translate(200,338) scale(' + (1 + lean * .035).toFixed(4) + ') translate(-200,-338)';
    parts.figure.setAttribute('transform', fig);
    parts.figure.style.opacity = c.rise > .98 ? 0 : 1;
    parts.armsIn.setAttribute('transform', fig); parts.armsIn.style.opacity = Math.max(0, 1 - c.rise * 3).toFixed(2);
    parts.robe.setAttribute('transform', 'translate(200,338) scale(1,' + (1 + breath * .004).toFixed(4) + ') translate(-200,-338)');
    parts.head.setAttribute('transform', 'translate(' + c.hx.toFixed(2) + ',' + (c.hy - breath * .9).toFixed(2) + ') rotate(' + c.tilt.toFixed(2) + ',200,198)');
    var by = spec.art.eyeY - 13, ey = spec.art.eyeY;
    parts.browL.setAttribute('transform', 'translate(0,' + c.browL.toFixed(2) + ') rotate(' + c.browRotL.toFixed(2) + ',184,' + by + ')');
    parts.browR.setAttribute('transform', 'translate(0,' + c.browR.toFixed(2) + ') rotate(' + c.browRotR.toFixed(2) + ',216,' + by + ')');
    parts.pupils.setAttribute('transform', 'translate(' + (c.gx * 2.3).toFixed(2) + ',' + (c.gy * 1.5).toFixed(2) + ')');
    var ls = Math.max(0, Math.min(1, c.lid)).toFixed(3), top = ey - 5.6;
    parts.lidL.setAttribute('transform', 'translate(0,' + top + ') scale(1,' + ls + ') translate(0,' + (-top) + ')');
    parts.lidR.setAttribute('transform', 'translate(0,' + top + ') scale(1,' + ls + ') translate(0,' + (-top) + ')');
    parts.jaw.setAttribute('transform', 'translate(0,' + (c.jaw * 3.2).toFixed(2) + ')');
    parts.mouth.setAttribute('transform', 'translate(200,' + (spec.art.mouthY + c.jaw * 1.3).toFixed(2) + ')');
    var A = ARM_POSE[p.hands] || ARM_POSE.flat, L = Math.max(0, Math.min(1, c.lift));
    parts.armL.setAttribute('transform', 'translate(' + A.L[0] + ',' + A.L[1] + ') rotate(' + A.L[2] + ')');
    parts.armR.setAttribute('transform', 'translate(' + (A.R[0] + (A.Rlift[0] - A.R[0]) * L).toFixed(1) + ',' + (A.R[1] + (A.Rlift[1] - A.R[1]) * L).toFixed(1) + ') rotate(' + (A.R[2] + (A.Rlift[2] - A.R[2]) * L + tap).toFixed(2) + ')');
    /* gavel: quick wind-up, hard drop, one small bounce */
    var ga = 0;
    if (gav.t >= 0) {
      gav.t += dt; var g = gav.t;
      if (g < .26) ga = -62 * (1 - Math.pow(1 - g / .26, 3));
      else if (g < .34) ga = -62;
      else if (g < .42) ga = -62 * (1 - Math.pow((g - .34) / .08, 2));
      else { if (gav.cb) { var cb = gav.cb; gav.cb = null; cb(); } ga = g < .6 ? -9 * Math.sin((g - .42) / .18 * Math.PI) : 0; if (g >= .6) gav.t = -1; }
    }
    parts.gavel.setAttribute('transform', 'rotate(' + ga.toFixed(2) + ',352,322)');
  }
  function tick(dt) { t += dt; stateT += dt; visHold -= dt; apply(dt); }
  setJudge(opts.judge);
  return { setJudge: setJudge, setState: setState, getState: function () { return state; }, tick: tick, enter: enter,
    strikeGavel: strikeGavel, mouthFromLevel: mouthFromLevel, mouthFromChar: mouthFromChar,
    setPatience: function (v) { patience = v; }, setReduced: function (v) { reduced = !!v; if (reduced) apply(0); },
    spec: function () { return spec; } };
}


var ICONS = {
  mic: 'M12 3.5c-1.7 0-2.9 1.3-2.9 3v5c0 1.8 1.3 3.1 3 3.1s2.9-1.4 2.9-3.1v-5c0-1.7-1.3-3-3-3z M6.2 11.3c.1 3.4 2.5 5.9 5.8 5.9s5.8-2.4 5.9-5.9 M12 17.4v3.2 M8.8 20.7h6.5',
  sound: 'M4 9.6h3.2l4.3-3.7v12.3l-4.3-3.8H4z M15 9.2c1.1 1.6 1.1 4 0 5.7 M17.6 6.9c2.3 2.9 2.3 7.3 0 10.3',
  mute: 'M4 9.6h3.2l4.3-3.7v12.3l-4.3-3.8H4z M15.4 9.6l4.8 5 M20.3 9.5l-5 5.1',
  moon: 'M19.5 14.2A8 8 0 0 1 9.7 4.4a8 8 0 1 0 9.8 9.8z',
  pause: 'M8.5 5.5v13 M15.5 5.6v12.9',
  book: 'M4.5 5.2c2.6-.8 5.2-.5 7.5 1 2.3-1.5 4.9-1.8 7.5-1v13c-2.6-.8-5.2-.5-7.5 1-2.3-1.5-4.9-1.8-7.5-1z M12 6.3v12.8',
  pencil: 'M4.6 19.4l1-4.3L16.4 4.4l3.2 3.2L8.9 18.4z M14.3 6.6l3.1 3.1',
  close: 'M6 6.2l12 11.7 M18 6L6 18.1',
  help: 'M9.2 9.1c.2-1.8 1.4-2.9 3-2.9 1.7 0 2.9 1.1 2.9 2.7 0 2.5-3 2.6-3 5.2 M12.1 17.6v.5',
  check: 'M5 12.6l4.3 4.4L19 7',
  query: 'M12 5v9 M12 18v.6',
  gavel: 'M10.5 6.5L14 3l5 5-3.5 3.5z M12.8 9.2l-8.3 8.3 M4 20.5h9',
  chev: 'M9 5.5l6.5 6.5L9 18.5'
};
function ico(n) { return '<svg class="mc-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[n] + '"/></svg>'; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* All sounds are synthesised; nothing is downloaded. Muted unless options.sound === true. */
function createSound(startMuted) {
  var ctx = null, muted = startMuted !== false, murmur = null;
  function ac() {
    try {
      if (!ctx) { var C = global.AudioContext || global.webkitAudioContext; if (!C) return null; ctx = new C(); }
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return ctx;
    } catch (e) { return null; }
  }
  function noise(sec, brown) {
    var c = ac(), n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; if (brown) { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    var s = c.createBufferSource(); s.buffer = b; return s;
  }
  function env(g, t0, peak, attack, decay) { g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + attack); g.gain.exponentialRampToValueAtTime(.0001, t0 + attack + decay); }
  function knockAt(c, t0, f, vol, len) {
    var o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * .5, t0 + len);
    env(g, t0, vol, .004, len); o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + len + .05);
    var n = noise(.06), nf = c.createBiquadFilter(), ng = c.createGain(); nf.type = 'bandpass'; nf.frequency.value = f * 6; nf.Q.value = 1.2;
    env(ng, t0, vol * .5, .002, .04); n.connect(nf).connect(ng).connect(c.destination); n.start(t0);
  }
  function play(fn) { if (muted) return; var c = ac(); if (!c) return; try { fn(c, c.currentTime + .01); } catch (e) {} }
  return {
    context: ac,
    isMuted: function () { return muted; },
    setMuted: function (m) { muted = !!m; if (muted && murmur) this.murmur(false); },
    gavel: function (soft) { play(function (c, t) { knockAt(c, t, soft ? 210 : 170, soft ? .35 : .8, soft ? .12 : .2); }); },
    thud: function () { play(function (c, t) { knockAt(c, t, 95, .7, .16); }); },
    knock: function () { play(function (c, t) { knockAt(c, t, 250, .3, .09); knockAt(c, t + .19, 235, .26, .09); }); },
    rustle: function () { play(function (c, t) {
      var n = noise(.4), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = .8;
      f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(5200, t + .18); f.frequency.exponentialRampToValueAtTime(1800, t + .36);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .08); g.gain.exponentialRampToValueAtTime(.05, t + .2); g.gain.exponentialRampToValueAtTime(.0001, t + .38);
      n.connect(f).connect(g).connect(c.destination); n.start(t);
    }); },
    murmur: function (on) {
      if (!on) { if (murmur && ctx) { try { murmur.g.gain.cancelScheduledValues(ctx.currentTime); murmur.g.gain.setTargetAtTime(.0001, ctx.currentTime, .5); murmur.n.stop(ctx.currentTime + 2.5); } catch (e) {} murmur = null; } return; }
      if (murmur) return;
      play(function (c, t) {
        var n = noise(4, true), f = c.createBiquadFilter(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
        n.loop = true; f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = .6;
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.2, t + 1.2);
        l.frequency.value = 2.3; lg.gain.value = .07; l.connect(lg).connect(g.gain); l.start(t);
        n.connect(f).connect(g).connect(c.destination); n.start(t); murmur = { n: n, g: g };
      });
    },
    destroy: function () { try { this.murmur(false); if (ctx) ctx.close(); } catch (e) {} ctx = null; }
  };
}


/* ===== ROUND LOGIC + EVENTS ===== */
/* Full reference: JUDGE_SIM_API.md. Every string that arrives from the host (options or events)
   is written with textContent / setAttribute only. innerHTML is used for the component's own
   static markup and icons, never for host data. */

/* ---- RITUAL + COURT WORDING: the one place to change or switch these off ----
   allRise : show the usher's call (and, if sound is on, a short murmur) while the bench enters.
   gavel   : draw the gavel, tap it once on entry and strike it at the assessment.
             Set to false and the gavel is not drawn and makes no sound anywhere.
   Both can be set per mount: mount(el, { ritual: { gavel: false } }).
   COPY holds every phrase that depends on the forum; override per mount with options.copy. */
var RITUAL = { allRise: true, gavel: true };
var COPY = {
  stage: 'MootCoach · Bench Simulator',
  coverTitle: 'The Court is about to sit.',
  usher: 'All rise',
  usherSpoken: 'All rise. The Court is in session.',
  courtLabel: 'Court No. 1',
  openingCue: 'May it please the Hon’ble Court.',
  interjects: 'The Court interjects.',
  adjourned: 'The Court is adjourned.',
  enter: 'Enter the courtroom'
};
var PHASES = [['entry', 'Entry'], ['opening', 'Opening'], ['cross', 'Questions'], ['closing', 'Closing'], ['verdict', 'Assessment']];
var MIC_COPY = {
  voice: {
    closed:      ['Mic closed', 'The Court is not yet in session.'],
    idle:        ['Your floor', 'Begin when ready. The bench can hear you.'],  /* MootCoach: the mic is open for the whole round */
    live:        ['You have the floor', 'The bench is listening.'],
    ducked:      ['Hold, Counsel', 'The bench is speaking.'],
    answer:      ['You may answer', 'Answer the question that was asked.'],
    considering: ['The bench is considering', 'A question is coming.'],
    adjourned:   ['Adjourned', 'The assessment will follow.']
  },
  text: {
    closed:      ['Not yet in session', ''],
    idle:        ['Your submission', ''],
    live:        ['Your submission', ''],
    ducked:      ['The bench is speaking', ''],
    answer:      ['You may answer', ''],
    considering: ['The bench is considering', ''],
    adjourned:   ['Adjourned. The assessment will follow', '']
  }
};
var DIFFICULTY = { easy: ['Easy bench', 80], moderate: ['Moderate bench', 70], hard: ['Hard bench', 58] };
var PRESSURE = { 1: 88, 2: 72, 3: 55, 4: 36, 5: 18 };          // pressureLevel -> temper of the bench
var MOODS = ['neutral', 'skeptical', 'stern', 'impressed'];
var CRITERIA = [['knowledgeOfLaw', 'Knowledge of law', 25], ['applicationToFacts', 'Application to facts', 25],
  ['responseToQuestions', 'Response to questions', 25], ['courtCraft', 'Court craft', 15], ['structureAndTime', 'Structure and time', 10]];
var AUTH = { checking: ['Checking', 'query'], verified: ['Verified', 'check'], corrected: ['Corrected', 'pencil'], unconfirmed: ['Unconfirmed', 'query'] };
var END_REASONS = { time: 'Time has expired.', timer_expired: 'Time has expired.', counsel_closed: 'Counsel has closed.', student_exit: 'Counsel has closed.' };
var uid = 0;

function merge(base, over) { var o = {}, k; for (k in base) o[k] = base[k]; if (over && typeof over === 'object') for (k in over) if (over[k] !== undefined && k in base) o[k] = over[k]; return o; }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 600) : ''; }
function fnOrNull(f) { return typeof f === 'function' ? f : null; }
function keyOf(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function safeUrl(u) { if (typeof u !== 'string' || u.length > 2000 || !/^https?:\/\//i.test(u)) return ''; try { var p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : ''; } catch (e) { return ''; } }
/* Pick a portrait from an archetype label when the host does not name one. */
function portraitFor(archetype) {
  var a = keyOf(archetype);
  if (/mentor/.test(a)) return 'mentor';
  if (/hawk|procedur|jurisdiction|neutral/.test(a)) return 'hawk';
  if (/rights/.test(a)) return 'rights';
  if (/s[ck]eptic|hostile|evidence/.test(a)) return 'skeptic';
  return 'purist';
}
function normJudge(j, i) {
  j = j && typeof j === 'object' ? j : {};
  var arch = str(j.archetype, 60);
  return { id: str(j.id == null ? '' : String(j.id), 60) || ('judge-' + i), name: str(j.name, 60) || 'The Presiding Judge', archetype: arch,
    portrait: PORTRAITS[j.portrait] ? j.portrait : portraitFor(arch) };
}

function mount(container, options) {
  if (!container || typeof container.appendChild !== 'function') throw new Error('MootCoachJudgeSim.mount: a container element is required');
  options = options && typeof options === 'object' ? options : {};
  var cb = {};
  ['onSubmit', 'onMicStart', 'onMicStop', 'onExit', 'onRunAgain', 'onChangeBench', 'onRetry', 'onEvent'].forEach(function (k) { cb[k] = fnOrNull(options[k]); });
  var benchList = Array.isArray(options.bench) && options.bench.length > 1 ? options.bench.slice(0, 3).map(normJudge) : null;
  var dur = Number(options.durationSec);
  var o = {
    mode: options.mode === 'text' ? 'text' : 'voice',
    judges: benchList || [normJudge(options.judge, 0)],
    full: !!benchList,
    difficulty: DIFFICULTY[options.difficulty] ? options.difficulty : 'moderate',
    matter: str(options.matter && typeof options.matter === 'object' ? options.matter.title : options.matter, 160) || 'Untitled matter',
    side: str(options.side, 120) || 'Counsel',
    forumLabel: str(options.forumLabel, 40) || 'Hon’ble Presiding Judge',
    duration: dur > 0 ? Math.min(dur, 7200) : null,
    note: str(options.note, 200),
    ritual: merge(RITUAL, options.ritual),
    copy: merge(COPY, options.copy)
  };
  var presiding = o.full && o.judges.length === 3 ? 1 : 0;
  var micCopy = MIC_COPY[o.mode];
  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var mqDark = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var S = { phase: 'cover', patience: DIFFICULTY[o.difficulty][1], paused: false, busy: false, queue: [], mic: 'closed', studentLive: false,
    left: o.duration || 0, elapsed: 0, warned: 0, expired: false, lineNo: 0, liveLine: null, started: false, destroyed: false, verdict: false, ended: false,
    considering: false, lastSubmit: '', studentTurns: 0, prevLevel: 0, active: presiding, theme: 'auto',
    speech: null, reduced: options.reducedMotion === true || mq.matches, tasks: [], authSeen: {}, raf: 0, last: 0, clockShown: -1, analyser: null };
  var sound = createSound(options.sound !== true);
  var inputId = 'mc-input-' + (++uid);

  var timerHtml = '<div class="mc-timer" data-ref="timer" data-warn="0"><div class="mc-clock" data-ref="clock" role="timer" aria-label="Time remaining">00:00</div><div class="mc-inkbar"><i data-ref="inkbar"></i></div><span class="mc-mono">Time remaining</span></div>';
  var controlsHtml = o.mode === 'text'
    ? '<form class="mc-controls mc-textmode" data-ref="form" novalidate>' +
        '<div class="mc-compose"><label class="mc-micstate" for="' + inputId + '"><strong data-ref="micstrong"></strong><span data-ref="micspan"></span></label>' +
          '<textarea id="' + inputId + '" data-ref="input" rows="2" maxlength="4000" placeholder="Type your submission. Enter to send, Shift+Enter for a new line." disabled></textarea></div>' +
        '<button type="submit" class="mc-btn mc-send" data-ref="send" disabled>Send</button>' + timerHtml +
      '</form>'
    : '<div class="mc-controls">' +
        '<button type="button" class="mc-mic" data-act="mic" data-ref="mic" aria-label="Microphone">' + ico('mic') + '</button>' +
        '<div class="mc-micstate"><strong data-ref="micstrong"></strong><span data-ref="micspan"></span></div>' + timerHtml +
      '</div>';

  var root = el('div', 'mc-judgesim' + (o.full ? ' mc-full' : '') + (S.reduced ? ' mc-reduced' : '') + (o.ritual.gavel && !o.full ? '' : ' mc-nogavel'));
  root.setAttribute('data-mode', o.mode);
  root.innerHTML =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="mc-rough" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter></svg>' +
    '<header class="mc-top">' +
      '<div class="mc-brand"><b>&sect;</b><span class="mc-brandname"> MOOTCOACH</span></div>' +
      '<div class="mc-matter" data-ref="matter"></div>' +
      '<ol class="mc-phases" data-ref="phases" aria-label="Stage of the round">' + PHASES.map(function (p) { return '<li data-phase="' + p[0] + '">' + p[1] + '</li>'; }).join('') + '</ol>' +
      '<div class="mc-tools">' +
        '<button type="button" class="mc-tool" data-act="pause" aria-label="Pause the round" title="Pause">' + ico('pause') + '</button>' +
        '<button type="button" class="mc-tool" data-act="sound" aria-pressed="false" aria-label="Turn sounds on" title="Sound">' + ico('mute') + '</button>' +
        '<button type="button" class="mc-tool" data-act="night" aria-pressed="false" aria-label="Dark reading mode" title="Dark mode">' + ico('moon') + '</button>' +
        '<span data-ref="toolslot"></span>' +
        '<button type="button" class="mc-tool" data-act="exit" aria-label="Leave the courtroom" title="Leave">' + ico('close') + '</button>' +
      '</div>' +
    '</header>' +
    '<div class="mc-body">' +
      '<aside class="mc-notes" data-ref="notes" aria-label="Bench notes">' +
        '<div class="mc-panelhead"><h2>Bench notes</h2><button type="button" class="mc-tool mc-x" data-act="closesheet" aria-label="Close bench notes">' + ico('close') + '</button></div>' +
        '<p class="mc-mono">What the bench is probing</p>' +
        '<ul class="mc-notelist" data-ref="notelist"></ul><p class="mc-empty" data-ref="noteempty">Nothing noted yet. The bench writes little, and only what matters.</p>' +
      '</aside>' +
      '<main class="mc-stage">' +
        '<div class="mc-bencharea" data-ref="bench"><div class="mc-benchband"></div>' +
          '<div data-ref="seats"></div>' +
          '<div class="mc-usher" data-ref="usher" aria-hidden="true"></div>' +
          '<div class="mc-courtno mc-mono" aria-hidden="true"><span data-ref="courtlabel"></span><br><span data-ref="benchlabel"></span></div>' +
        '</div>' +
        '<div class="mc-temper" title="How the bench is taking your submissions">' +
          '<span class="mc-mono">Temper of the bench</span>' +
          '<div class="mc-temperline" role="meter" aria-label="Temper of the bench" aria-valuemin="0" aria-valuemax="100" data-ref="tempermeter"><div class="mc-temperink" data-ref="temper"></div></div>' +
          '<span class="mc-mono" data-ref="temperword">attentive</span>' +
        '</div>' +
        '<section class="mc-podium" data-ref="podium" data-mic="closed" aria-label="Your podium">' +
          '<div class="mc-slipzone"><div class="mc-slip" data-ref="slip">' +
            '<div class="mc-sliphead"><span class="mc-mono" data-ref="sliplabel">From the bench</span><b data-ref="slipflag" hidden>Interruption</b></div>' +
            '<p class="mc-sliptext" data-ref="sliptext" aria-hidden="true"></p>' +
          '</div></div>' +
          '<div class="mc-record"><div class="mc-rechead"><span class="mc-mono">Record<span class="mc-wide"> of ' + (o.mode === 'text' ? 'written' : 'oral') + ' submissions</span></span>' +
            '<div class="mc-sheetbtns"><button type="button" data-act="sheet-notes">' + ico('pencil') + 'Notes <b data-ref="notecount">0</b></button><button type="button" data-act="sheet-auth">' + ico('book') + 'Authorities <b data-ref="authcount2">0</b></button></div></div>' +
            '<ol class="mc-lines" data-ref="lines" aria-label="Transcript of your submissions"></ol></div>' +
          controlsHtml +
        '</section>' +
      '</main>' +
      '<aside class="mc-auth" data-ref="auth" data-open="1" aria-label="Authorities cited">' +
        '<button type="button" class="mc-authtab mc-mono" data-act="authtoggle" aria-label="Open authorities drawer">' + ico('book') + '<span>Authorities &middot; <span data-ref="authcount3">0</span></span></button>' +
        '<div class="mc-panelhead"><h2>Authorities</h2><span><button type="button" class="mc-tool mc-authtoggle" data-act="authtoggle" aria-label="Collapse authorities drawer" title="Collapse">' + ico('chev') + '</button><button type="button" class="mc-tool mc-x" data-act="closesheet" aria-label="Close authorities">' + ico('close') + '</button></span></div>' +
        '<p class="mc-mono">Cited by you in this round &middot; <span data-ref="authcount">0</span></p>' +
        '<ul class="mc-authlist" data-ref="authlist"></ul><p class="mc-empty" data-ref="authempty">No authority cited yet. Each one you name is listed here with the result of its check.</p>' +
        '<p class="mc-fine" data-ref="authfine"></p>' +
      '</aside>' +
    '</div>' +
    '<div class="mc-vh" aria-live="assertive" data-ref="live"></div><div class="mc-vh" aria-live="polite" data-ref="livepolite"></div>' +
    '<div class="mc-overlay mc-cover" data-ref="cover"><div class="mc-coverin">' +
      '<div class="mc-coverhead"><span class="mc-mono" data-ref="cstage"></span><span class="mc-mono" data-ref="cmode"></span></div>' +
      '<div><h1 data-ref="ctitle"></h1>' +
        '<dl class="mc-docket"><dt>Matter</dt><dd data-ref="cmatter"></dd><dt>You appear</dt><dd data-ref="cside"></dd><dt>Bench</dt><dd data-ref="cbench"></dd><dt>Time</dt><dd data-ref="ctime"></dd></dl>' +
        '<div class="mc-coveract"><button type="button" class="mc-btn" data-act="enter">' + ico('chev') + '<span data-ref="center"></span></button>' +
          '<button type="button" class="mc-btn mc-ghost" data-act="change" data-ref="cchange" hidden>Change the bench</button></div>' +
        '<p class="mc-mono mc-covernote" data-ref="cnote"></p></div>' +
      '<div class="mc-pick"><div class="mc-mono mc-picklegend">Your bench</div><div data-ref="seatlist"></div></div>' +
    '</div></div>' +
    '<div class="mc-overlay mc-pausev" data-ref="pausev" hidden><div class="mc-pausecard" role="dialog" aria-label="Round paused"><span class="mc-mono">Round stood over</span><h2>Paused.</h2><p>The clock is stopped and the bench is waiting. A real bench would not wait, so use this sparingly.</p><button type="button" class="mc-btn" data-act="resume">Resume the round</button></div></div>' +
    '<div class="mc-overlay mc-pausev" data-ref="errorv" hidden><div class="mc-pausecard" role="alertdialog" aria-label="The Court cannot proceed"><span class="mc-mono">Proceedings interrupted</span><h2>The Court cannot proceed.</h2><p data-ref="errmsg"></p><div class="mc-cardact"><button type="button" class="mc-btn" data-act="retry">Try again</button><button type="button" class="mc-btn mc-ghost" data-act="dismiss">Dismiss</button></div></div></div>' +
    '<div class="mc-overlay mc-verdictv" data-ref="verdictv" hidden><article class="mc-file" data-ref="file" role="dialog" aria-label="Assessment of the bench">' +
      '<span class="mc-mono">Assessment of the bench &middot; ' + (o.mode === 'text' ? 'written' : 'oral') + ' round</span>' +
      '<div class="mc-stamp" data-ref="stamp" aria-hidden="true"><span data-ref="stampword"></span><small data-ref="stampby"></small></div>' +
      '<div class="mc-scorerow"><div class="mc-score"><span data-ref="score">0</span><small>/ 100</small></div><p class="mc-summary" data-ref="summary"></p></div>' +
      '<div class="mc-findings"><div><h3>Noted with approval</h3><div data-ref="strong"></div></div><div class="mc-against"><h3>Where the bench was not persuaded</h3><div data-ref="danger"></div></div></div>' +
      '<div class="mc-criteria" data-ref="critwrap"><h3>Marks by criterion</h3><dl data-ref="criteria"></dl></div>' +
      '<div class="mc-priorities" data-ref="priowrap"><h3>Before the next round</h3><ol data-ref="priorities"></ol></div>' +
      '<div class="mc-fileact"><button type="button" class="mc-btn" data-act="again">Run it again</button><button type="button" class="mc-btn mc-ghost" data-act="change" data-ref="vchange" hidden>Change the bench</button><button type="button" class="mc-btn mc-ghost" data-act="exit" data-ref="vexit" hidden>Leave the courtroom</button></div>' +
    '</article></div>';
  container.appendChild(root);
  var R = {}; root.querySelectorAll('[data-ref]').forEach(function (n) { R[n.getAttribute('data-ref')] = n; });

  /* ---------- the bench: one seat, or three for the Full Bench ---------- */
  var seats = [], boxes = [];
  if (o.full) R.seats.className = 'mc-seats';
  o.judges.forEach(function (j, i) {
    var box = el('div', o.full ? 'mc-seatbox' : 'mc-judgebox'); R.seats.appendChild(box); boxes.push(box);
    seats.push(createJudge(box, { judge: j, compact: o.full, plateTop: o.full ? (i === presiding ? 'Presiding' : j.archetype) : o.forumLabel, reducedMotion: S.reduced }));
    var row = el('div', 'mc-seat' + (o.full ? '' : ' mc-on')), thumb = el('span', 'mc-thumb'), txt = el('span');
    thumb.setAttribute('aria-hidden', 'true'); thumb.innerHTML = buildJudgeSVG(PORTRAITS[j.portrait], false);
    txt.appendChild(el('strong', '', j.name)); if (j.archetype) txt.appendChild(el('small', '', j.archetype));
    txt.appendChild(el('span', 'mc-mono', o.full ? (i === presiding ? 'Presiding' : 'Member of the bench') : DIFFICULTY[o.difficulty][0]));
    row.appendChild(thumb); row.appendChild(txt); R.seatlist.appendChild(row);
  });
  function setActive(i) { if (i < 0 || i >= seats.length) i = presiding; S.active = i; boxes.forEach(function (b, k) { b.setAttribute('data-on', k === i ? '1' : '0'); }); }
  function findSeat(who) {
    var k = keyOf(who.replace(/^\[|\]$/g, '')); if (!k) return -1;
    for (var i = 0; i < o.judges.length; i++) { var n = keyOf(o.judges[i].name); if (keyOf(o.judges[i].id) === k || n === k || n.indexOf(k) >= 0 || k.indexOf(n) >= 0) return i; }
    return -1;
  }
  function benchState(s, mood) { seats.forEach(function (j, i) { if (i === S.active) j.setState(s, mood); else j.setState(s === 'listening' ? 'listening' : 'idle'); }); }
  function judge() { return seats[S.active]; }

  function call(name, arg) { if (!cb[name]) return false; try { cb[name](arg); } catch (err) { console.warn('[MootCoachJudgeSim] ' + name + ' threw', err); } return true; }
  function emit(type, extra) { if (!cb.onEvent) return; var e = { type: type, t: Date.now(), patience: Math.round(S.patience) }; if (extra) for (var k in extra) e[k] = extra[k]; call('onEvent', e); }
  function after(sec, fn) { S.tasks.push({ t: sec, fn: fn }); }
  function say(msg, polite) { var n = polite ? R.livepolite : R.live; n.textContent = ''; n.textContent = msg; }

  /* ---------- rendering helpers ---------- */
  function setPhase(p) {
    var idx = -1; PHASES.forEach(function (x, i) { if (x[0] === p) idx = i; });
    if (idx < 0 && p !== 'cover') return;
    S.phase = p;
    R.phases.querySelectorAll('li').forEach(function (li, i) { li.setAttribute('data-on', i < idx ? 'done' : i === idx ? 'now' : ''); if (i === idx) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    if (p === 'opening' && !S.lineNo && o.copy.openingCue) addLine('cue', 'Suggested opening: ', o.copy.openingCue);
    syncSend();
  }
  function setMic(m) {
    S.mic = m; R.podium.setAttribute('data-mic', m);
    var c = micCopy[m] || micCopy.idle; R.micstrong.textContent = c[0]; R.micspan.textContent = c[1];
    if (R.mic) R.mic.setAttribute('aria-label', 'Microphone. ' + c[0] + '. ' + c[1]);
    syncSend();
  }
  function syncSend() {
    if (!R.send) return;
    var open = S.started && !S.verdict && !S.ended && S.phase !== 'entry' && S.phase !== 'cover';
    R.input.disabled = !open; R.send.disabled = !open || S.considering;
  }
  function setPatience(v) {
    S.patience = clamp(v, 0, 100); seats.forEach(function (j) { j.setPatience(S.patience); });
    R.temper.style.transform = 'scaleX(' + (S.patience / 100).toFixed(3) + ')';
    var w = S.patience >= 80 ? 'receptive' : S.patience >= 58 ? 'attentive' : S.patience >= 38 ? 'guarded' : S.patience >= 20 ? 'short' : 'wearing thin';
    R.temperword.textContent = w; R.tempermeter.setAttribute('aria-valuenow', Math.round(S.patience)); R.tempermeter.setAttribute('aria-valuetext', w);
  }
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function drawClock() {
    if (!o.duration) return;
    var s = Math.ceil(S.left); if (s === S.clockShown) return; S.clockShown = s;
    R.clock.textContent = S.expired ? 'TIME' : fmt(S.left);
    R.inkbar.style.transform = 'scaleX(' + clamp(S.left / o.duration, 0, 1).toFixed(4) + ')';
  }
  function addLine(kind, text, quote) {
    var old = R.lines.querySelector('li[data-kind="cue"]'); if (old && kind !== 'cue') old.remove();
    var li = el('li'); li.setAttribute('data-kind', kind);
    if (kind === 'counsel') { S.lineNo++; li.setAttribute('data-n', (S.lineNo < 10 ? '0' : '') + S.lineNo); } else li.setAttribute('data-n', '');
    var p = el('p', '', text); if (quote) p.appendChild(el('q', '', quote));
    li.appendChild(p); R.lines.appendChild(li);
    while (R.lines.children.length > 60) R.lines.removeChild(R.lines.firstChild);
    R.lines.scrollTop = R.lines.scrollHeight; return li;
  }
  function addNote(text) {
    if (!text) return;
    R.noteempty.hidden = true;
    var li = el('li', 'mc-note mc-new'); li.appendChild(el('span', '', fmt(S.elapsed))); li.appendChild(document.createTextNode(text));
    R.notelist.insertBefore(li, R.notelist.firstChild);
    while (R.notelist.children.length > 6) R.notelist.removeChild(R.notelist.lastChild);
    R.notecount.textContent = R.notelist.children.length;
  }
  function onAuthority(raw) {
    var name = str(raw.name, 200); if (!name) return;
    var st = AUTH[raw.status] ? raw.status : 'unconfirmed', citation = str(raw.citation, 200), url = safeUrl(raw.url), key = keyOf(name);
    var li = S.authSeen[key];
    if (!li) { li = el('li'); S.authSeen[key] = li; R.authlist.insertBefore(li, R.authlist.firstChild); R.auth.setAttribute('data-open', '1'); }
    li.textContent = ''; li.className = 'mc-new';
    li.appendChild(el('cite', '', name));
    if (citation) li.appendChild(el('span', 'mc-cit', (st === 'corrected' ? 'Corrected citation: ' : '') + citation));
    var tag = el('span', 'mc-tag'); tag.setAttribute('data-s', st); tag.innerHTML = ico(AUTH[st][1]); tag.appendChild(document.createTextNode(AUTH[st][0])); li.appendChild(tag);
    if (url) { var a = el('a', 'mc-authlink', 'Open the source'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.appendChild(a); }
    R.authempty.hidden = true;
    var n = R.authlist.children.length; R.authcount.textContent = n; R.authcount2.textContent = n; R.authcount3.textContent = n;
    say(name + ': ' + AUTH[st][0], true);
  }
  function showSlip(text, label, interrupt) {
    R.sliplabel.textContent = label || 'From the bench'; R.slipflag.hidden = !interrupt;
    R.sliptext.textContent = text;
    R.slip.classList.remove('mc-slide'); void R.slip.offsetWidth; R.slip.classList.add('mc-slide');
  }
  function slipLabel() { return o.full ? o.judges[S.active].name : 'From the bench'; }

  /* ---------- student side ---------- */
  function canSpeak() { return S.started && !S.verdict && !S.ended && S.phase !== 'cover' && S.phase !== 'entry'; }
  function studentStart() {
    if (S.studentLive || !canSpeak()) return false;
    S.studentLive = true; S.liveLine = null; S.considering = false; setMic('live');
    if (!S.busy) benchState('listening');
    emit('student_speech_started'); return true;
  }
  function studentEnd(interrupted) {
    if (!S.studentLive) return;
    S.studentLive = false;
    var text = S.liveLine ? S.liveLine.querySelector('p').textContent : '';
    if (S.liveLine) { S.liveLine.classList.remove('mc-live'); if (interrupted) S.liveLine.querySelector('p').textContent = text + ' —'; }
    S.liveLine = null; if (text) S.studentTurns++;
    emit('student_speech_ended', { transcript: text, interrupted: !!interrupted });
    if (!S.busy && !S.verdict && !S.ended) { setMic('idle'); benchState('idle'); }
  }
  function pushTranscript(text, isFinal) {
    if (S.destroyed || typeof text !== 'string') return;
    text = text.slice(0, 4000);
    if (!S.studentLive && !studentStart()) return;
    if (!S.liveLine) { S.liveLine = addLine('counsel', ''); S.liveLine.classList.add('mc-live'); }
    S.liveLine.querySelector('p').textContent = text; R.lines.scrollTop = R.lines.scrollHeight;
    if (isFinal) { S.liveLine.classList.remove('mc-live'); S.liveLine = null; if (text) S.studentTurns++; }
  }
  function setConsidering(on) {
    on = !!on; if (on && (!canSpeak() || S.busy)) return;
    S.considering = on;
    if (on) { setMic('considering'); benchState('listening'); say(micCopy.considering[0] + '.', true); }
    else if (S.mic === 'considering') setMic('idle');
    syncSend();
  }
  function submitText() {
    if (o.mode !== 'text' || !canSpeak() || S.considering) return;
    var t = R.input.value.replace(/\s+$/, '').slice(0, 4000); if (!t.trim()) return;
    S.queue = []; if (S.speech) endSpeech(true);
    addLine('counsel', t); R.input.value = ''; S.studentTurns++; S.lastSubmit = t;
    setConsidering(true);
    if (!call('onSubmit', t)) console.warn('[MootCoachJudgeSim] text mode needs options.onSubmit');
    emit('student_submitted', { text: t });
  }

  /* ---------- judge side ---------- */
  function normaliseTurn(e) {
    var lvl = Math.round(Number(e.pressureLevel)); if (!(lvl >= 1 && lvl <= 5)) lvl = 0;
    var mood = MOODS.indexOf(e.mood) >= 0 ? e.mood
      : !lvl ? 'neutral' : (S.prevLevel && S.prevLevel - lvl >= 2) ? 'impressed' : lvl >= 4 ? 'stern' : lvl === 3 ? 'skeptical' : 'neutral';
    return { text: typeof e.text === 'string' ? e.text.trim().slice(0, 1200) : '', speaker: str(e.speakingJudge, 80), level: lvl, mood: mood,
      note: str(e.targetWeakness, 160), interrupt: e.interrupt === true, streaming: e.streaming === true };
  }
  function onJudgeTurn(raw) {
    if (S.verdict || !S.started || S.phase === 'cover' || S.ended) return;      // late or early event: drop quietly
    var e = normaliseTurn(raw);
    if (S.busy) {
      if (e.interrupt) endSpeech(true);
      else { S.queue.push(e); if (S.queue.length > 3) S.queue.shift(); return; }
    }
    beginTurn(e);
  }
  function beginTurn(e) {
    S.busy = true; S.considering = false;
    if (o.full && e.speaker) { var i = findSeat(e.speaker); if (i >= 0 && i !== S.active) { benchState('idle'); setActive(i); } }
    if (S.phase === 'opening' && S.studentTurns > 0) setPhase('cross');
    if (e.level) { setPatience(PRESSURE[e.level]); S.prevLevel = e.level; }
    if (e.interrupt) {
      if (S.studentLive) { studentEnd(true); addLine('mark', o.copy.interjects); }
      setMic('ducked'); benchState('interrupting'); sound.rustle();
      showSlip(e.text, slipLabel(), true);
      after(.65, function () { addNote(e.note); speak(e); });
    } else {
      if (S.studentLive) studentEnd(false);
      setMic('ducked');
      var react = e.mood !== 'neutral';
      if (react) benchState(e.mood);
      after(react ? .9 : .15, function () { addNote(e.note); sound.rustle(); showSlip(e.text, slipLabel(), false); speak(e); });
    }
  }
  function speak(e) {
    if (S.verdict || S.destroyed) return;
    benchState('speaking', e.mood);
    if (!e.streaming) say(e.text);                          // full caption to screen readers once
    var sp = { e: e, pos: 0, hold: 0, streaming: e.streaming, deadline: e.streaming ? 120 : 6 + e.text.length / 6,
      cps: judge().spec().profile.speech * (o.mode === 'text' ? 2.4 : 1) };
    S.speech = sp;
    if (!e.text && !e.streaming) { after(.3, function () { if (S.speech === sp) endSpeech(false); }); }
  }
  function tickSpeech(dt) {
    var sp = S.speech; if (!sp) return;
    sp.deadline -= dt;
    if (sp.deadline <= 0) { endSpeech(false); return; }      // watchdog: never stay stuck in "speaking"
    var lvl = S.analyser ? readLevel(dt) : -1, heard = lvl > .03, txt = sp.e.text;
    if (heard) judge().mouthFromLevel(lvl);
    if (sp.hold > 0) { sp.hold -= dt; if (!heard) judge().mouthFromChar(' '); return; }
    if (sp.pos >= txt.length) { if (!heard) judge().mouthFromChar(' '); if (!sp.streaming && sp.pos >= txt.length + 2) endSpeech(false); else if (!sp.streaming) sp.pos += dt * sp.cps; return; }
    var before = Math.floor(sp.pos); sp.pos += dt * sp.cps; var now = Math.floor(sp.pos);
    if (now !== before) {
      var ch = txt.charAt(Math.min(now, txt.length - 1));
      if (!heard) judge().mouthFromChar(S.analyser && sp.streaming ? ' ' : ch);
      if (ch === ',' || ch === ';') sp.hold = .16; else if ('.?!'.indexOf(ch) >= 0) sp.hold = .3;
    }
  }
  function endSpeech(cut) {
    var sp = S.speech; if (!sp) { S.busy = false; return; }
    S.speech = null; S.busy = false;
    var m = sp.e.mood;
    benchState(m === 'neutral' ? 'idle' : m);
    if (cut) return;
    if (sp.streaming) say(sp.e.text);
    if (S.queue.length) { var nx = S.queue.shift(); after(.35, function () { if (!S.busy && !S.verdict) beginTurn(nx); else S.queue.unshift(nx); }); }
    else if (S.ended) setMic('adjourned');
    else if (!S.verdict) { setMic('answer'); say(micCopy.answer[0], true); }
    emit('judge_speech_ended', { text: sp.e.text });
  }
  /* Streamed voice: text arrives in pieces while the audio plays. */
  function appendJudgeText(text) {
    var sp = S.speech; if (!sp || !sp.streaming || typeof text !== 'string') return false;
    sp.e.text = (sp.e.text + text).slice(0, 1200); R.sliptext.textContent = sp.e.text; return true;
  }
  function attachJudgeAudio(src) {
    try {
      if (!src) { S.analyser = null; return false; }
      var an = null;
      if (typeof src.getByteTimeDomainData === 'function') an = src;                                   // an AnalyserNode the host already has
      else if (src.context && typeof src.connect === 'function') { an = src.context.createAnalyser(); an.fftSize = 512; src.connect(an); }   // any AudioNode: analyse in ITS context
      else if (global.MediaStream && src instanceof global.MediaStream) { var c = sound.context(); if (!c) return false; an = c.createAnalyser(); an.fftSize = 512; c.createMediaStreamSource(src).connect(an); }
      if (!an) return false;
      S.analyser = { an: an, buf: new Uint8Array(an.fftSize), level: 0 };
      return true;
    } catch (e) { console.warn('[MootCoachJudgeSim] attachJudgeAudio failed', e); S.analyser = null; return false; }
  }
  function readLevel(dt) {
    var A = S.analyser; A.an.getByteTimeDomainData(A.buf);
    var sum = 0; for (var i = 0; i < A.buf.length; i++) { var v = (A.buf[i] - 128) / 128; sum += v * v; }
    var rms = Math.sqrt(sum / A.buf.length) * 2.6;
    var k = rms > A.level ? 1 - Math.exp(-dt * 45) : 1 - Math.exp(-dt * 14);   // fast attack, slower release = no flicker
    A.level += (rms - A.level) * k; return clamp(A.level, 0, 1);
  }

  /* ---------- adjournment, verdict, error ---------- */
  function onSessionEnd(raw) {
    if (S.ended || S.verdict || !S.started) return;
    S.queue = []; if (S.speech) endSpeech(true); if (S.studentLive) studentEnd(false);
    S.ended = true; S.considering = false; S.busy = false; setActive(presiding);
    var why = END_REASONS[str(raw.reason, 40)]; if (why) addLine('mark', why);
    setPhase('closing'); sound.murmur(false);
    beginTurn({ text: o.copy.adjourned, speaker: '', level: 0, mood: 'neutral', note: '', interrupt: false, streaming: false });
    emit('session_ended', { reason: str(raw.reason, 40) });
  }
  function moment(host, quote, lines) {
    host.textContent = '';
    if (quote) host.appendChild(el('blockquote', 'mc-quote', quote));
    lines.forEach(function (l) { if (!l[1]) return; var p = el('p', l[0] ? 'mc-better' : ''); if (l[0]) p.appendChild(el('b', 'mc-mono', l[0])); p.appendChild(document.createTextNode(l[1])); host.appendChild(p); });
    if (!host.firstChild) host.appendChild(el('p', 'mc-empty', 'None recorded.'));
  }
  function onVerdict(raw) {
    if (S.verdict || !S.started) return;
    var obj = function (x) { return x && typeof x === 'object' ? x : {}; };
    var score = clamp(Math.round(Number(raw.overallScore)) || 0, 0, 100), card = obj(raw.scorecard), sm = obj(raw.strongestMoment), dm = obj(raw.mostDangerousMoment);
    var v = { overallScore: score, verdict: str(raw.verdict, 500) };
    S.verdict = true; S.queue = []; if (S.speech) endSpeech(true); if (S.studentLive) studentEnd(false);
    S.busy = false; S.considering = false; setPhase('verdict'); setMic(S.ended ? 'adjourned' : 'closed'); sound.murmur(false); R.errorv.hidden = true;
    setActive(presiding); benchState('verdict');
    var strike = o.ritual.gavel && !o.full;
    if (strike) after(.35, function () { judge().strikeGavel(function () { sound.gavel(); }); });
    after(strike ? 1.25 : .5, function () {
      R.score.textContent = score; R.summary.textContent = v.verdict;
      moment(R.strong, str(sm.statement, 500), [['', str(sm.whyItWorked, 500)]]);
      moment(R.danger, str(dm.statement, 500), [['', str(dm.whyVulnerable, 500)], ['A better answer', str(dm.betterAnswer, 500)]]);
      R.criteria.textContent = '';
      CRITERIA.forEach(function (c) {
        var row = card[c[0]]; if (!row || typeof row !== 'object') return;
        var sc = clamp(Math.round(Number(row.score)) || 0, 0, c[2]), d = el('div', 'mc-crit');
        var dt = el('dt', '', c[1]), bar = el('span', 'mc-critbar'), fill = el('i'); fill.style.width = (sc / c[2] * 100).toFixed(1) + '%'; bar.appendChild(fill); dt.appendChild(bar);
        var dd = el('dd', 'mc-critscore', String(sc)); dd.appendChild(el('small', '', '/' + c[2])); dd.setAttribute('aria-label', sc + ' out of ' + c[2]);
        d.appendChild(dt); d.appendChild(dd); d.appendChild(el('dd', 'mc-critcomment', str(row.comment, 400))); R.criteria.appendChild(d);
      });
      R.critwrap.hidden = !R.criteria.firstChild;
      R.priorities.textContent = '';
      (Array.isArray(raw.trainingPriorities) ? raw.trainingPriorities : []).slice(0, 5).forEach(function (p) { p = str(p, 400); if (p) R.priorities.appendChild(el('li', '', p)); });
      R.priowrap.hidden = !R.priorities.firstChild;
      R.stampword.textContent = score >= 75 ? 'Commended' : score >= 55 ? 'Heard' : 'Re-list';
      R.stampby.textContent = o.full ? 'Full Bench' : o.judges[0].name;
      R.stamp.classList.remove('mc-land'); R.verdictv.hidden = false; R.verdictv.scrollTop = 0;
      say('Assessment of the bench. Score ' + score + ' out of 100. ' + v.verdict);
      var b = R.verdictv.querySelector('[data-act="again"]'); if (b) b.focus({ preventScroll: true });
    });
    after(strike ? 1.95 : 1.2, function () { R.stamp.classList.add('mc-land'); });
    after(strike ? 2.2 : 1.45, function () { sound.thud(); R.file.classList.remove('mc-thud'); void R.file.offsetWidth; R.file.classList.add('mc-thud'); });
    emit('verdict_shown', v);
  }
  function onError(raw) {
    if (!S.started || S.verdict) return;
    var msg = str(raw.message, 300) || 'Something went wrong. Please try again.';
    S.considering = false; if (S.mic === 'considering') setMic('idle'); if (!S.busy) benchState('idle'); syncSend();
    R.errmsg.textContent = msg; R.errorv.hidden = false; say(msg);
    var b = R.errorv.querySelector('[data-act="retry"]'); if (b) b.focus({ preventScroll: true });
  }
  function retry() {
    R.errorv.hidden = true;
    if (call('onRetry')) return;
    if (o.mode === 'text' && S.lastSubmit && canSpeak()) { setConsidering(true); call('onSubmit', S.lastSubmit); }
  }

  /* ---------- round lifecycle ---------- */
  function resetRound() {
    S.tasks = []; S.queue = []; S.speech = null; S.busy = false; S.studentLive = false; S.liveLine = null; S.verdict = false; S.started = false; S.ended = false;
    S.left = o.duration || 0; S.elapsed = 0; S.warned = 0; S.expired = false; S.lineNo = 0; S.authSeen = {}; S.clockShown = -1; S.paused = false;
    S.considering = false; S.lastSubmit = ''; S.studentTurns = 0; S.prevLevel = 0;
    R.lines.textContent = ''; R.notelist.textContent = ''; R.authlist.textContent = ''; R.noteempty.hidden = false; R.authempty.hidden = false;
    R.notecount.textContent = R.authcount.textContent = R.authcount2.textContent = R.authcount3.textContent = '0';
    R.sliptext.textContent = ''; R.sliptext.appendChild(el('i', '', 'The bench has not yet spoken.')); R.sliplabel.textContent = 'From the bench'; R.slipflag.hidden = true; R.slip.classList.remove('mc-slide');
    R.verdictv.hidden = true; R.pausev.hidden = true; R.errorv.hidden = true; R.timer.setAttribute('data-warn', '0'); R.usher.classList.remove('mc-show');
    if (R.input) R.input.value = '';
    setActive(presiding); setPatience(DIFFICULTY[o.difficulty][1]); setMic('closed'); benchState('idle'); drawClock(); sound.murmur(false);
  }
  function start() {
    if (S.destroyed) return;
    resetRound(); R.cover.hidden = true; S.started = true; setPhase('entry');
    seats.forEach(function (j) { j.enter(); });
    if (o.ritual.allRise) { sound.murmur(true); R.usher.classList.add('mc-show'); say(o.copy.usherSpoken, true); }
    after(S.reduced ? .4 : 2.3, function () { sound.murmur(false); if (o.ritual.gavel && !o.full) sound.gavel(true); R.usher.classList.remove('mc-show'); });
    after(S.reduced ? .6 : 2.9, function () { setPhase('opening'); setMic('idle'); emit('round_started', { duration_sec: o.duration }); });
  }
  function pause(on) {
    if (!S.started || S.verdict || S.paused === on) return;
    S.paused = on; R.pausev.hidden = !on;
    if (on) { var b = R.pausev.querySelector('button'); if (b) b.focus({ preventScroll: true }); }
    emit(on ? 'paused' : 'resumed');
  }
  function toCover() { resetRound(); S.phase = 'cover'; R.phases.querySelectorAll('li').forEach(function (li) { li.setAttribute('data-on', ''); li.removeAttribute('aria-current'); }); R.cover.hidden = false; syncSend(); }

  /* ---------- one loop drives everything (pose, speech, timer, scheduled beats) ---------- */
  function frame(ts) {
    if (S.destroyed) return;
    var dt = Math.min(.1, (ts - (S.last || ts)) / 1000); S.last = ts;
    try {
      if (!S.paused) {
        for (var i = S.tasks.length - 1; i >= 0; i--) { var tk = S.tasks[i]; tk.t -= dt; if (tk.t <= 0) { S.tasks.splice(i, 1); try { tk.fn(); } catch (e) { console.warn('[MootCoachJudgeSim] step failed', e); } } }
        tickSpeech(dt);
        if (S.started && !S.verdict && !S.ended && (S.phase === 'opening' || S.phase === 'cross' || S.phase === 'closing')) {
          S.elapsed += dt;
          if (o.duration && !S.expired) {
            S.left -= dt;
            var warnAt = Math.min(30, o.duration * .25);
            if (S.left <= Math.min(60, o.duration * .15) && S.phase === 'cross') setPhase('closing');
            if (S.left <= warnAt && S.warned < 1) { S.warned = 1; R.timer.setAttribute('data-warn', '1'); sound.knock(); say(Math.ceil(S.left) + ' seconds remaining.', true); }
            if (S.left <= 10 && S.warned < 2) { S.warned = 2; sound.knock(); say('Ten seconds.', true); }
            if (S.left <= 0) { S.left = 0; S.expired = true; S.clockShown = -1; sound.knock(); say('Time.'); emit('timer_expired'); }
          }
        }
        drawClock();
      }
      for (var s = 0; s < seats.length; s++) seats[s].tick(S.paused ? dt * .35 : dt);   // even when paused the bench keeps breathing
    } catch (err) { console.warn('[MootCoachJudgeSim] frame recovered', err); S.speech = null; S.busy = false; }
    S.raf = global.requestAnimationFrame(frame);
  }

  /* ---------- wiring ---------- */
  function closeSheets() { R.notes.removeAttribute('data-sheet'); R.auth.removeAttribute('data-sheet'); }
  function setTheme(t) {
    S.theme = t === 'dark' || t === 'light' ? t : 'auto';
    root.classList.toggle('mc-dark', S.theme === 'dark' || (S.theme === 'auto' && mqDark.matches)); syncTools();
  }
  function onClick(ev) {
    var b = ev.target.closest('[data-act]'); if (!b || !root.contains(b)) return;
    var act = b.getAttribute('data-act');
    if (act === 'enter') start();
    else if (act === 'mic') {
      sound.context();
      if (S.studentLive) { studentEnd(false); call('onMicStop'); }
      else if ((S.mic === 'idle' || S.mic === 'answer' || S.mic === 'considering') && studentStart()) call('onMicStart');
    }
    else if (act === 'pause') pause(true);
    else if (act === 'resume') pause(false);
    else if (act === 'sound') { sound.setMuted(!sound.isMuted()); syncTools(); }
    else if (act === 'night') { setTheme(root.classList.contains('mc-dark') ? 'light' : 'dark'); emit('theme', { theme: S.theme }); }
    else if (act === 'authtoggle') R.auth.setAttribute('data-open', R.auth.getAttribute('data-open') === '1' ? '0' : '1');
    else if (act === 'sheet-notes') { closeSheets(); R.notes.setAttribute('data-sheet', '1'); R.notes.querySelector('.mc-x').focus({ preventScroll: true }); }
    else if (act === 'sheet-auth') { closeSheets(); R.auth.setAttribute('data-sheet', '1'); R.auth.querySelector('.mc-x').focus({ preventScroll: true }); }
    else if (act === 'closesheet') closeSheets();
    else if (act === 'again') { if (!call('onRunAgain')) start(); }
    else if (act === 'change') call('onChangeBench');
    else if (act === 'exit') { if (!call('onExit')) toCover(); }
    else if (act === 'retry') retry();
    else if (act === 'dismiss') R.errorv.hidden = true;
  }
  function onSubmit(ev) { ev.preventDefault(); submitText(); }
  function onKey(ev) {
    if (ev.key === 'Escape') { closeSheets(); if (S.paused) pause(false); }
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.target === R.input) { ev.preventDefault(); submitText(); }
  }
  function syncTools() {
    var s = root.querySelector('[data-act="sound"]'), m = sound.isMuted();
    s.setAttribute('aria-pressed', m ? 'false' : 'true'); s.setAttribute('aria-label', m ? 'Turn sounds on' : 'Turn sounds off'); s.innerHTML = ico(m ? 'mute' : 'sound');
    root.querySelector('[data-act="night"]').setAttribute('aria-pressed', root.classList.contains('mc-dark') ? 'true' : 'false');
  }
  function onMq() { if (options.reducedMotion !== true) setReduced(mq.matches); }
  function onMqDark() { if (S.theme === 'auto') setTheme('auto'); }
  function setReduced(v) { S.reduced = !!v; root.classList.toggle('mc-reduced', S.reduced); seats.forEach(function (j) { j.setReduced(S.reduced); }); }
  root.addEventListener('click', onClick); root.addEventListener('keydown', onKey);
  if (R.form) R.form.addEventListener('submit', onSubmit);
  if (mq.addEventListener) { mq.addEventListener('change', onMq); mqDark.addEventListener('change', onMqDark); }

  R.usher.textContent = o.copy.usher; R.courtlabel.textContent = o.copy.courtLabel; R.cstage.textContent = o.copy.stage; R.ctitle.textContent = o.copy.coverTitle; R.center.textContent = o.copy.enter;
  R.cmode.textContent = o.mode === 'text' ? 'Written round' : 'Oral round';
  R.benchlabel.textContent = (o.full ? 'Full Bench' : (o.judges[0].archetype || o.judges[0].name)) + ' · ' + DIFFICULTY[o.difficulty][0];
  R.matter.textContent = o.matter + ' · ' + o.side;
  R.cmatter.textContent = o.matter; R.cside.textContent = o.side;
  R.cbench.textContent = (o.full ? 'Full Bench of ' + o.judges.length : o.judges[0].name) + ', ' + DIFFICULTY[o.difficulty][0].toLowerCase();
  R.ctime.textContent = o.duration ? fmt(o.duration) + ' on the clock' : 'No time limit';
  R.cnote.textContent = o.note; R.cnote.hidden = !o.note;
  R.authfine.textContent = o.note || 'The status shows what MootCoach’s check found. Read every authority yourself before relying on it.';
  R.timer.hidden = !o.duration;
  R.cchange.hidden = R.vchange.hidden = !cb.onChangeBench; R.vexit.hidden = !cb.onExit;
  setTheme(options.theme); resetRound();
  S.raf = global.requestAnimationFrame(frame);

  return {
    /* Feed every backend message here. Unknown, malformed or late events are ignored, never thrown. */
    handleEvent: function (evt) {
      if (S.destroyed) return false;
      try {
        if (!evt || typeof evt !== 'object') throw new Error('event is not an object');
        if (evt.type === 'judge_turn') onJudgeTurn(evt);
        else if (evt.type === 'authority') onAuthority(evt);
        else if (evt.type === 'session_end') onSessionEnd(evt);
        else if (evt.type === 'verdict') onVerdict(evt);
        else if (evt.type === 'error') onError(evt);
        else if (evt.type === 'phase') { if (!S.verdict && S.started) setPhase(evt.phase); }
        /* MootCoach addition: the bench's reading of an exchange that arrives after the
           judge has spoken (the voice round, whose judge sends speech only). Moves the
           temper line and adds a bench note without starting a judge turn. */
        else if (evt.type === 'bench_read') {
          if (S.verdict || S.ended || !S.started) return false;
          var lv = Math.round(Number(evt.pressureLevel));
          if (lv >= 1 && lv <= 5) { setPatience(PRESSURE[lv]); S.prevLevel = lv; }
          var nt = str(evt.targetWeakness, 160); if (nt) addNote(nt);
        }
        else { console.warn('[MootCoachJudgeSim] ignored event', evt.type); return false; }
        return true;
      } catch (err) { console.warn('[MootCoachJudgeSim] bad event ignored', err); S.speech = null; S.busy = false; return false; }
    },
    start: start, reset: toCover, pause: function () { pause(true); }, resume: function () { pause(false); },
    setStudentSpeaking: function (on) { if (on) studentStart(); else studentEnd(false); },
    pushTranscript: pushTranscript, attachJudgeAudio: attachJudgeAudio,
    appendJudgeText: appendJudgeText, endJudgeSpeech: function () { if (S.speech) endSpeech(false); },
    setConsidering: setConsidering, setTheme: setTheme,
    setMuted: function (m) { sound.setMuted(m); syncTools(); },
    isPaused: function () { return S.paused; },
    getSnapshot: function () { return { mode: o.mode, phase: S.phase, mic: S.mic, busy: S.busy, considering: S.considering, ended: S.ended, verdict: S.verdict,
      patience: S.patience, state: judge().getState(), speaking_judge: o.judges[S.active].id, seconds_left: o.duration ? S.left : null, seconds_elapsed: S.elapsed, reduced: S.reduced, theme: root.classList.contains('mc-dark') ? 'dark' : 'light' }; },
    destroy: function () {
      S.destroyed = true; global.cancelAnimationFrame(S.raf); S.tasks = [];
      root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey);
      if (mq.removeEventListener) { mq.removeEventListener('change', onMq); mqDark.removeEventListener('change', onMqDark); }
      sound.destroy(); if (root.parentNode) root.parentNode.removeChild(root);
    },
    /* test hooks used by demo.html; harmless in production */
    debug: { root: root, toolSlot: R.toolslot, input: R.input || null, states: STATES.slice(),
      setState: function (s, m) { benchState(s, m); if (s === 'verdict' && o.ritual.gavel && !o.full) judge().strikeGavel(function () { sound.gavel(); }); },
      setPatience: function (v) { setPatience(v); }, setSecondsLeft: function (s) { if (o.duration) { S.left = clamp(s, 0, o.duration); S.clockShown = -1; } }, setReducedMotion: setReduced }
  };
}

global.MootCoachJudgeSim = { mount: mount, portraits: PORTRAITS, portraitKeys: PORTRAIT_KEYS.slice(), portraitFor: portraitFor, ritual: RITUAL, copy: COPY, version: '1.0.0' };
})(window);
