/* おぼえてオーダー！ ― ふーさんの森カフェ ― オンライン協力ゲーム
 * 構成：WebRTC（PeerJS）P2P。ホストのブラウザが唯一の正（authoritative）。
 * 注文リスト・全員の手札・お助けの結果はホストだけが持ち、各プレイヤーには「その人が見てよい情報」だけを送ります。
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var O = OrderGame;
  var Q = new URLSearchParams(location.search);
  var CFG = window.NT_CONFIG || {};
  var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
  if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });
  var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
  var ID_PREFIX = 'oboete-order-jp-v1-';
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var TURBO = Q.has('turbo');
  var SPEEDS = [{ key: 'slow', label: 'ゆっくり', ms: 3500 }, { key: 'normal', label: 'ふつう', ms: 2500 }, { key: 'fast', label: 'はやい', ms: 1600 }];
  var HELP_MODES = [{ key: 'level', label: 'レベルごとに1回' }, { key: 'game', label: 'ゲーム中1回' }];
  var DRAMA_MS = Q.get('dramams') ? Math.max(300, +Q.get('dramams')) : TURBO ? 900 : 3000;
  var HB_MS = 3000, LOST_MS = 10000;
  var LS_ID = 'om-client-id', LS_NAME = 'om-name', LS_HOST = 'om-host-room', LS_TTS = 'om-tts', SS_CLIENT = 'om-joined';

  function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
  function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
  function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
  var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();

  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function san(n) { return n.indexOf('さん') >= 0 ? n : n + 'さん'; }
  function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
  function genCode() { var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
  function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
  function kana(s) { return String(s).replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }).toLowerCase(); }

  function ticket(id, size, extra) {
    var m = O.item(id); if (!m) return '';
    var tg = m.t ? '<span class="tg ' + (m.t === 'ホット' ? 'hot' : 'ice') + '">' + m.t + '</span>' : '';
    return '<div class="ticket ' + size + ' c-' + m.c + (extra ? ' ' + extra : '') + '" data-id="' + id + '"><span class="em">' + m.e + '</span><span class="nm">' + esc(m.n) + '</span>' + tg + '</div>';
  }
  function itemName(id) { var m = O.item(id); return m ? m.n : '?'; }

  // ---------- 汎用UI ----------
  var SCREENS = ['title', 'lobby', 'memo', 'play', 'result'];
  function show(id) { SCREENS.forEach(function (s) { $(s).classList.toggle('active', s === id); }); }
  function overlay(id, on) { $(id).classList.toggle('active', on); }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
  function banner(msg) { $('banner').textContent = msg || ''; $('banner').classList.toggle('show', !!msg); }
  function confirmBox(title, text, yes, cb, noCancel) {
    $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes;
    $('cfNo').style.display = noCancel ? 'none' : '';
    overlay('confirmModal', true);
    $('cfYes').onclick = function () { overlay('confirmModal', false); cb && cb(); };
    $('cfNo').onclick = function () { overlay('confirmModal', false); };
  }
  function connecting(on, title, text, onCancel) {
    overlay('connecting', on);
    if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
  }
  $('rulesBtn1').onclick = $('rulesBtn2').onclick = function () { overlay('rulesModal', true); };
  $('rulesClose').onclick = function () { overlay('rulesModal', false); };

  // ---------- 読み上げ（端末ごと） ----------
  var ttsOn = load(LS_TTS) !== '0';
  function syncTts() { ['ttsSw1', 'ttsSw2'].forEach(function (id) { $(id).classList.toggle('on', ttsOn); }); }
  $('ttsSw1').onclick = $('ttsSw2').onclick = function () { ttsOn = !ttsOn; store(LS_TTS, ttsOn ? '1' : '0'); syncTts(); if (!ttsOn) try { speechSynthesis.cancel(); } catch (e) {} };
  function speak(text) {
    if (!ttsOn || !window.speechSynthesis || TURBO) return;
    try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) {}
  }
  syncTts();

  // =====================================================================
  //  ホスト（authoritative）
  // =====================================================================
  var host = null;
  function hostId(code) { return ID_PREFIX + code; }
  function newRoom(name) {
    return {
      code: genCode(), phase: 'lobby', nextSid: 2,
      opts: { startLevel: 1, speed: 'normal', helpMode: 'level', discardLast: false },
      seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }],
      match: null, L: null, memo: { idx: -1 }, log: [], evId: 0, ev: null, priv: {}, privId: 0, created: Date.now()
    };
  }
  function startHost(name, resumeRoom) {
    document.body.classList.add('is-host');
    host = { room: resumeRoom || newRoom(name), conns: {}, lastSeen: {}, tries: 0, opened: false, resuming: !!resumeRoom };
    if (resumeRoom) host.room.seats.forEach(function (s) { if (s.kind === 'remote') s.connected = false; });
    connecting(true, '部屋を作っています…', 'シグナリングサーバーに接続中');
    openHostPeer();
    setInterval(hostHeartbeat, 2000);
  }
  function openHostPeer() {
    var R = host.room;
    var peer = new Peer(hostId(R.code), PEER_OPTS);
    host.peer = peer;
    peer.on('open', function () {
      host.opened = true; host.tries = 0; connecting(false); banner('');
      if (R.phase === 'memorize') hostRunMemo(); // 再開時は最初から流し直す
      hostBroadcast();
    });
    peer.on('connection', function (conn) {
      conn.on('data', function (m) { hostOnMessage(conn, m); });
      conn.on('close', function () { hostConnClosed(conn); });
      conn.on('error', function () { hostConnClosed(conn); });
    });
    peer.on('disconnected', function () { if (!peer.destroyed) setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 2000); });
    peer.on('error', function (e) {
      if (e.type === 'unavailable-id') {
        try { peer.destroy(); } catch (x) {}
        if (!host.opened && R.phase === 'lobby' && !host.resuming) { R.code = genCode(); openHostPeer(); return; }
        if (++host.tries > 25) { connecting(false); toast('部屋を再開できませんでした'); return; }
        connecting(true, '部屋を再開しています…', '少し時間がかかることがあります（' + host.tries + '）');
        setTimeout(openHostPeer, 3000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].indexOf(e.type) >= 0) {
        if (!host.opened) { connecting(true, 'サーバーに接続できません', '通信環境を確認してください。再試行しています…'); setTimeout(function () { try { peer.destroy(); } catch (x) {} openHostPeer(); }, 4000); }
        else banner('シグナリングサーバーとの接続が不安定です（ゲームは続行できます）');
      } else if (e.type === 'browser-incompatible') connecting(true, 'このブラウザは対応していません', 'Chrome / Safari の最新版でお試しください');
    });
  }
  function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
  function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
  function nameOf(sid) { var s = seatBySid(sid); return s ? s.name : '?'; }
  function addLog(t) { var R = host.room; R.log.unshift(t); if (R.log.length > 40) R.log.length = 40; }

  function hostOnMessage(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') return hostJoin(conn, m);
    var seat = conn.clientId && seatByClient(conn.clientId);
    if (!seat || host.conns[conn.clientId] !== conn) return;
    host.lastSeen[conn.clientId] = Date.now();
    if (m.t === 'ping') return;
    if (m.t === 'lobbyReq') return hostLobbyReq(seat);
    if (m.t === 'abort') return;   // 中断できるのはホストだけ（参加者からの abort は無視）
    if (m.t === 'declare') return hostDeclare(seat, m, conn);
    if (m.t === 'help') return hostHelp(seat, m, conn);
    if (m.t === 'leave') {
      var R = host.room;
      if (R.phase === 'lobby') R.seats.splice(R.seats.indexOf(seat), 1); else { seat.connected = false; }
      addLog('👋 ' + seat.name + 'が退出しました');
      delete host.conns[conn.clientId];
      try { conn.close(); } catch (e) {}
      hostBroadcast();
    }
  }
  function hostJoin(conn, m) {
    var R = host.room;
    var name = cleanName(m.name), cid = String(m.clientId || '').slice(0, 40);
    function reject(text) { conn.send({ t: 'reject', msg: text }); setTimeout(function () { try { conn.close(); } catch (e) {} }, 500); }
    if (!name || !cid) return reject('ニックネームを入力してください');
    if (cid === myId) return reject('ホストと同じ端末・ブラウザからは参加できません');
    var seat = seatByClient(cid);
    if (!seat) { seat = R.seats.filter(function (s) { return s.kind === 'remote' && s.name === name && !s.connected; })[0]; if (seat) seat.clientId = cid; }
    if (seat) {
      var old = host.conns[cid]; if (old && old !== conn) { try { old.close(); } catch (e) {} }
      seat.connected = true;
      addLog('🔌 ' + seat.name + 'が再接続しました');
    } else {
      if (R.phase !== 'lobby') return reject('この部屋はゲーム中です。前に参加していた人は、同じニックネームで入ると元の席に戻れます。');
      if (R.seats.length >= 6) return reject('満員です（最大6人）');
      if (R.seats.some(function (s) { return s.name === name; })) return reject('その名前はすでに使われています。別のニックネームにしてください。');
      seat = { sid: R.nextSid++, name: name, kind: 'remote', clientId: cid, connected: true };
      R.seats.push(seat);
      addLog('👋 ' + name + 'が参加しました');
    }
    conn.clientId = cid; host.conns[cid] = conn; host.lastSeen[cid] = Date.now();
    conn.send({ t: 'welcome', code: R.code, sid: seat.sid });
    hostBroadcast();
  }
  function hostConnClosed(conn) {
    if (!conn.clientId || host.conns[conn.clientId] !== conn) return;
    delete host.conns[conn.clientId];
    var seat = seatByClient(conn.clientId);
    if (seat && seat.connected) { seat.connected = false; addLog('⚠️ ' + seat.name + 'の接続が切れました'); hostBroadcast(); }
  }
  function hostHeartbeat() {
    if (!host) return;
    var now = Date.now();
    Object.keys(host.conns).forEach(function (cid) {
      var c = host.conns[cid];
      try { c.send({ t: 'hb' }); } catch (e) {}
      if (now - (host.lastSeen[cid] || 0) > LOST_MS) { try { c.close(); } catch (e) {} hostConnClosed(c); }
    });
  }

  // ---- 進行 ----
  function speedMs() { if (Q.get('memoms')) return Math.max(100, +Q.get('memoms')); if (TURBO) return 250; var s = SPEEDS.filter(function (x) { return x.key === host.room.opts.speed; })[0] || SPEEDS[1]; return s.ms; }
  function hostStartMatch(level) {
    var R = host.room;
    if (R.seats.length < 2 || R.seats.length > 6) return;
    R.match = { level: level || R.opts.startLevel, offset: Math.floor(Math.random() * R.seats.length), helpUsedGame: {} };
    R.log = [];
    hostStartLevel();
  }
  function hostStartLevel() {
    var R = host.room, M = R.match;
    var pids = R.seats.map(function (s) { return s.sid; });
    R.L = O.newLevel(pids, M.level, Math.random, { startIdx: M.offset++, helpUsed: R.opts.helpMode === 'game' ? M.helpUsedGame : {}, allowDiscardLast: R.opts.discardLast });
    R.lidSeq = (R.lidSeq || 0) + 1; R.L.lid = R.lidSeq;   // レベルごとの識別子（手番の二重送信防止に使う）
    R.phase = 'memorize'; R.priv = {}; R.ev = null;
    addLog('🐻 レベル' + M.level + ' 開店！ 注文は' + R.L.orders.length + '個');
    hostRunMemo();
  }
  function hostRunMemo() {
    var R = host.room, L = R.L;
    clearTimeout(host.memoT);
    R.memo = { idx: -1 };
    hostBroadcast();
    var next = function () {
      if (R.phase !== 'memorize' || R.L !== L) return;
      R.memo.idx++;
      if (R.memo.idx < L.orders.length) { hostBroadcast(); host.memoT = setTimeout(next, speedMs()); }
      else {
        hostBroadcast(); // 「手札を配っています」
        host.memoT = setTimeout(function () {
          if (R.phase !== 'memorize' || R.L !== L) return;
          O.startPlay(L); R.phase = 'play';
          addLog('🃏 手札を配りました。' + nameOf(O.currentPid(L)) + 'から宣言スタート！');
          hostBroadcast();
        }, TURBO ? 300 : 1600);
      }
    };
    host.memoT = setTimeout(next, TURBO ? 300 : 2200);
  }
  function syncPhase() {
    var R = host.room, L = R.L;
    if (L.phase === 'clear') { R.phase = L.level >= 7 ? 'victory' : 'clear'; addLog(L.level >= 7 ? '🏆 レベル7クリア！ 大成功！' : '🎉 レベル' + L.level + ' クリア！'); }
    else if (L.phase === 'fail') { R.phase = 'fail'; addLog('💦 全員脱落… レベル' + L.level + ' 失敗'); }
  }
  function hostDeclare(seat, m, conn) {
    var R = host.room, L = R.L;
    if (R.phase !== 'play' || !L) return;
    if (m.mv !== L.moves || m.lid !== L.lid) return;   // 古い・別レベルの操作は無視
    try {
      var ev = O.declare(L, seat.sid, +m.item);
      var nm = itemName(ev.item);
      if (ev.result === 'hit') addLog('⭕ ' + seat.name + '「' + nm + '」→ ' + nameOf(ev.holder) + 'が持っていた！');
      else if (ev.selfHeld) addLog('😱 ' + seat.name + '「' + nm + '」→ 実は自分の手札に…！ ' + seat.name + 'は脱落');
      else addLog('❌ ' + seat.name + '「' + nm + '」→ だれも持っていない… ' + seat.name + 'は脱落');
      R.ev = { id: ++R.evId, type: 'declare', by: seat.sid, item: ev.item, result: ev.result, holder: ev.holder || null, selfHeld: !!ev.selfHeld };
      syncPhase();
      hostBroadcast();
    } catch (e) { if (conn) conn.send({ t: 'error', msg: e.message }); else toast(e.message); }
  }
  function hostHelp(seat, m, conn) {
    var R = host.room, L = R.L;
    if (R.phase !== 'play' || !L) return;
    if (m.mv !== L.moves || m.lid !== L.lid) return;   // 古い・別レベルの操作は無視
    try {
      if (m.kind === 'first' || m.kind === 'last') {
        var r = O.helpPeek(L, seat.sid, +m.target, m.kind);
        R.priv[seat.sid] = { id: ++R.privId, kind: m.kind, target: +m.target, targetName: nameOf(+m.target), chars: r.chars, level: L.level };
        addLog('🤝 ' + seat.name + 'がお助け：' + nameOf(+m.target) + 'の' + (m.kind === 'first' ? '最初' : '最後') + 'の文字をのぞいた');
        R.ev = { id: ++R.evId, type: 'help', by: seat.sid, kind: m.kind, target: +m.target };
      } else if (m.kind === 'discard') {
        var d = O.helpDiscard(L, seat.sid, +m.item);
        R.priv[seat.sid] = { id: ++R.privId, kind: 'discard', item: d.discarded, level: L.level };
        addLog('🤝 ' + seat.name + 'がお助け：手札を1枚すてた');
        R.ev = { id: ++R.evId, type: 'help', by: seat.sid, kind: 'discard' };
        syncPhase();
      } else return;
      hostBroadcast();
    } catch (e) { if (conn) conn.send({ t: 'error', msg: e.message }); else toast(e.message); }
  }

  // ---- ビュー（見せてよい情報だけ） ----
  function viewFor(sid) {
    var R = host.room, L = R.L;
    var v = { t: 'state', phase: R.phase, code: R.code, you: sid, opts: R.opts, log: R.log.slice(0, 8), ev: R.ev,
      seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }) };
    v.notice = R.notice || null;
    if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
    if (!L || R.phase === 'lobby') return v;
    v.level = L.level; v.lid = L.lid; v.need = L.need; v.total = L.orders.length;
    if (R.phase === 'memorize') {
      var i = R.memo.idx;
      v.memo = { idx: i, total: L.orders.length, item: i >= 0 && i < L.orders.length ? L.orders[i] : null };
      return v;
    }
    v.seats.forEach(function (s) { s.hand = L.hands[s.sid] ? L.hands[s.sid].length : 0; s.out = !!L.out[s.sid]; s.helpLeft = !L.helpUsed[s.sid]; });
    v.turn = O.currentPid(L); v.mv = L.moves; v.zero = O.zeroCount(L); v.active = O.activeCount(L);
    v.left = L.pids.reduce(function (a, p) { return a + L.hands[p].length; }, 0);
    v.hand = (L.hands[sid] || []).slice();          // 自分の手札だけ
    v.canDiscard = L.hands[sid] ? O.canDiscard(L, sid) : false;
    v.myHelp = R.priv[sid] || null;                  // お助けの結果は本人だけ
    if (R.phase === 'clear' || R.phase === 'fail' || R.phase === 'victory') {
      v.reveal = { dealt: L.dealt, hands: L.hands };  // レベル終了後の答え合わせ
    }
    return v;
  }
  // ---- 中断してロビーへ（ホストのみ）：部屋コード・接続中の参加者・設定はそのまま ----
  function hostToLobby(msg) {
    var R = host.room;
    clearTimeout(host.memoT); R.phase = 'lobby'; R.L = null; R.match = null; R.ev = null; R.priv = {}; R.memo = { idx: -1 };
    R.seats = R.seats.filter(function (s) { return s.kind !== 'remote' || s.connected; });
    R.lobbyReq = null; R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
    addLog(msg);
    hostBroadcast();
  }
  function hostLobbyReq(seat) {   // 参加者の「ロビーに戻りたい」：ホストに知らせるだけ
    var R = host.room;
    if (seat.kind !== 'remote' || R.phase === 'lobby') return;
    if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
    R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() };
    addLog('🙋 ' + seat.name + '「ロビーに戻りたい」');
    hostBroadcast();
  }
  function hostBroadcast() {
    var R = host.room;
    R.seats.forEach(function (s) {
      if (s.kind !== 'remote') return;
      var c = host.conns[s.clientId];
      if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} }
    });
    render(viewFor(1));
    store(LS_HOST, { room: R, saved: Date.now() });
  }

  // ---- ホスト操作 ----
  $('seatList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sid]'); if (!b || !host) return;
    var R = host.room, seat = seatBySid(+b.dataset.sid);
    if (!seat || seat.kind === 'host' || R.phase !== 'lobby') return;
    confirmBox(seat.name + 'を外しますか？', '部屋から退出させます。', '外す', function () {
      var c = host.conns[seat.clientId];
      if (c) { try { c.send({ t: 'kicked' }); } catch (x) {} setTimeout(function () { try { c.close(); } catch (x) {} }, 300); delete host.conns[seat.clientId]; }
      R.seats.splice(R.seats.indexOf(seat), 1); hostBroadcast();
    });
  });
  function optClick(segId, key, parse) {
    $(segId).addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !host || host.room.phase !== 'lobby') return;
      host.room.opts[key] = parse(b.dataset.v); hostBroadcast();
    });
  }
  optClick('levelSeg', 'startLevel', Number); optClick('speedSeg', 'speed', String);
  optClick('helpSeg', 'helpMode', String); optClick('discardSeg', 'discardLast', function (v) { return v === '1'; });
  $('startBtn').onclick = function () { if (host) hostStartMatch(); };
  $('hostResultBtns').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !host) return;
    var R = host.room, a = b.dataset.a;
    if (a === 'next') { R.match.level++; hostStartLevel(); }
    else if (a === 'retry') hostStartLevel();
    else if (a === 'restart') { R.match.level = 1; R.match.helpUsedGame = {}; hostStartLevel(); }
    else if (a === 'lobby') hostToLobby('ロビーに戻りました');
  });
  $('hostbar').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !host) return;
    if (b.dataset.skip) { var R = host.room; addLog('⏭️ ' + nameOf(+b.dataset.skip) + 'の番をスキップしました'); O.skip(R.L); hostBroadcast(); }
    else $('hostbar').dataset.dismiss = b.dataset.wait;
  });

  // =====================================================================
  //  参加者（クライアント）
  // =====================================================================
  var client = null, received = [];
  function startClient(code, name) {
    document.body.classList.remove('is-host');
    client = { code: code, name: name, everJoined: false, lastMsg: Date.now() };
    connecting(true, '部屋 ' + code + ' に接続中…', 'しばらくお待ちください', function () { leaveClient(false); });
    var peer = new Peer(PEER_OPTS);
    client.peer = peer;
    peer.on('open', clientConnect);
    peer.on('disconnected', function () { if (!peer.destroyed) setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 2000); });
    peer.on('error', function (e) {
      if (e.type === 'peer-unavailable') {
        if (!client.everJoined) { connecting(false); toast('部屋が見つかりません。コードを確認してください。'); leaveClient(false); }
        else clientLost();
      } else if (['network', 'server-error', 'socket-error', 'socket-closed'].indexOf(e.type) >= 0) {
        if (!client.everJoined) connecting(true, 'サーバーに接続できません', '通信環境を確認してください。再試行しています…');
      } else if (e.type === 'browser-incompatible') connecting(true, 'このブラウザは対応していません', 'Chrome / Safari の最新版でお試しください');
    });
    client.hbTimer = setInterval(function () {
      if (!client) return;
      if (client.conn && client.conn.open) { try { client.conn.send({ t: 'ping' }); } catch (e) {} }
      if (client.everJoined && Date.now() - client.lastMsg > LOST_MS) clientLost();
    }, HB_MS);
    setTimeout(function () {
      if (client && !client.everJoined && $('connecting').classList.contains('active'))
        $('connText').textContent = 'つながりにくいようです。コードが正しいか、ホストが部屋を開いているか確認してください。（通信環境によっては接続できない場合があります）';
    }, 15000);
  }
  function clientConnect() {
    if (!client || client.peer.destroyed) return;
    if (client.conn) { try { client.conn.close(); } catch (e) {} }
    var conn = client.peer.connect(hostId(client.code), { reliable: true });
    client.conn = conn;
    conn.on('open', function () { conn.send({ t: 'join', name: client.name, clientId: myId }); });
    conn.on('data', function (m) { if (client && client.conn === conn) clientOnMessage(m); });
    conn.on('close', function () { if (client && client.conn === conn) clientLost(); });
    conn.on('error', function () { if (client && client.conn === conn) clientLost(); });
  }
  function clientOnMessage(m) {
    if (!m || typeof m !== 'object') return;
    client.lastMsg = Date.now();
    if (m.t === 'welcome') { client.everJoined = true; actSent = ''; connecting(false); banner(''); sstore(SS_CLIENT, { code: client.code, name: client.name }); }
    else if (m.t === 'state') { received.push(m); if (received.length > 4000) received.shift(); render(m); }
    else if (m.t === 'reject') { connecting(false); leaveClient(false); confirmBox('お知らせ', m.msg, 'OK', null, true); }
    else if (m.t === 'kicked') { sstore(SS_CLIENT, null); leaveClient(false); confirmBox('お知らせ', 'ホストによって部屋から外されました。', 'OK', null, true); }
    else if (m.t === 'closed') { sstore(SS_CLIENT, null); leaveClient(false); confirmBox('お知らせ', 'ホストが部屋を閉じました。', 'OK', null, true); }
    else if (m.t === 'error') { actSent = ''; toast(m.msg); if (lastView) render(lastView); }
  }
  function clientLost() {
    if (!client || !client.everJoined) return;
    banner('ホストとの接続が切れました。再接続しています…');
    clearTimeout(client.retryT);
    client.retryT = setTimeout(function () {
      if (!client) return;
      client.lastMsg = Date.now();
      if (client.peer.disconnected && !client.peer.destroyed) { try { client.peer.reconnect(); } catch (e) {} }
      clientConnect();
    }, 3000);
  }
  function leaveClient(sendLeave) {
    if (!client) return;
    if (sendLeave && client.conn && client.conn.open) { try { client.conn.send({ t: 'leave' }); } catch (e) {} }
    clearInterval(client.hbTimer); clearTimeout(client.retryT);
    var p = client.peer; client = null;
    setTimeout(function () { try { p.destroy(); } catch (e) {} }, 300);
    banner(''); connecting(false); show('title'); renderTitle();
  }
  function leaveRoom() {
    if (host) {
      confirmBox('お店を閉めますか？', '参加者全員の接続が切れ、ゲームは終了します。', '部屋を閉じる', function () {
        Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send({ t: 'closed' }); } catch (e) {} });
        store(LS_HOST, null);
        setTimeout(function () { try { host.peer.destroy(); } catch (e) {} location.href = location.pathname; }, 400);
      });
    } else confirmBox('部屋を出ますか？', 'ゲーム中に出ても、同じニックネームで入り直せば元の席に戻れます。', '部屋を出る', function () { sstore(SS_CLIENT, null); leaveClient(true); });
  }
  $('leaveBtn1').onclick = $('leaveBtn2').onclick = leaveRoom;
  // ⋯メニュー：ホスト＝「中断してロビーに戻る」（確認あり）／部屋を閉じる。参加者＝「ロビーに戻りたい」をホストに伝える／退出する
  ['menuBtn', 'menuBtnM'].forEach(function (id) { if ($(id)) $(id).onclick = function () { overlay('menuModal', true); }; });
  function confirmAbort() {
    confirmBox('中断してロビーに戻りますか？', 'いまのゲームを終了して、全員をこの部屋のロビーに戻します。部屋コード・参加者・設定はそのままです。', '中断してロビーへ', function () {
      if (host && host.room.phase !== 'lobby') hostToLobby('⏸️ ホストがゲームを中断しました');
    });
  }
  $('menuAbort').onclick = function () { overlay('menuModal', false); confirmAbort(); };
  $('menuReq').onclick = function () { overlay('menuModal', false); if (client && client.conn && client.conn.open) client.conn.send({ t: 'lobbyReq' }); toast('ホストに「ロビーに戻りたい」と伝えました'); };
  $('menuLeave').onclick = function () { overlay('menuModal', false); leaveRoom(); };
  $('menuRules').onclick = function () { overlay('menuModal', false); overlay('rulesModal', true); };
  $('menuClose').onclick = function () { overlay('menuModal', false); };
  $('lobbyReqBar').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-lr]'); if (!b || !host) return;
    if (b.dataset.lr === 'no') { host.room.lobbyReq = null; hostBroadcast(); } else confirmAbort();
  });
  var seenNotice = null;
  function abortUi(v) {
    if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
    else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (!host && v.phase === 'lobby') toast(v.notice.msg + '。ロビーで次のゲームを待っています'); }
    if (v.phase === 'lobby') overlay('menuModal', false);
    var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
    if (bar.dataset.key !== key) {
      bar.dataset.key = key;
      bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
      bar.classList.toggle('show', !!key);
    }
  }


  // ---- 自分の操作（ホストは直接、参加者は送信） ----
  var lastView = null, actSent = '';
  function send(msg) {
    var v = lastView; if (!v || v.phase !== 'play' || v.turn !== v.you || actSent === v.lid + ':' + v.mv) return false;
    actSent = v.lid + ':' + v.mv; msg.mv = v.mv; msg.lid = v.lid;
    $('declBtn').disabled = $('helpBtn').disabled = true;
    if (host) { var seat = seatBySid(1); if (msg.t === 'declare') hostDeclare(seat, msg, null); else hostHelp(seat, msg, null); actSent = ''; }
    else if (client && client.conn && client.conn.open) client.conn.send(msg);
    return true;
  }

  // ---- メニュー選択（宣言） ----
  var pick = { tab: 'all', q: '', sel: null };
  function openPicker() { pick = { tab: 'all', q: '', sel: null }; $('pickSearch').value = ''; renderPicker(); overlay('picker', true); $('pickGrid').scrollTop = 0; }
  function renderPicker() {
    $('pickTabs').innerHTML = [{ key: 'all', label: 'すべて', e: '📋' }].concat(O.CATS).map(function (c) {
      return '<button data-tab="' + c.key + '" class="' + (pick.tab === c.key ? 'on' : '') + '">' + c.e + ' ' + c.label + '</button>';
    }).join('');
    var q = kana(pick.q.trim());
    var list = O.MENU.filter(function (m) { return (pick.tab === 'all' || m.c === pick.tab) && (!q || kana(m.n).indexOf(q) >= 0 || kana(m.t).indexOf(q) >= 0); });
    $('pickGrid').innerHTML = list.length ? list.map(function (m) {
      return '<button data-id="' + m.id + '" class="' + (pick.sel === m.id ? 'sel' : '') + '">' + ticket(m.id, 'sm') + '</button>';
    }).join('') : '<div class="empty">見つかりません</div>';
    $('pickOk').disabled = !pick.sel;
    $('pickOk').textContent = pick.sel ? '「' + itemName(pick.sel) + '」を宣言する！' : '注文を選んでください';
  }
  $('pickTabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { pick.tab = b.dataset.tab; renderPicker(); } });
  $('pickSearch').addEventListener('input', function () { pick.q = this.value; renderPicker(); });
  $('pickGrid').addEventListener('click', function (e) { var b = e.target.closest('button[data-id]'); if (b) { pick.sel = +b.dataset.id; renderPicker(); } });
  $('pickClose').onclick = function () { overlay('picker', false); };
  $('pickOk').onclick = function () { if (!pick.sel) return; overlay('picker', false); send({ t: 'declare', item: pick.sel }); };
  $('declBtn').onclick = function () { if (lastView && lastView.turn === lastView.you) openPicker(); };

  // ---- お助け ----
  var hp = { kind: null, target: null, item: null };
  function openHelp() { hp = { kind: null, target: null, item: null }; renderHelp(); overlay('helpModal', true); }
  function renderHelp() {
    var v = lastView;
    [].forEach.call($('abilList').children, function (b) { b.classList.toggle('sel', b.dataset.k === hp.kind); });
    var s2 = '';
    if (hp.kind === 'first' || hp.kind === 'last') {
      s2 = '<h3>だれの手札をのぞく？</h3><div class="pickrow">' + v.seats.filter(function (s) { return s.sid !== v.you; }).map(function (s) {
        return '<button data-t="' + s.sid + '" class="' + (hp.target === s.sid ? 'sel' : '') + '"' + (s.hand ? '' : ' disabled') + '>' + esc(s.name) + '（' + s.hand + '枚）</button>';
      }).join('') + '</div>';
    } else if (hp.kind === 'discard') {
      s2 = v.canDiscard ? '<h3>どの注文を捨てる？</h3><div class="handpick">' + v.hand.map(function (id) {
        return '<button data-i="' + id + '" class="' + (hp.item === id ? 'sel' : '') + '">' + ticket(id, 'sm') + '</button>';
      }).join('') + '</div>' : '<p style="color:var(--berry);font-weight:800">最後の1枚は捨てられません。</p>';
    }
    $('helpStep2').innerHTML = s2;
    $('helpOk').disabled = !(hp.kind && ((hp.kind === 'discard' && hp.item && v.canDiscard) || (hp.kind !== 'discard' && hp.target)));
  }
  $('abilList').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { hp.kind = b.dataset.k; hp.target = hp.item = null; renderHelp(); } });
  $('helpStep2').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.t) hp.target = +b.dataset.t; if (b.dataset.i) hp.item = +b.dataset.i; renderHelp();
  });
  $('helpCancel').onclick = function () { overlay('helpModal', false); };
  $('helpOk').onclick = function () { overlay('helpModal', false); send({ t: 'help', kind: hp.kind, target: hp.target, item: hp.item }); };
  $('helpBtn').onclick = function () { if (lastView && lastView.turn === lastView.you) openHelp(); };
  $('peekOk').onclick = function () { overlay('peekModal', false); };

  // =====================================================================
  //  描画（受け取ったビューだけを使う）
  // =====================================================================
  var lastEvId = null, lastMemoKey = '', shownPriv = 0, lastResultKey = '';
  function render(v) {
    lastView = v; window.__om.view = v;
    abortUi(v);
    if (lastEvId === null) lastEvId = v.ev ? v.ev.id : 0; // 参加直後に過去の演出を再生しない
    if (v.phase === 'lobby') { show('lobby'); renderLobby(v); }
    else if (v.phase === 'memorize') { overlay('picker', false); overlay('helpModal', false); show('memo'); renderMemo(v); }
    else if (v.phase === 'play') { show('play'); renderPlay(v); }
    else { renderPlay(v); show('result'); renderResult(v); }
    if (v.ev && v.ev.id !== lastEvId) { lastEvId = v.ev.id; drama(v, v.ev); }
    if (v.myHelp && v.myHelp.id !== shownPriv) {
      shownPriv = v.myHelp.id;
      if (v.myHelp.kind !== 'discard') {
        $('peekTitle').textContent = '🔍 ' + v.myHelp.targetName + 'の手札の「' + (v.myHelp.kind === 'first' ? '最初' : '最後') + 'の文字」';
        $('peekChars').innerHTML = v.myHelp.chars.length ? v.myHelp.chars.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') : '<p>手札がありません</p>';
        setTimeout(function () { overlay('peekModal', true); }, DRAMA_MS);
      }
    }
  }
  function renderLobby(v) {
    var isHost = !!host;
    $('codeBig').textContent = v.code;
    var url = inviteUrl(v.code);
    $('inviteUrl').textContent = url;
    if ($('qr').dataset.url !== url) {
      try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) {}
      $('qr').dataset.url = url;
    }
    var n = v.seats.length;
    $('seatCount').textContent = n + ' / 6人';
    $('seatList').innerHTML = v.seats.map(function (s, i) {
      var tags = (s.kind === 'host' ? '<span class="tag host">ホスト</span>' : '') + (s.sid === v.you ? '<span class="tag you">あなた</span>' : '') +
        (s.kind === 'remote' ? (s.connected ? '<span class="tag on">接続中</span>' : '<span class="tag off">切断</span>') : '');
      return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av">' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span>' + tags +
        (isHost && s.kind !== 'host' ? '<button class="xbtn" data-sid="' + s.sid + '">×</button>' : '') + '</div>';
    }).join('');
    $('seatHint').textContent = n < 2 ? 'あと' + (2 - n) + '人必要です（2〜6人で遊べます）' : '2〜6人で遊べます／クリア条件：手札0枚が' + O.threshold(n) + '人';
    var seg = function (id, items, cur) {
      $(id).innerHTML = items.map(function (it) { return '<button data-v="' + it.v + '" class="' + (String(it.v) === String(cur) ? 'on' : '') + '"' + (isHost ? '' : ' disabled') + '>' + it.l + '</button>'; }).join('');
      $(id).classList.toggle('ro', !isHost);
    };
    seg('levelSeg', [1, 2, 3, 4, 5, 6, 7].map(function (x) { return { v: x, l: x }; }), v.opts.startLevel);
    seg('speedSeg', SPEEDS.map(function (s) { return { v: s.key, l: s.label }; }), v.opts.speed);
    seg('helpSeg', HELP_MODES.map(function (s) { return { v: s.key, l: s.label }; }), v.opts.helpMode);
    seg('discardSeg', [{ v: '0', l: '捨てられない' }, { v: '1', l: '捨ててもよい' }], v.opts.discardLast ? '1' : '0');
    $('startBtn').disabled = n < 2;
    $('startBtn').textContent = n < 2 ? 'あと' + (2 - n) + '人で開店できます' : '開店！（' + n + '人・レベル' + v.opts.startLevel + 'から）';
    $('leaveBtn1').textContent = isHost ? '部屋を閉じる' : '部屋を出る';
  }
  function renderMemo(v) {
    var m = v.memo;
    $('memoHead').innerHTML = 'レベル' + v.level + ' の注文<small>メモは禁止！ しっかりおぼえてね</small>';
    var key = v.lid + ':' + m.idx;
    if (key === lastMemoKey) return;
    lastMemoKey = key;
    if (m.idx < 0) $('memoBody').innerHTML = '<div class="memo-ready"><span class="big">🐻</span>いらっしゃいませ！<br>注文は全部で <b style="color:var(--gold)">' + m.total + '</b> 個です</div>';
    else if (m.item != null) { $('memoBody').innerHTML = ticket(m.item, 'big', 'popin'); speak(itemName(m.item)); }
    else $('memoBody').innerHTML = '<div class="memo-ready"><span class="big">🃏</span>注文をシャッフルして<br>手札を配っています…</div>';
    var shown = Math.max(0, Math.min(m.idx + 1, m.total));
    $('memoBar').style.width = (shown / m.total * 100) + '%';
    $('memoCount').innerHTML = '<b>' + shown + '</b> / ' + m.total;
  }
  function renderPlay(v) {
    $('codeChip').textContent = v.code; $('lvChip').textContent = v.level;
    $('zeroNum').textContent = v.zero + '/' + v.need + '人';
    $('activeNum').textContent = v.active; $('leftNum').textContent = v.left;
    $('players').innerHTML = v.seats.map(function (s) {
      var tags = (s.kind === 'host' ? '<span class="tag host">ホスト</span>' : '') + (s.sid === v.you ? '<span class="tag you">あなた</span>' : '') +
        (s.out ? '<span class="tag out">脱落</span>' : '') + (s.hand === 0 ? '<span class="tag zero">🎉0枚</span>' : '') + (s.connected ? '' : '<span class="tag off">切断</span>');
      var backs = ''; for (var k = 0; k < Math.min(s.hand, 7); k++) backs += '<span class="cb"></span>';
      return '<div class="prow' + (s.sid === v.turn ? ' cur' : '') + (s.out ? ' out' : '') + '"><span class="nm">' + esc(s.name) + '</span><span class="tags">' + tags + '</span>' +
        '<span class="helpico' + (s.helpLeft ? '' : ' used') + '">🤝</span><span class="backs">' + backs + '<span class="num">' + s.hand + '</span></span></div>';
    }).join('');
    $('log').innerHTML = (v.log || []).slice(0, 4).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('');
    $('handCount').textContent = v.hand.length + '枚';
    $('hand').innerHTML = v.hand.length ? v.hand.map(function (id) { return ticket(id, 'sm'); }).join('') : '<div class="empty" style="color:var(--cream)">🎉 手札はありません！</div>';
    var h = v.myHelp;
    $('peekNote').innerHTML = h && h.kind !== 'discard' ? '<div class="peeknote">🔍 お助けメモ：' + esc(h.targetName) + 'の' + (h.kind === 'first' ? '最初' : '最後') + 'の文字 <b>' + h.chars.map(esc).join('・') + '</b></div>'
      : h && h.kind === 'discard' ? '<div class="peeknote">🗑️ お助けで「' + esc(itemName(h.item)) + '」を捨てました</div>' : '';
    var me = v.seats.filter(function (s) { return s.sid === v.you; })[0] || {};
    var cur = v.seats.filter(function (s) { return s.sid === v.turn; })[0];
    var myTurn = v.phase === 'play' && v.turn === v.you;
    if (v.phase !== 'play') $('status').textContent = 'レベル終了';
    else if (myTurn) $('status').textContent = 'あなたの番です！ 注文を宣言しよう';
    else if (me.out) $('status').innerHTML = 'あなたは脱落中… ' + (cur ? esc(san(cur.name)) + 'の番です' : '');
    else if (cur && !cur.connected) $('status').innerHTML = esc(san(cur.name)) + 'の再接続を待っています<span class="dots"></span>';
    else $('status').innerHTML = (cur ? esc(san(cur.name)) + 'が考え中' : '') + '<span class="dots"></span>';
    var can = myTurn && actSent !== v.lid + ':' + v.mv;
    $('declBtn').disabled = !can;
    $('helpBtn').disabled = !can || !me.helpLeft;
    $('helpBtn').innerHTML = me.helpLeft ? '🤝 お助け<br><small>のこり1回</small>' : '🤝 お助け<br><small>使用済み</small>';
    var hb = $('hostbar');
    if (host && v.phase === 'play' && cur && !cur.connected && hb.dataset.dismiss !== String(cur.sid)) {
      hb.innerHTML = '<span>⚠️ ' + esc(san(cur.name)) + 'の接続が切れています</span><button data-skip="' + cur.sid + '">⏭️ スキップ</button><button class="n" data-wait="' + cur.sid + '">待つ</button>';
      hb.classList.add('show');
    } else hb.classList.remove('show');
  }
  var dramaT;
  function drama(v, ev) {
    var by = (v.seats.filter(function (s) { return s.sid === ev.by; })[0] || {}).name || '?';
    var nm = function (sid) { return (v.seats.filter(function (s) { return s.sid === sid; })[0] || {}).name || '?'; };
    var res = $('dRes');
    res.className = 'res';
    if (ev.type === 'declare') {
      $('dWho').innerHTML = '📣 <b>' + esc(by) + '</b> の注文！';
      $('dCard').innerHTML = ticket(ev.item, 'md', 'popin');
      speak(by + '、' + itemName(ev.item));
      if (ev.result === 'hit') { res.classList.add('hit'); res.innerHTML = '⭕ ありました！<small>' + esc(nm(ev.holder)) + 'が持っていました</small>'; }
      else if (ev.selfHeld) { res.classList.add('self'); res.innerHTML = '😱 実は自分の手札にあった…！<small>' + esc(by) + 'は脱落です</small>'; }
      else { res.classList.add('miss'); res.innerHTML = '❌ だれも持っていません…<small>' + esc(by) + 'は脱落です</small>'; }
    } else {
      $('dWho').innerHTML = '🤝 <b>' + esc(by) + '</b> がお助けを使った！';
      $('dCard').innerHTML = '<div style="font-size:64px" class="popin">' + (ev.kind === 'discard' ? '🗑️' : '🔍') + '</div>';
      res.classList.add('hit');
      res.innerHTML = ev.kind === 'discard' ? '手札を1枚すてました' : esc(nm(ev.target)) + 'の手札の<br>「' + (ev.kind === 'first' ? '最初' : '最後') + 'の文字」をのぞいた！';
    }
    overlay('drama', true);
    clearTimeout(dramaT);
    setTimeout(function () { res.classList.add('show'); if (ev.type === 'declare' && ev.result === 'miss') $('dCard').firstChild && $('dCard').firstChild.classList.add('shake'); }, DRAMA_MS * 0.35);
    dramaT = setTimeout(function () { overlay('drama', false); }, DRAMA_MS);
  }
  $('drama').addEventListener('click', function () { overlay('drama', false); });

  function renderResult(v) {
    var key = v.phase + ':' + v.level;
    var icon = { clear: '🎉', fail: '💦', victory: '🏆' }[v.phase];
    $('rIcon').textContent = icon;
    $('rTitle').textContent = v.phase === 'clear' ? 'レベル' + v.level + ' クリア！' : v.phase === 'fail' ? 'レベル' + v.level + ' 失敗…' : '全レベル制覇！';
    $('rText').textContent = v.phase === 'clear' ? '手札0枚の人が' + v.zero + '人になりました！ 次はもっと注文が増えます。'
      : v.phase === 'fail' ? '全員が脱落してしまいました。もう一度チャレンジしよう！'
      : 'レベル7の注文をさばききりました！ ふーさんの森カフェは大繁盛🐻✨';
    var st = ''; for (var i = 1; i <= 7; i++) st += '<span class="' + (i < v.level || (i === v.level && v.phase !== 'fail') ? 'on' : '') + '">⭐</span>';
    $('rStars').innerHTML = st;
    var R = v.reveal || { dealt: {}, hands: {} };
    $('revealBox').innerHTML = v.seats.map(function (s) {
      var dealt = R.dealt[s.sid] || [], left = R.hands[s.sid] || [];
      return '<div class="rev-row"><span class="rn">' + esc(s.name) + (s.out ? ' <span class="tag out">脱落</span>' : '') + '</span><span class="rev-cards">' + dealt.map(function (id) {
        var m = O.item(id); return '<span class="mt' + (left.indexOf(id) >= 0 ? '' : ' gone') + '">' + m.e + ' ' + esc(m.n) + '</span>';
      }).join('') + '</span></div>';
    }).join('');
    var btns = v.phase === 'clear' ? '<button class="mainbtn" data-a="next">次のレベルへ（レベル' + (v.level + 1) + '）</button><button class="subbtn" data-a="lobby">ロビーへ戻る</button>'
      : v.phase === 'fail' ? '<button class="mainbtn" data-a="retry">同じレベルに再挑戦（レベル' + v.level + '）</button><button class="subbtn" data-a="restart">レベル1から</button><button class="subbtn" data-a="lobby">ロビーへ戻る</button>'
      : '<button class="mainbtn" data-a="restart">レベル1からもう一度</button><button class="subbtn" data-a="lobby">ロビーへ戻る</button>';
    $('hostResultBtns').innerHTML = btns;
    $('resultWait').innerHTML = 'ホストが次の操作を選ぶのを待っています<span class="dots"></span>';
    $('leaveBtn2').textContent = host ? '部屋を閉じる' : '部屋を出る';
    if (key !== lastResultKey) { lastResultKey = key; $('result').querySelector('.col').scrollTop = 0; if (v.phase !== 'fail') confetti(); }
  }
  function confetti() {
    var colors = ['#ffd66b', '#f29e4c', '#7cc6a4', '#fff6e5', '#e97aa6'];
    for (var i = 0; i < 40; i++) {
      var c = document.createElement('div'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = colors[i % colors.length];
      c.style.animationDuration = (2.2 + Math.random() * 2.5) + 's'; c.style.animationDelay = (Math.random() * 1.2) + 's';
      document.body.appendChild(c); setTimeout(function (el) { el.remove(); }.bind(null, c), 6500);
    }
  }

  // ---- 招待URLのコピー・共有 ----
  $('copyBtn').onclick = function () {
    var u = $('inviteUrl').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('招待URLをコピーしました'); }, function () { toast('コピーできませんでした。URLを長押ししてコピーしてください'); });
  };
  $('shareBtn').onclick = function () {
    var u = $('inviteUrl').textContent;
    if (navigator.share) navigator.share({ title: 'おぼえてオーダー！', text: 'ふーさんの森カフェで一緒に遊ぼう！', url: u }).catch(function () {});
    else $('copyBtn').click();
  };

  // ---- タイトル ----
  function renderTitle() {
    if (!$('nameIn').value) $('nameIn').value = load(LS_NAME) || '';
    var inv = normCode(Q.get('room'));
    $('inviteJoinBox').style.display = inv.length === 4 ? '' : 'none';
    $('invCode').textContent = inv; if (inv.length === 4) $('codeIn').value = inv;
    var saved = load(LS_HOST, true);
    var ok = saved && saved.room && Date.now() - saved.saved < 12 * 3600 * 1000;
    $('resumeBtn').style.display = ok ? '' : 'none';
    if (ok) $('resumeBtn').textContent = '前回の部屋（' + saved.room.code + '）を再開する';
    var j = sload(SS_CLIENT);
    $('rejoinBtn').style.display = j ? '' : 'none';
    if (j) $('rejoinBtn').textContent = '部屋 ' + j.code + ' に戻る（' + j.name + '）';
  }
  function getName() { var n = cleanName($('nameIn').value); if (!n) { toast('ニックネームを入力してください'); $('nameIn').focus(); return null; } store(LS_NAME, n); return n; }
  $('createBtn').onclick = function () { var n = getName(); if (n) { store(LS_HOST, null); startHost(n, null); } };
  $('resumeBtn').onclick = function () { var s = load(LS_HOST, true); if (s) startHost(s.room.seats[0].name, s.room); };
  function join(code) { var n = getName(); if (!n) return; code = normCode(code); if (code.length !== 4) { toast('4文字の部屋コードを入力してください'); return; } startClient(code, n); }
  $('joinBtn').onclick = function () { join($('codeIn').value); };
  $('joinInvitedBtn').onclick = function () { join(Q.get('room')); };
  $('rejoinBtn').onclick = function () { var j = sload(SS_CLIENT); if (j) { $('nameIn').value = j.name; startClient(j.code, j.name); } };
  $('codeIn').addEventListener('input', function () { this.value = normCode(this.value); });

  // テスト・デバッグ用（ゲームの秘密情報はホスト以外には存在しません）
  window.__om = {
    view: null, received: received,
    role: function () { return host ? 'host' : client ? 'client' : 'none'; },
    hostRoom: function () { return host ? host.room : null; },
    sendRaw: function (m) { if (client && client.conn) client.conn.send(m); },
    setDramaMs: function (ms) { DRAMA_MS = ms; }   // テスト用（演出の長さ・この端末だけ）
  };
  renderTitle();
})();
