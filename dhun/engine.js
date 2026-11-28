/* Dhun music engine
 * - A built-in catalog of original songs that are composed and synthesised on the device
 *   (Web Audio OfflineAudioContext), so the app has music with no server and no network.
 * - Deterministic: the same track id always renders the same song.
 * - Cover art drawn on a canvas, also deterministic.
 */
(function (global) {
  'use strict';

  var SR = 24000; // render rate: plenty for these synths, keeps WAVs small and renders fast

  /* ---------- small helpers ---------- */
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }
  function rint(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    mixo: [0, 2, 4, 5, 7, 9, 10], yaman: [0, 2, 4, 6, 7, 9, 11], bhairav: [0, 1, 4, 5, 7, 8, 11],
    kafi: [0, 2, 3, 5, 7, 9, 10], khamaj: [0, 2, 4, 5, 7, 9, 10], bhupali: [0, 2, 4, 7, 9]
  };
  var PENTA = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] };
  var KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

  var GENRES = {
    lofi: { name: 'Lo-fi beats', bpm: [70, 84], scales: ['dorian', 'minor', 'major', 'mixo'], melody: 'penta',
      prog: [[2, 5, 1, 6], [1, 6, 2, 5], [4, 3, 2, 1], [1, 4, 6, 5], [6, 4, 1, 5]], drums: 'lofi', bass: 'round',
      chords: 'epiano', lead: 'epiano', leadOct: 72, swing: 0.16, swingUnit: 16, sevenths: true, tone: 3200, crackle: true, rev: 0.28, target: [120, 160] },
    synthwave: { name: 'Synthwave', bpm: [92, 108], scales: ['minor', 'dorian'], melody: 'same',
      prog: [[1, 6, 3, 7], [1, 7, 6, 7], [6, 4, 1, 5], [1, 4, 6, 5]], drums: 'gated', bass: 'octave',
      chords: 'saw', lead: 'saw', leadOct: 72, arp: 'pluck', tone: 9000, rev: 0.35, target: [130, 170] },
    ambient: { name: 'Ambient', bpm: [56, 66], scales: ['major', 'mixo', 'dorian'], melody: 'penta',
      prog: [[1, 4], [1, 6, 4, 5], [4, 1], [6, 4, 1, 1]], drums: null, bass: 'sub', chords: 'wide', lead: 'bell', leadOct: 72,
      arp: 'bell', sparse: true, tone: 7000, rev: 0.6, target: [150, 190] },
    house: { name: 'House', bpm: [120, 125], scales: ['minor', 'dorian'], melody: 'penta',
      prog: [[1, 1, 6, 7], [1, 4, 6, 5], [6, 4, 1, 5], [1, 3, 4, 4]], drums: 'four', bass: 'offbeat',
      chords: 'stab', lead: 'pluck', leadOct: 72, sevenths: true, tone: 10000, rev: 0.3, target: [140, 180] },
    raga: { name: 'Raga fusion', bpm: [84, 98], scales: ['yaman', 'kafi', 'khamaj', 'bhairav'], melody: 'same',
      prog: [[1]], drums: 'tabla', bass: null, chords: null, drone: true, lead: 'sitar', leadOct: 62,
      tone: 8000, rev: 0.4, target: [140, 180] },
    chip: { name: 'Chiptune', bpm: [132, 150], scales: ['major', 'minor', 'mixo'], melody: 'same',
      prog: [[1, 5, 6, 4], [1, 4, 5, 1], [6, 4, 1, 5], [1, 6, 4, 5]], drums: 'chip', bass: 'chip', chords: null,
      lead: 'square', leadOct: 72, arp: 'chip', tone: 11000, rev: 0.12, target: [110, 140] },
    piano: { name: 'Solo piano', bpm: [62, 76], scales: ['major', 'minor'], melody: 'same',
      prog: [[1, 5, 6, 4], [6, 4, 1, 5], [1, 6, 2, 5], [4, 5, 3, 6]], drums: null, bass: 'piano', chords: 'piano',
      lead: 'piano', leadOct: 72, sparse: true, tone: 7000, rev: 0.45, target: [130, 170] },
    jazz: { name: 'Jazz café', bpm: [82, 96], scales: ['dorian', 'major', 'mixo'], melody: 'same',
      prog: [[2, 5, 1, 1], [1, 6, 2, 5], [3, 6, 2, 5], [1, 4, 3, 6]], drums: 'brush', bass: 'walk',
      chords: 'epiano', lead: 'vibes', leadOct: 72, swing: 0.3, swingUnit: 8, sevenths: true, tone: 6500, rev: 0.3, target: [130, 170] }
  };

  /* ---------- catalog (all original, fictional artists) ---------- */
  var ARTISTS = [
    { id: 'monsoon-window', name: 'Monsoon Window', genre: 'lofi', bio: 'Rainy-afternoon beats for studying, reading and doing nothing at all.',
      albums: [['Rain on Tin Roofs', 2025, ['Puddle Mirrors', 'Umbrella Stand', 'Wet Pavement Glow', 'Window Fog', 'Steam from the Cup']],
               ['Chai Break', 2026, ['Ginger & Cardamom', 'Study Hall 2 AM', 'Notebook Margins', 'Bus Stop Daydream', 'Last Biscuit']]] },
    { id: 'neon-ghats', name: 'Neon Ghats', genre: 'synthwave', bio: 'Retro synths and night highways through the Western Ghats.',
      albums: [['Night Drive to Nashik', 2024, ['Highway Lights', 'Toll Booth Lasers', 'Rearview', 'Mountain Pass 1986', 'Dashboard Glow']],
               ['Chrome Horizon', 2026, ['Sunset Grid', 'Laser Lotus', 'Overdrive Heart', 'Magenta Coast', 'City of Signals']]] },
    { id: 'slow-rivers', name: 'Slow Rivers', genre: 'ambient', bio: 'Long, slow soundscapes for sleep, focus and deep breaths.',
      albums: [['Estuary', 2025, ['Where Waters Meet', 'Mangrove Breath', 'Tide Tables', 'Salt and Silt', 'Heron at Dusk']],
               ['Low Clouds', 2026, ['Fog Over Fields', 'Weightless', 'Soft Altitude', 'Drift', 'The Long Exhale']]] },
    { id: 'pulse-theory', name: 'Pulse Theory', genre: 'house', bio: 'Four-on-the-floor grooves from the basement to sunrise.',
      albums: [['Warehouse Sunrise', 2025, ['Doors at Ten', 'Strobe Logic', 'Concrete Groove', 'Hands Up Hypothesis', '6 AM Exit']],
               ['Floor Plans', 2026, ['Basement Theory', 'Kick Drum Diaries', 'Sidechain Love', 'Open Hat Society', 'Afterhours Algebra']]] },
    { id: 'sitara-collective', name: 'Sitara Collective', genre: 'raga', bio: 'Raga melodies over tanpura drone and tabla, reimagined with synths.',
      albums: [['Evening Ragas', 2025, ['Yaman at Twilight', 'Lamp by the Ghat', 'Slow Meend', 'River Aarti', 'Starlit Alaap']],
               ['Dawn Sessions', 2026, ['First Light Bhairav', 'Temple Bells Far Away', 'Dew on Tulsi', 'Morning Riyaz', 'Sunrise Teental']]] },
    { id: 'pixel-mango', name: 'Pixel Mango', genre: 'chip', bio: 'Bright 8-bit tunes with a summer-holiday sugar rush.',
      albums: [['8-Bit Summer', 2024, ['Mango Power-Up', 'Beach Level Start', 'Coin Rain', 'Save Point Siesta', 'Turbo Scooter']],
               ['Boss Level Snacks', 2026, ['Samosa Boss Fight', 'Extra Life Lassi', 'Glitch Garden', 'High Score Holiday', 'Credits Roll']]] },
    { id: 'paper-keys', name: 'Paper Keys', genre: 'piano', bio: 'Quiet solo piano pieces, like letters written late at night.',
      albums: [['Letters Unsent', 2025, ['Dear You', 'Ink Stains', 'Envelope', 'Postmark from Home', 'Unsent']],
               ['Quiet Rooms', 2026, ['Morning Dust', 'Hallway Light', 'The Empty Chair', 'Curtains', 'Goodnight House']]] },
    { id: 'blue-chai-trio', name: 'Blue Chai Trio', genre: 'jazz', bio: 'Brushed drums, walking bass and vibraphone from the corner café.',
      albums: [['Late Set', 2024, ['Smoky Corners', 'Walking Home Slow', 'Brass Spoon Blues', 'Last Call', 'Midnight Kettle']],
               ['Corner Table', 2026, ['Napkin Sketches', 'Two Sugars', 'Rainy Day Regulars', 'Upright & Easy', 'Closing Time']]] }
  ];

  var MOODS = [
    { id: 'chill', name: 'Chill', genres: ['lofi', 'ambient', 'jazz'], color: '#3d7ea6' },
    { id: 'focus', name: 'Focus', genres: ['lofi', 'piano', 'ambient'], color: '#5b6abf' },
    { id: 'energize', name: 'Energise', genres: ['house', 'chip', 'synthwave'], color: '#e0663a' },
    { id: 'workout', name: 'Workout', genres: ['house', 'synthwave', 'chip'], color: '#c93b4f' },
    { id: 'sleep', name: 'Sleep', genres: ['ambient', 'piano'], color: '#33407a' },
    { id: 'party', name: 'Party', genres: ['house', 'chip'], color: '#b8398f' },
    { id: 'romance', name: 'Romance', genres: ['piano', 'jazz'], color: '#c2507a' },
    { id: 'classical', name: 'Indian classical', genres: ['raga'], color: '#c27a1f' },
    { id: 'commute', name: 'Commute', genres: ['synthwave', 'lofi', 'jazz'], color: '#2f8a76' },
    { id: 'gaming', name: 'Gaming', genres: ['chip', 'synthwave'], color: '#6c3fc1' }
  ];

  var catalog = { tracks: [], byId: {}, artists: [], artistById: {}, albums: [], albumById: {} };
  (function build() {
    var n = 0;
    ARTISTS.forEach(function (a) {
      var artist = { id: a.id, name: a.name, genre: a.genre, bio: a.bio, albums: [], tracks: [] };
      catalog.artists.push(artist); catalog.artistById[a.id] = artist;
      a.albums.forEach(function (al, ai) {
        var albumId = a.id + '--' + ai;
        var album = { id: albumId, title: al[0], year: al[1], artistId: a.id, artist: a.name, genre: a.genre, tracks: [], seed: hashStr(albumId) };
        catalog.albums.push(album); catalog.albumById[albumId] = album; artist.albums.push(albumId);
        al[2].forEach(function (title, ti) {
          var t = { id: 'g:' + (++n), src: 'gen', title: title, artist: a.name, artistId: a.id, album: al[0], albumId: albumId,
                    genre: a.genre, seed: hashStr(a.id + '|' + title), no: ti + 1 };
          if (/yaman/i.test(title)) t.scale = 'yaman';
          if (/bhairav/i.test(title)) t.scale = 'bhairav';
          if (/aarti|tulsi/i.test(title)) t.scale = 'bhupali';
          t.dur = plan(t).duration;
          catalog.tracks.push(t); catalog.byId[t.id] = t; album.tracks.push(t.id); artist.tracks.push(t.id);
        });
      });
    });
  })();

  /* ---------- composition plan ---------- */
  function plan(track) {
    var g = GENRES[track.genre];
    var r = mulberry(track.seed);
    var bpm = rint(r, g.bpm[0], g.bpm[1]);
    var scaleName = track.scale || pick(r, g.scales);
    var scale = SCALES[scaleName];
    var root = rint(r, 0, 11);
    var prog = pick(r, g.prog), progB = pick(r, g.prog);
    var beat = 60 / bpm, bar = beat * 4;
    var target = rint(r, g.target[0], g.target[1]);
    var sections = [{ type: 'intro', bars: 4 }];
    var seq = ['A', 'B', 'A', 'brk', 'B', 'A', 'B'];
    var total = 4, need = Math.max(16, Math.round(target / bar)) - 4, i = 0;
    while (total < need) { var ty = seq[i % seq.length]; var b = ty === 'brk' ? 4 : 8; sections.push({ type: ty, bars: b }); total += b; i++; }
    sections.push({ type: 'outro', bars: 4 }); total += 4;
    var lead0 = 0.05;
    return { g: g, bpm: bpm, beat: beat, bar: bar, step: beat / 4, scaleName: scaleName, scale: scale, root: root,
             key: KEYS[root] + ' ' + scaleName, prog: prog, progB: progB, sections: sections, bars: total, start: lead0,
             duration: Math.round((lead0 + total * bar + 3.5) * 10) / 10 };
  }

  var RHY = ['x...x...x.x.x...', 'x..x..x...x.x...', 'x.x.x...x...x.x.', '..x.x.x...x..x..', 'x...x..x..x.....',
             'x.....x.x...x...', 'x..x..x..x..x...', 'x.xx..x.x..x....', 'x...x.x...x.x.x.', '....x.x.x...x...'];
  var RHY_SPARSE = ['x.......x.......', 'x.....x.........', 'x...........x...', 'x.......x...x...', '....x.......x...'];

  function makeMotif(r, sparse, rest) {
    var bank = sparse ? RHY_SPARSE : RHY;
    var notes = [], idx = rint(r, 0, 3);
    for (var b = 0; b < 2; b++) {
      var pat = pick(r, bank);
      if (rest && b === 1 && r() < 0.4) pat = pat.slice(0, 8) + '........';
      for (var s = 0; s < 16; s++) {
        if (pat[s] !== 'x') continue;
        idx = clamp(idx + pick(r, [-2, -1, -1, 0, 1, 1, 2, 3, -3]), -3, 8);
        var len = 1; while (s + len < 16 && pat[s + len] !== 'x' && len < 8) len++;
        notes.push({ step: b * 16 + s, len: len, idx: idx });
      }
    }
    return notes;
  }

  function scaleMidi(sc, idx, base) {
    var L = sc.length, o = Math.floor(idx / L), m = ((idx % L) + L) % L;
    return base + sc[m] + 12 * o;
  }

  /* ---------- rendering ---------- */
  function render(track) {
    var p = plan(track), g = p.g;
    var r = mulberry(track.seed ^ 0x9e3779b9);
    var len = Math.ceil(p.duration * SR);
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    var ctx = new OAC(2, len, SR);
    var NY = SR / 2 - 200;

    // noise
    var nb = ctx.createBuffer(1, SR, SR), nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // master chain: bus -> tone -> comp -> master
    var bus = ctx.createGain();
    var tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = Math.min(g.tone, NY); tone.Q.value = 0.5;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.2;
    var master = ctx.createGain();
    bus.connect(tone); tone.connect(comp); comp.connect(master); master.connect(ctx.destination);
    // fade in / out
    var endT = p.start + p.bars * p.bar;
    master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(1, 0.6);
    master.gain.setValueAtTime(1, endT - p.bar * 3); master.gain.linearRampToValueAtTime(0.0001, p.duration - 0.2);

    // reverb
    var irLen = Math.floor(SR * 1.6), ir = ctx.createBuffer(2, irLen, SR);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6); }
    var conv = ctx.createConvolver(); conv.buffer = ir;
    var revIn = ctx.createGain(); revIn.gain.value = g.rev;
    var revHp = ctx.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 250;
    revIn.connect(revHp); revHp.connect(conv); conv.connect(bus);

    function channel(vol, pan, wet) {
      var inp = ctx.createGain(); inp.gain.value = vol;
      var node = inp;
      if (pan && ctx.createStereoPanner) { var sp = ctx.createStereoPanner(); sp.pan.value = pan; inp.connect(sp); node = sp; }
      node.connect(bus);
      if (wet) { var s = ctx.createGain(); s.gain.value = wet; node.connect(s); s.connect(revIn); }
      return inp;
    }
    var CH = {
      kick: channel(0.95, 0, 0), snare: channel(0.5, 0, 0.5), hat: channel(0.16, 0.25, 0.1), perc: channel(0.35, -0.2, 0.3),
      bass: channel(0.55, 0, 0), chords: channel(0.2, 0, 0.8), lead: channel(0.3, 0.05, 0.7), arp: channel(0.13, -0.3, 0.8),
      drone: channel(0.16, 0, 0.6), tabla: channel(0.55, 0.1, 0.35), fx: channel(0.5, 0, 0)
    };

    /* Notes are created just before they sound and disconnected once finished (see the suspend loop
       at the end); Chrome otherwise keeps processing every finished note for the whole song. */
    var live = [];
    function out(node, dest, end) { node.connect(dest); live.push([node, end]); }
    var EV = [];
    function defer(fn, ti) { return function () { EV.push({ t: arguments[ti], f: fn, a: Array.prototype.slice.call(arguments) }); }; }

    /* building blocks */
    function O(type, f, t) { var o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; }
    function G(v) { var gg = ctx.createGain(); gg.gain.value = v || 0; return gg; }
    function F(type, f, q) { var fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = Math.min(f, NY); if (q) fl.Q.value = q; return fl; }
    function adsr(gn, t, a, peak, sus, dec, dur, rel) {
      var p = gn.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
      p.setTargetAtTime(peak * sus, t + a, dec); p.setTargetAtTime(0, t + Math.max(dur, a), rel);
      return t + Math.max(dur, a) + rel * 6;
    }
    function noiseSrc(t, dur) { var s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.start(t, Math.random() * 0.9); s.stop(t + dur); return s; }
    function decayEnv(gn, t, v, tau) { gn.gain.setValueAtTime(v, t); gn.gain.setTargetAtTime(0, t + 0.002, tau); }

    function kick(t, v) {
      var o = O(g.drums === 'chip' ? 'square' : 'sine', 150, t), gn = G();
      o.frequency.exponentialRampToValueAtTime(g.drums === 'chip' ? 60 : 44, t + 0.11);
      gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      if (g.drums === 'chip') { var lp = F('lowpass', 900); o.connect(lp); lp.connect(gn); } else o.connect(gn);
      out(gn, CH.kick, t + 0.5); o.start(t); o.stop(t + 0.45);
    }
    function snare(t, v, brush) {
      var s = noiseSrc(t, brush ? 0.3 : 0.25), hp = F(brush ? 'bandpass' : 'highpass', brush ? 3000 : 1100, brush ? 0.6 : 0), gn = G();
      decayEnv(gn, t, v * (brush ? 0.35 : 0.8), brush ? 0.07 : 0.05);
      s.connect(hp); hp.connect(gn); out(gn, CH.snare, t + 0.35);
      if (!brush) { var o = O('triangle', 210, t), g2 = G(); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); decayEnv(g2, t, v * 0.5, 0.03); o.connect(g2); out(g2, CH.snare, t + 0.25); o.start(t); o.stop(t + 0.2); }
    }
    function clap(t, v) {
      var s = noiseSrc(t, 0.3), bp = F('bandpass', 1400, 1.2), gn = G(), p = gn.gain;
      p.setValueAtTime(v, t); p.setTargetAtTime(0.05, t + 0.001, 0.004); p.setValueAtTime(v, t + 0.012); p.setTargetAtTime(0.05, t + 0.013, 0.004);
      p.setValueAtTime(v, t + 0.024); p.setTargetAtTime(0, t + 0.025, 0.05);
      s.connect(bp); bp.connect(gn); out(gn, CH.snare, t + 0.35);
    }
    function hat(t, v, open) {
      var s = noiseSrc(t, open ? 0.4 : 0.1), hp = F('highpass', 7000), gn = G();
      decayEnv(gn, t, v, open ? 0.08 : 0.014); s.connect(hp); hp.connect(gn); out(gn, CH.hat, t + 0.45);
    }
    function tablaHit(t, bol, v) {
      var sa = p.root + 60; while (mtof(sa) > 560) sa -= 12; while (mtof(sa) < 280) sa += 12;
      var treble = { dha: 1, dhin: 1, na: 1, ta: 1, tin: 1, ge: 0 }[bol], bass = { dha: 1, dhin: 1, ge: 1 }[bol];
      var ring = (bol === 'dhin' || bol === 'tin') ? 0.12 : 0.045;
      if (treble) {
        var f = mtof(sa), o = O('sine', f * 1.02, t), o2 = O('sine', f * 2.01, t), gn = G(), g2 = G();
        o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
        decayEnv(gn, t, v * 0.6, ring); decayEnv(g2, t, v * 0.2, ring * 0.6);
        o.connect(gn); o2.connect(g2); out(gn, CH.tabla, t + ring * 8); out(g2, CH.tabla, t + ring * 8);
        o.start(t); o2.start(t); o.stop(t + ring * 8); o2.stop(t + ring * 8);
        var s = noiseSrc(t, 0.03), hp = F('highpass', 3000), gc = G(); decayEnv(gc, t, v * 0.25, 0.006); s.connect(hp); hp.connect(gc); out(gc, CH.tabla, t + 0.05);
      }
      if (bass) {
        var b = O('sine', 78, t), gb = G();
        b.frequency.exponentialRampToValueAtTime(118, t + 0.18);
        decayEnv(gb, t, v * 0.9, 0.14); b.connect(gb); out(gb, CH.tabla, t + 1); b.start(t); b.stop(t + 1);
      }
    }

    function bassNote(t, m, dur, v) {
      var f = mtof(m), type = g.bass, end;
      if (type === 'sub' || type === 'round' || type === 'piano' || type === 'walk') {
        var o = O(type === 'walk' ? 'triangle' : 'sine', f, t), o2 = O('triangle', f * 2, t), gn = G(), g2 = G(), lp = F('lowpass', type === 'walk' ? 900 : 600);
        var a = type === 'sub' ? 0.6 : 0.008, rel = type === 'sub' ? 0.8 : type === 'piano' ? 0.4 : 0.06;
        end = adsr(gn, t, a, v, type === 'walk' ? 0.5 : 0.8, type === 'piano' ? 0.6 : 0.3, dur, rel);
        adsr(g2, t, a, v * 0.25, 0.3, 0.1, dur, rel);
        o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(gn); out(gn, CH.bass, end);
        o.start(t); o2.start(t); o.stop(end); o2.stop(end);
      } else {
        var wave = type === 'chip' ? 'square' : 'sawtooth';
        var ob = O(wave, f, t), gb = G(), lpf = F('lowpass', type === 'chip' ? 2200 : 400, type === 'chip' ? 0 : 6);
        lpf.frequency.setValueAtTime(type === 'chip' ? 2200 : 1400, t); lpf.frequency.setTargetAtTime(type === 'chip' ? 2200 : 260, t, 0.06);
        end = adsr(gb, t, 0.005, v * (type === 'chip' ? 0.45 : 0.8), 0.7, 0.15, dur * 0.9, 0.04);
        ob.connect(lpf); lpf.connect(gb); out(gb, CH.bass, end); ob.start(t); ob.stop(end);
      }
    }

    var lastLead = null;
    function voice(kind, chan, t, m, dur, v) {
      var f = mtof(m), end, o, o2, o3, gn, g2, g3, lp;
      switch (kind) {
        case 'epiano':
          o = O('sine', f, t); o2 = O('sine', f * 2, t); o3 = O('sine', f * 3.01, t); gn = G(); g2 = G(); g3 = G();
          end = adsr(gn, t, 0.006, v, 0.35, 0.6, dur, 0.25);
          decayEnv(g2, t, v * 0.35, 0.25); decayEnv(g3, t, v * 0.15, 0.05);
          o.connect(gn); o2.connect(g2); o3.connect(g3); g2.connect(gn); g3.connect(gn); out(gn, chan, end);
          [o, o2, o3].forEach(function (x) { x.start(t); x.stop(end); });
          break;
        case 'piano':
          o = O('triangle', f, t); o2 = O('sine', f * 2.002, t); o3 = O('sine', f * 3.005, t); gn = G(); g2 = G(0.3); g3 = G(0.08);
          lp = F('lowpass', 2600 + (m - 48) * 30);
          var tau = clamp(1.3 - (m - 48) / 50, 0.35, 1.4);
          gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(v, t + 0.004); gn.gain.setTargetAtTime(0, t + 0.004, tau);
          gn.gain.setTargetAtTime(0, t + dur + 0.1, 0.12);
          end = t + Math.min(dur + 1, tau * 6);
          o.connect(lp); o2.connect(g2); o3.connect(g3); g2.connect(lp); g3.connect(lp); lp.connect(gn); out(gn, chan, end);
          [o, o2, o3].forEach(function (x) { x.start(t); x.stop(end); });
          break;
        case 'bell':
          o = O('sine', f, t); o2 = O('sine', f * 2.76, t); o3 = O('sine', f * 5.4, t); gn = G(); g2 = G(); g3 = G();
          decayEnv(gn, t, v, 1.1); decayEnv(g2, t, v * 0.3, 0.4); decayEnv(g3, t, v * 0.1, 0.15);
          end = t + 5;
          var sum = G(1); o.connect(gn); o2.connect(g2); o3.connect(g3); gn.connect(sum); g2.connect(sum); g3.connect(sum); out(sum, chan, end);
          [o, o2, o3].forEach(function (x) { x.start(t); x.stop(end); });
          break;
        case 'vibes':
          o = O('sine', f, t); o2 = O('sine', f * 4, t); gn = G(); g2 = G();
          var trem = O('sine', 5.2, t), tg = G(v * 0.25), amp = G(1);
          trem.connect(tg); tg.connect(amp.gain);
          decayEnv(gn, t, v, 0.7); decayEnv(g2, t, v * 0.12, 0.08); gn.gain.setTargetAtTime(0, t + dur + 0.2, 0.2);
          end = t + Math.min(dur + 1.5, 4);
          o.connect(gn); o2.connect(g2); g2.connect(gn); gn.connect(amp); out(amp, chan, end);
          [o, o2, trem].forEach(function (x) { x.start(t); x.stop(end); });
          break;
        case 'pluck':
          o = O('sawtooth', f, t); o2 = O('square', f * 1.003, t); g2 = G(0.4); gn = G(); lp = F('lowpass', 3500, 3);
          lp.frequency.setValueAtTime(Math.min(4200, NY), t); lp.frequency.setTargetAtTime(380, t, 0.07);
          decayEnv(gn, t, v, 0.16); gn.gain.setTargetAtTime(0, t + dur, 0.05); end = t + Math.min(dur + 0.4, 1.2);
          o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(gn); out(gn, chan, end);
          [o, o2].forEach(function (x) { x.start(t); x.stop(end); });
          break;
        case 'saw':
          o = O('sawtooth', f, t); o2 = O('sawtooth', f, t); o2.detune.value = 9; o.detune.value = -9;
          gn = G(); lp = F('lowpass', 2600, 1);
          var lfo = O('sine', 5.5, t), lg = G(0); lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
          lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(12, t + 0.35);
          end = adsr(gn, t, 0.02, v * 0.6, 0.75, 0.2, dur, 0.18);
          o.connect(lp); o2.connect(lp); lp.connect(gn); out(gn, chan, end);
          [o, o2, lfo].forEach(function (x) { x.start(t); x.stop(end); });
          break;
        case 'square':
          o = O('square', f, t); gn = G();
          var vl = O('sine', 6, t), vg = G(0); vl.connect(vg); vg.connect(o.detune); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(15, t + 0.25);
          end = adsr(gn, t, 0.004, v * 0.35, 0.8, 0.1, dur * 0.92, 0.03);
          o.connect(gn); out(gn, chan, end); [o, vl].forEach(function (x) { x.start(t); x.stop(end); });
          break;
        case 'sitar':
          o = O('sawtooth', lastLead || f, t); gn = G();
          if (lastLead && lastLead !== f) o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.12, dur * 0.4));
          lastLead = f;
          var bpf = F('bandpass', f * 3, 3), lpf = F('lowpass', 2400, 1), bz = G(0.5);
          decayEnv(gn, t, v * 0.75, 0.42); gn.gain.setTargetAtTime(0, t + dur + 0.05, 0.12);
          end = t + Math.min(dur + 1, 3);
          o.connect(lpf); o.connect(bpf); bpf.connect(bz); bz.connect(gn); lpf.connect(gn); out(gn, chan, end);
          o.start(t); o.stop(end);
          break;
        case 'saw-pad': case 'wide':
          var wide = kind === 'wide';
          gn = G(); lp = F('lowpass', wide ? 1400 : 1800, 0.7);
          [-8, 0, 7].forEach(function (dt) { var x = O('sawtooth', f, t); x.detune.value = dt * (wide ? 1.6 : 1); x.connect(lp); x.start(t); x.stop(t + dur + (wide ? 6 : 3)); });
          if (wide) { var lf = O('sine', 0.15, t), lfg = G(500); lf.connect(lfg); lfg.connect(lp.frequency); lf.start(t); lf.stop(t + dur + 6); }
          end = adsr(gn, t, wide ? 1.5 : 0.35, v * 0.5, 0.85, 1, dur, wide ? 1.4 : 0.5);
          lp.connect(gn); out(gn, chan, t + dur + (wide ? 6 : 3));
          break;
        case 'stab':
          gn = G(); lp = F('lowpass', 2400, 2);
          lp.frequency.setValueAtTime(Math.min(3600, NY), t); lp.frequency.setTargetAtTime(700, t, 0.06);
          [-6, 6].forEach(function (dt) { var x = O('sawtooth', f, t); x.detune.value = dt; x.connect(lp); x.start(t); x.stop(t + dur + 0.5); });
          adsr(gn, t, 0.003, v * 0.7, 0.4, 0.08, dur, 0.06);
          lp.connect(gn); out(gn, chan, t + dur + 0.5);
          break;
        case 'drone':
          o = O('sawtooth', f, t); gn = G(); lp = F('lowpass', 1600, 0.5); var bb = F('bandpass', f * 7, 9), bg = G(0.8);
          gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(v, t + 0.03); gn.gain.setTargetAtTime(0, t + 0.03, 1.4);
          o.connect(lp); o.connect(bb); bb.connect(bg); bg.connect(gn); lp.connect(gn); out(gn, chan, t + 7);
          o.start(t); o.stop(t + 7);
          break;
      }
    }

    kick = defer(kick, 0); snare = defer(snare, 0); clap = defer(clap, 0); hat = defer(hat, 0);
    tablaHit = defer(tablaHit, 0); bassNote = defer(bassNote, 0); voice = defer(voice, 2);

    function chordFor(deg, sev) {
      var sc = p.scale, i0 = deg - 1, idxs = [i0, i0 + 2, i0 + 4];
      if (sev) idxs.push(i0 + 6);
      var base = 48 + (p.root > 6 ? p.root - 12 : p.root);
      var notes = idxs.map(function (ix) { return scaleMidi(sc, ix, base); });
      return { notes: notes, bass: scaleMidi(sc, i0, 36 + (p.root > 6 ? p.root - 12 : p.root)), pcs: notes.map(function (n) { return ((n % 12) + 12) % 12; }) };
    }

    // melody scale
    var melScale = p.scale;
    if (g.melody === 'penta' && p.scale.length === 7) melScale = (p.scale[2] === 4) ? PENTA.major : PENTA.minor;
    var leadBase = g.leadOct + (p.root > 6 ? p.root - 12 : p.root);
    var motifA = makeMotif(r, g.sparse, false), motifB = makeMotif(r, g.sparse, true);
    motifB.forEach(function (n) { n.idx += 2; });
    var motifAlap = makeMotif(r, true, true);

    function stepTime(T, s) {
      var t = T + s * p.step;
      if (g.swing) {
        if (g.swingUnit === 16 && s % 2 === 1) t += g.swing * p.step;
        if (g.swingUnit === 8 && s % 4 === 2) t += g.swing * 2 * p.step;
      }
      return t + (r() - 0.5) * 0.008;
    }

    function playMotif(motif, half, T, chord, vel, final) {
      var sub = motif.filter(function (n) { return Math.floor(n.step / 16) === half; });
      sub.forEach(function (n, k) {
        var m = scaleMidi(melScale, n.idx, leadBase), s = n.step % 16;
        if (s % 8 === 0 && g.lead !== 'sitar') { // land on chord tones on strong beats
          var best = m, bd = 99;
          for (var dd = -3; dd <= 3; dd++) { var pc = (((m + dd) % 12) + 12) % 12; if (chord.pcs.indexOf(pc) >= 0 && Math.abs(dd) < bd) { bd = Math.abs(dd); best = m + dd; } }
          m = best;
        }
        var dur = n.len * p.step;
        if (final && k === sub.length - 1) { m = scaleMidi(melScale, 0, leadBase); dur = Math.max(dur, p.beat * 2); }
        voice(g.lead, CH.lead, stepTime(T, s), m, dur * 0.95, vel * (0.85 + r() * 0.2));
      });
    }

    var DR = {
      lofi: { k: ['x.........x.....', 'x......x..x.....'], s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      four: { k: ['x...x...x...x...'], s: '....x.......x...', h: '..x...x...x...x.', sh: true },
      gated: { k: ['x.......x.x.....', 'x.......x.......'], s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      chip: { k: ['x.....x.x.......', 'x.......x...x...'], s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      brush: { k: ['x.......x.......'], s: '....x.......x...', h: 'x...x.x.x...x.x.', brush: true }
    };
    var TEENTAL = [['dha', 'dhin', 'dhin', 'dha'], ['dha', 'dhin', 'dhin', 'dha'], ['dha', 'tin', 'tin', 'ta'], ['ta', 'dhin', 'dhin', 'dha']];

    // tanpura drone across the whole piece
    if (g.drone) {
      var cyc = Math.max(p.bar, 3.6) / 4, sa = 48 + (p.root > 6 ? p.root - 12 : p.root);
      var seqD = [sa - 5, sa + 12, sa + 12, sa], dk = 0;
      for (var td = p.start; td < endT + p.bar; td += cyc) { voice('drone', CH.drone, td, seqD[dk % 4], cyc, dk % 4 === 3 ? 0.9 : 0.7); dk++; }
    }
    if (g.crackle) {
      var cb = ctx.createBuffer(1, len, SR), cd = cb.getChannelData(0);
      for (i = 0; i < len; i++) cd[i] = (Math.random() * 2 - 1) * 0.006;
      var clicks = Math.floor(p.duration * 9);
      for (i = 0; i < clicks; i++) { var at = Math.floor(Math.random() * (len - 4)), a2 = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.5); cd[at] += a2; cd[at + 1] += a2 * 0.5; }
      var cs = ctx.createBufferSource(); cs.buffer = cb; var chp = F('highpass', 900); cs.connect(chp); chp.connect(CH.fx); cs.start(0);
    }

    var barIdx = 0;
    p.sections.forEach(function (sec, si) {
      for (var b = 0; b < sec.bars; b++, barIdx++) {
        var T = p.start + barIdx * p.bar, ty = sec.type, last = b === sec.bars - 1;
        var progArr = ty === 'B' ? p.progB : p.prog;
        var chord = chordFor(progArr[b % progArr.length], g.sevenths);
        var full = ty === 'A' || ty === 'B';
        var drums = g.drums && (full || (ty === 'outro' && b < 2) || (ty === 'intro' && b >= 2 && g.drums !== 'tabla'));
        var thin = !full;

        // drums
        if (drums && g.drums === 'tabla') {
          var bols = TEENTAL[barIdx % 4];
          for (var q = 0; q < 4; q++) {
            tablaHit(stepTime(T, q * 4), bols[q], q === 0 && barIdx % 4 === 0 ? 1 : 0.75);
            if (ty === 'B' && r() < 0.55) tablaHit(stepTime(T, q * 4 + 2), 'na', 0.4);
            if (last && q >= 2) { tablaHit(stepTime(T, q * 4 + 1), 'na', 0.45); tablaHit(stepTime(T, q * 4 + 3), 'ta', 0.5); }
          }
        } else if (drums) {
          var D = DR[g.drums], kp = D.k[(b % 4 >= 2 && D.k[1]) ? 1 : 0];
          for (var s = 0; s < 16; s++) {
            var ts = stepTime(T, s);
            if (!thin || g.drums === 'four') { if (kp[s] === 'x') kick(ts, 1); }
            if (!thin && D.s[s] === 'x') { if (g.drums === 'four') clap(ts, 0.8); else snare(ts, 0.9, D.brush); }
            if (D.h[s] === 'x') hat(ts, (s % 4 === 0 ? 0.9 : 0.6) * (thin ? 0.6 : 1), g.drums === 'four' && !thin);
            if (D.sh && !thin) hat(ts, 0.18, false);
            if (D.brush && !thin) { if (s % 2 === 0) snare(ts, 0.18, true); }
          }
          if (last && !thin && g.drums !== 'brush') { snare(stepTime(T, 13), 0.5); snare(stepTime(T, 14), 0.65); snare(stepTime(T, 15), 0.8); }
        }

        // bass
        if (g.bass && (full || ty === 'outro' || (g.bass === 'sub') || (g.bass === 'piano'))) {
          var bm = chord.bass, bt = g.bass;
          if (bt === 'round') { bassNote(stepTime(T, 0), bm, p.beat * 1.6, 0.9); bassNote(stepTime(T, 10), bm + (r() < 0.5 ? 7 : 12), p.beat * 1.2, 0.7); }
          else if (bt === 'octave') { for (s = 0; s < 16; s += 2) bassNote(T + s * p.step, bm + (s % 4 ? 12 : 0), p.step * 1.6, 0.8); }
          else if (bt === 'offbeat') { for (s = 2; s < 16; s += 4) bassNote(T + s * p.step, bm + (s === 14 && r() < 0.3 ? 12 : 0), p.step * 1.5, 0.95); }
          else if (bt === 'chip') { var cpat = [0, 7, 12, 7]; for (s = 0; s < 16; s += 2) bassNote(T + s * p.step, bm + cpat[(s / 2) % 4], p.step * 1.6, 0.8); }
          else if (bt === 'walk') {
            var nxt = chordFor(progArr[(b + 1) % progArr.length], false).bass;
            var walk = [bm, scaleMidi(p.scale, progArr[b % progArr.length], 36 + (p.root > 6 ? p.root - 12 : p.root)), chord.notes[2] - 12, nxt + (r() < 0.5 ? 1 : -1)];
            for (q = 0; q < 4; q++) bassNote(stepTime(T, q * 4), walk[q], p.beat * 0.9, 0.85);
          }
          else if (bt === 'sub') { bassNote(T, bm, p.bar * 0.95, ty === 'intro' ? 0.5 : 0.8); }
          else if (bt === 'piano') { voice('piano', CH.bass, T, bm, p.beat * 3.5, 0.55); if (!g.sparse || r() < 0.5) voice('piano', CH.bass, T + p.beat * 2, bm + 7, p.beat * 1.8, 0.35); }
        }

        // chords
        var cv = ty === 'intro' ? 0.6 : ty === 'brk' ? 0.8 : ty === 'outro' ? 0.7 : 1;
        if (g.chords === 'epiano') {
          chord.notes.forEach(function (n, k) { voice('epiano', CH.chords, stepTime(T, 0) + k * 0.012, n, p.beat * 2.6, 0.5 * cv); });
          if (full && r() < 0.6) chord.notes.forEach(function (n) { voice('epiano', CH.chords, stepTime(T, 10), n, p.beat * 1.2, 0.3 * cv); });
        } else if (g.chords === 'saw') {
          chord.notes.forEach(function (n) { voice('saw-pad', CH.chords, T, n, p.bar * 0.98, 0.45 * cv); });
        } else if (g.chords === 'wide') {
          if (b % 2 === 0 || progArr.length > 2) chord.notes.forEach(function (n) { voice('wide', CH.chords, T, n, p.bar * (progArr.length > 2 ? 0.98 : 1.98), 0.45 * cv); });
        } else if (g.chords === 'stab') {
          if (full || ty === 'brk') {
            var spat = ty === 'brk' ? [0] : [2, 6, 10, 14];
            spat.forEach(function (s0) { chord.notes.forEach(function (n) { voice('stab', CH.chords, T + s0 * p.step, n + 12, ty === 'brk' ? p.bar : p.step * 1.3, 0.55 * cv); }); });
          }
        } else if (g.chords === 'piano') {
          var br = [0, 1, 2, 1, 2, 1, 0, 1].map(function (k) { return chord.notes[k] + (k === 2 ? 0 : 12); });
          for (q = 0; q < 8; q++) voice('piano', CH.chords, stepTime(T, q * 2), br[q], p.step * 4, (q % 2 ? 0.28 : 0.36) * cv);
        }

        // arpeggio
        if (g.arp && (ty === 'B' || ty === 'brk' || (g.arp === 'chip' && ty === 'A'))) {
          var ar = chord.notes.concat([chord.notes[0] + 12]);
          if (g.arp === 'bell') { for (q = 0; q < 8; q++) if (r() < 0.55) voice('bell', CH.arp, stepTime(T, q * 2), ar[q % ar.length] + 12, p.step * 2, 0.5); }
          else if (g.arp === 'pluck') { for (s = 0; s < 16; s++) voice('pluck', CH.arp, T + s * p.step, ar[s % ar.length] + 12, p.step * 0.9, 0.6 * (s % 4 === 0 ? 1 : 0.7)); }
          else if (g.arp === 'chip') { for (s = 0; s < 16; s++) voice('square', CH.arp, T + s * p.step, ar[s % 3] + 12, p.step * 0.8, 0.45); }
        }

        // lead melody
        var half = b % 2, phraseEnd = (b % 8 === 7) || last;
        if (ty === 'A') playMotif(motifA, half, T, chord, 1, phraseEnd && last);
        else if (ty === 'B') playMotif(b >= 4 && r() < 0.5 ? motifA : motifB, half, T, chord, 1, phraseEnd && last);
        else if (ty === 'brk') { if (b % 2 === 0) playMotif(motifA, 0, T, chord, 0.55, false); }
        else if (ty === 'intro' && (g.lead === 'sitar' || g.lead === 'bell' || g.lead === 'piano')) playMotif(motifAlap, half, T, chord, 0.7, false);
        else if (ty === 'outro' && b < 2) playMotif(motifA, half, T, chord, 0.7, b === 1);
      }
    });

    EV.sort(function (a, b) { return a.t - b.t; });
    var ei = 0, WIN = 2, AHEAD = 3;
    function make(until) { while (ei < EV.length && EV[ei].t < until) { var e = EV[ei++]; e.f.apply(null, e.a); } }
    function sweep(now) { for (var j = live.length - 1; j >= 0; j--) if (live[j][1] < now) { live[j][0].disconnect(); live.splice(j, 1); } }
    if (ctx.suspend) {
      make(AHEAD);
      for (var k = 1; k * WIN < p.duration - 0.5; k++) (function (T) {
        ctx.suspend(T).then(function () { make(T + AHEAD); sweep(T); ctx.resume(); });
      })(k * WIN);
    } else make(Infinity);
    return ctx.startRendering().then(function (buf) { return finish(buf, p); });
  }

  /* normalise, build visualiser envelope, encode WAV */
  function finish(buf, p) {
    var L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, peak = 0, i;
    for (i = 0; i < n; i++) { var a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; }
    // normalise to the peak, then a gentle tanh saturation lifts quiet mixes without hard clipping
    var gain = peak > 0 ? 1 / peak : 1, K = 1.7, KN = 0.92 / Math.tanh(K);
    function shape(x) { return Math.tanh(x * K) * KN; }
    // visualiser: 3 bands at 30 fps
    var fps = 30, hop = Math.floor(SR / fps), frames = Math.floor(n / hop), vis = new Float32Array(frames * 3);
    var lp1 = 0, lp2 = 0, k1 = 1 - Math.exp(-2 * Math.PI * 180 / SR), k2 = 1 - Math.exp(-2 * Math.PI * 1800 / SR);
    var mx = [1e-6, 1e-6, 1e-6];
    for (var f = 0; f < frames; f++) {
      var e0 = 0, e1 = 0, e2 = 0;
      for (var j = f * hop, end = j + hop; j < end; j++) {
        var x = (L[j] + R[j]) * 0.5 * gain;
        lp1 += k1 * (x - lp1); lp2 += k2 * (x - lp2);
        e0 += lp1 * lp1; e1 += (lp2 - lp1) * (lp2 - lp1); e2 += (x - lp2) * (x - lp2);
      }
      vis[f * 3] = Math.sqrt(e0 / hop); vis[f * 3 + 1] = Math.sqrt(e1 / hop); vis[f * 3 + 2] = Math.sqrt(e2 / hop);
      for (var c = 0; c < 3; c++) if (vis[f * 3 + c] > mx[c]) mx[c] = vis[f * 3 + c];
    }
    for (f = 0; f < frames; f++) for (c = 0; c < 3; c++) vis[f * 3 + c] = Math.min(1, vis[f * 3 + c] / (mx[c] * 0.8));

    var data = new DataView(new ArrayBuffer(44 + n * 4));
    function w(o, s) { for (var q = 0; q < s.length; q++) data.setUint8(o + q, s.charCodeAt(q)); }
    w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true); data.setUint32(24, SR, true);
    data.setUint32(28, SR * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 4, true);
    var o = 44;
    for (i = 0; i < n; i++) {
      var l = shape(L[i] * gain), r = shape(R[i] * gain);
      data.setInt16(o, l < -1 ? -32768 : l > 1 ? 32767 : l * 32767, true);
      data.setInt16(o + 2, r < -1 ? -32768 : r > 1 ? 32767 : r * 32767, true);
      o += 4;
    }
    var blob = new Blob([data.buffer], { type: 'audio/wav' });
    return { url: URL.createObjectURL(blob), vis: vis, fps: fps, duration: n / SR, key: p.key, bpm: p.bpm };
  }

  /* render cache (LRU) + one render at a time */
  var cache = new Map(), pending = new Map(), chain = Promise.resolve(), protect = null;
  var MAX = 4;
  function get(track) {
    if (cache.has(track.id)) { var v = cache.get(track.id); cache.delete(track.id); cache.set(track.id, v); return Promise.resolve(v); }
    if (pending.has(track.id)) return pending.get(track.id);
    var pr = chain.then(function () { return render(track); }).then(function (res) {
      pending.delete(track.id); cache.set(track.id, res);
      while (cache.size > MAX) {
        var victim = null;
        cache.forEach(function (val, key) { if (!victim && key !== protect && key !== track.id) victim = key; });
        if (!victim) break;
        URL.revokeObjectURL(cache.get(victim).url); cache.delete(victim);
      }
      return res;
    }, function (e) { pending.delete(track.id); throw e; });
    chain = pr.catch(function () {});
    pending.set(track.id, pr);
    return pr;
  }
  function cached(id) { return cache.get(id) || null; }

  /* ---------- cover art ---------- */
  var coverCache = {};
  var PALETTES = {
    lofi: [['#f2a65a', '#6b4e71'], ['#e98a6b', '#3c3b5c'], ['#f7c59f', '#2a324b']],
    synthwave: [['#ff3cac', '#2b0f54'], ['#ff7b54', '#3a0ca3'], ['#f72585', '#10002b']],
    ambient: [['#a8dadc', '#457b9d'], ['#cdb4db', '#5e6472'], ['#b8e0d2', '#6d597a']],
    house: [['#ffd23f', '#ee4266'], ['#3bceac', '#0e1428'], ['#ff6b35', '#1a1a2e']],
    raga: [['#f4a261', '#7b2d26'], ['#e9c46a', '#8c1c13'], ['#ffb703', '#5a189a']],
    chip: [['#06d6a0', '#118ab2'], ['#ffd166', '#ef476f'], ['#8ac926', '#1982c4']],
    piano: [['#f1ede4', '#3d3d3d'], ['#e8e1d4', '#22333b'], ['#efe6dd', '#5c4d4d']],
    jazz: [['#e0a458', '#0b2545'], ['#c9a227', '#13315c'], ['#d4a373', '#1d3557']],
    radio: [['#e5383b', '#6a040f'], ['#ff7b00', '#9d0208'], ['#3a86ff', '#3a0ca3'], ['#06d6a0', '#073b4c'], ['#f72585', '#480ca8'], ['#ffb703', '#d62828']],
    upload: [['#7f5af0', '#2cb67d'], ['#ff8906', '#e53170'], ['#3da9fc', '#094067'], ['#f25f4c', '#0f0e17']],
    mix: [['#ff5f6d', '#ffc371']]
  };
  function cover(key, style, size) {
    size = size || 320;
    var ck = style + '|' + key + '|' + size;
    if (coverCache[ck]) return coverCache[ck];
    var r = mulberry(hashStr(key) ^ 0x51ed);
    var cv = document.createElement('canvas'); cv.width = cv.height = size;
    var c = cv.getContext('2d'), S = size;
    var pal = pick(r, PALETTES[style] || PALETTES.upload), A = pal[0], B = pal[1];
    var gr = c.createLinearGradient(0, 0, S * (0.3 + r() * 0.7), S);
    gr.addColorStop(0, A); gr.addColorStop(1, B); c.fillStyle = gr; c.fillRect(0, 0, S, S);
    c.save();
    switch (style) {
      case 'synthwave': {
        var sy = S * (0.42 + r() * 0.1), sr = S * 0.24;
        var sg = c.createLinearGradient(0, sy - sr, 0, sy + sr); sg.addColorStop(0, '#ffe66d'); sg.addColorStop(1, '#ff3c8e');
        c.fillStyle = sg; c.beginPath(); c.arc(S / 2, sy, sr, 0, Math.PI * 2); c.fill();
        c.fillStyle = B; for (var k = 0; k < 6; k++) c.fillRect(0, sy + k * sr * 0.17, S, sr * 0.035 * (k + 1));
        c.fillStyle = B; c.fillRect(0, S * 0.66, S, S); c.strokeStyle = 'rgba(255,60,172,.8)'; c.lineWidth = S / 180;
        for (k = 0; k < 9; k++) { var yy = S * 0.66 + Math.pow(k / 8, 2) * S * 0.34; c.beginPath(); c.moveTo(0, yy); c.lineTo(S, yy); c.stroke(); }
        for (k = -8; k <= 8; k++) { c.beginPath(); c.moveTo(S / 2 + k * S * 0.03, S * 0.66); c.lineTo(S / 2 + k * S * 0.16, S); c.stroke(); }
        break;
      }
      case 'lofi': {
        c.fillStyle = 'rgba(255,240,210,.85)'; c.beginPath(); c.arc(S * (0.25 + r() * 0.5), S * (0.22 + r() * 0.15), S * 0.09, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(20,18,30,.55)';
        for (var bx = 0; bx < S;) { var bw = S * (0.08 + r() * 0.12), bh = S * (0.2 + r() * 0.35); c.fillRect(bx, S - bh, bw, bh); bx += bw; }
        c.fillStyle = 'rgba(255,214,140,.8)';
        for (k = 0; k < 26; k++) c.fillRect(r() * S, S * (0.55 + r() * 0.4), S * 0.012, S * 0.018);
        c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = S / 300;
        for (k = 0; k < 60; k++) { var rx = r() * S, ry = r() * S; c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx - S * 0.02, ry + S * 0.06); c.stroke(); }
        break;
      }
      case 'ambient': {
        for (k = 0; k < 6; k++) {
          var cx = r() * S, cy = r() * S, rr = S * (0.2 + r() * 0.4), rg = c.createRadialGradient(cx, cy, 0, cx, cy, rr);
          rg.addColorStop(0, k % 2 ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.25)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = rg; c.fillRect(0, 0, S, S);
        }
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = S / 160;
        for (k = 0; k < 5; k++) { c.beginPath(); var y0 = S * (0.55 + k * 0.08); c.moveTo(0, y0); for (var x = 0; x <= S; x += S / 40) c.lineTo(x, y0 + Math.sin(x / S * 6 + k) * S * 0.02); c.stroke(); }
        break;
      }
      case 'house': {
        var cx2 = S * (0.3 + r() * 0.4), cy2 = S * (0.3 + r() * 0.4);
        for (k = 12; k > 0; k--) { c.fillStyle = k % 2 ? B : A; c.beginPath(); c.arc(cx2, cy2, k * S * 0.07, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(0, S * 0.8, S, S * 0.02);
        break;
      }
      case 'raga': {
        c.translate(S / 2, S / 2);
        var petals = 8 + rint(r, 0, 2) * 4;
        for (var ring = 4; ring >= 1; ring--) {
          c.fillStyle = ring % 2 ? 'rgba(255,220,150,.55)' : 'rgba(120,20,20,.45)';
          for (k = 0; k < petals; k++) { c.save(); c.rotate(k * Math.PI * 2 / petals + ring * 0.2); c.beginPath(); c.ellipse(0, -ring * S * 0.085, S * 0.03 * ring * 0.6, S * 0.07 * ring * 0.5, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
        }
        c.fillStyle = '#ffe8a3'; c.beginPath(); c.arc(0, 0, S * 0.06, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'chip': {
        var cell = S / 16;
        for (var gy = 0; gy < 16; gy++) for (var gx = 0; gx < 16; gx++) if (r() < 0.22) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.18)'; c.fillRect(gx * cell, gy * cell, cell, cell); }
        c.fillStyle = '#ffd166'; var px = [[6, 5], [7, 5], [8, 5], [9, 5], [5, 6], [10, 6], [5, 7], [10, 7], [5, 8], [10, 8], [6, 9], [7, 9], [8, 9], [9, 9], [7, 4], [8, 3]];
        c.fillStyle = 'rgba(255,255,255,.9)'; px.forEach(function (q) { c.fillRect(q[0] * cell + cell * 0.5, q[1] * cell + cell * 3, cell, cell); });
        break;
      }
      case 'piano': {
        c.fillStyle = B;
        var keys = 7 + rint(r, 0, 5), kw = S / keys;
        for (k = 0; k < keys; k++) { c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(k * kw, S * 0.62, 1.5, S); if ([0, 1, 3, 4, 5].indexOf(k % 7) >= 0) { c.fillStyle = B; c.fillRect(k * kw + kw * 0.68, S * 0.62, kw * 0.62, S * 0.22); } }
        c.strokeStyle = B; c.globalAlpha = 0.5; c.lineWidth = S / 220;
        c.beginPath(); c.moveTo(S * 0.12, S * 0.3); for (k = 0; k < 8; k++) c.quadraticCurveTo(S * (0.12 + k * 0.1 + 0.05), S * (0.2 + r() * 0.2), S * (0.12 + (k + 1) * 0.1), S * 0.3); c.stroke();
        c.globalAlpha = 1;
        break;
      }
      case 'jazz': {
        c.strokeStyle = 'rgba(255,215,140,.35)'; c.lineWidth = S / 70;
        for (k = -4; k < 10; k++) { c.beginPath(); c.moveTo(k * S * 0.15, 0); c.lineTo(k * S * 0.15 + S * 0.6, S); c.stroke(); }
        for (k = 0; k < 3; k++) { c.fillStyle = 'rgba(230,180,90,' + (0.5 + k * 0.15) + ')'; c.beginPath(); c.arc(S * (0.25 + r() * 0.5), S * (0.25 + r() * 0.5), S * (0.07 + r() * 0.12), 0, Math.PI * 2); c.fill(); }
        break;
      }
      case 'radio': {
        c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = S / 40;
        for (var w = 1; w <= 5; w++) { c.beginPath(); c.arc(S * 0.5, S * 0.5, S * 0.12 * w, -Math.PI * 0.8, -Math.PI * 0.2); c.stroke(); c.beginPath(); c.arc(S * 0.5, S * 0.5, S * 0.12 * w, Math.PI * 0.2, Math.PI * 0.8); c.stroke(); }
        var words = String(key).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
        var ini = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || 'FM').slice(0, 2)).toUpperCase();
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '800 ' + Math.round(S * 0.3) + 'px Figtree, system-ui, sans-serif';
        c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = S / 30; c.fillText(ini, S / 2, S / 2); c.shadowBlur = 0;
        break;
      }
      default: { // upload / generic
        c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = S / 50;
        for (k = 0; k < 7; k++) { c.beginPath(); c.arc(S / 2, S / 2, S * (0.08 + k * 0.08), r() * 6, r() * 6 + 3); c.stroke(); }
        c.fillStyle = 'rgba(255,255,255,.92)';
        c.beginPath(); c.ellipse(S * 0.43, S * 0.62, S * 0.075, S * 0.06, -0.4, 0, Math.PI * 2); c.fill();
        c.fillRect(S * 0.49, S * 0.3, S * 0.035, S * 0.32); c.fillRect(S * 0.49, S * 0.3, S * 0.13, S * 0.05);
      }
    }
    c.restore();
    // subtle grain
    c.fillStyle = 'rgba(255,255,255,.04)'; for (var gI = 0; gI < 400; gI++) c.fillRect(r() * S, r() * S, 1, 1);
    var url = cv.toDataURL('image/jpeg', 0.86);
    coverCache[ck] = url; return url;
  }

  global.DhunEngine = { GENRES: GENRES, MOODS: MOODS, catalog: catalog, plan: plan, get: get, cached: cached, cover: cover,
    protect: function (id) { protect = id; }, hash: hashStr, rng: mulberry };
})(window);
