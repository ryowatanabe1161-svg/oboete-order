/* おぼえてオーダー！ ― ふーさんの森カフェ ― ゲームロジック（UI非依存・ブラウザ/Node共通） */
var OrderGame = (function () {
  'use strict';
  var CATS = [
    { key: 'drink', label: 'ドリンク', e: '🥤' },
    { key: 'sweets', label: 'スイーツ', e: '🍰' },
    { key: 'meal', label: 'ごはん', e: '🍛' },
    { key: 'bread', label: 'パン・軽食', e: '🥪' }
  ];
  // [名前, カテゴリ, 絵文字, タグ]  ※名前はすべて異なる
  var RAW = [
    // ---- ドリンク ----
    ['ホットコーヒー', 'drink', '☕', 'ホット'], ['アイスコーヒー', 'drink', '☕', 'アイス'],
    ['ホットカフェラテ', 'drink', '☕', 'ホット'], ['アイスカフェラテ', 'drink', '🥛', 'アイス'],
    ['カフェモカ', 'drink', '☕'], ['キャラメルラテ', 'drink', '☕'], ['どんぐりコーヒー', 'drink', '🌰'],
    ['ホットココア', 'drink', '🍫', 'ホット'], ['アイスココア', 'drink', '🍫', 'アイス'],
    ['ホットミルク', 'drink', '🥛', 'ホット'], ['いちごミルク', 'drink', '🍓'], ['バナナミルク', 'drink', '🍌'], ['はちみつミルク', 'drink', '🍯'],
    ['ホットレモンティー', 'drink', '🍋', 'ホット'], ['アイスレモンティー', 'drink', '🍋', 'アイス'],
    ['ホットミルクティー', 'drink', '🫖', 'ホット'], ['アイスミルクティー', 'drink', '🫖', 'アイス'], ['ロイヤルミルクティー', 'drink', '🫖'],
    ['タピオカミルクティー', 'drink', '🧋'], ['ほうじ茶ラテ', 'drink', '🍵'], ['抹茶ラテ', 'drink', '🍵'], ['緑茶', 'drink', '🍵'], ['麦茶', 'drink', '🍵', 'アイス'],
    ['オレンジジュース', 'drink', '🍊'], ['りんごジュース', 'drink', '🍎'], ['ぶどうジュース', 'drink', '🍇'], ['ももジュース', 'drink', '🍑'],
    ['トマトジュース', 'drink', '🍅'], ['ミックスジュース', 'drink', '🧃'], ['メロンソーダ', 'drink', '🍈'], ['クリームソーダ', 'drink', '🍨'],
    ['レモンスカッシュ', 'drink', '🍋'], ['ジンジャーエール', 'drink', '🥤'], ['ホットはちみつレモン', 'drink', '🍯', 'ホット'], ['アイスはちみつレモン', 'drink', '🍯', 'アイス'],
    // ---- スイーツ ----
    ['ショートケーキ', 'sweets', '🍰'], ['チーズケーキ', 'sweets', '🧀'], ['チョコレートケーキ', 'sweets', '🍫'], ['モンブラン', 'sweets', '🌰'],
    ['ロールケーキ', 'sweets', '🍥'], ['アップルパイ', 'sweets', '🥧'], ['かぼちゃパイ', 'sweets', '🎃'],
    ['パンケーキ', 'sweets', '🥞'], ['はちみつパンケーキ', 'sweets', '🍯'], ['いちごパンケーキ', 'sweets', '🍓'], ['バナナパンケーキ', 'sweets', '🍌'],
    ['ワッフル', 'sweets', '🧇'], ['フレンチトースト', 'sweets', '🍞'],
    ['プリン', 'sweets', '🍮'], ['かぼちゃプリン', 'sweets', '🎃'], ['プリンアラモード', 'sweets', '🍮'],
    ['バニラアイス', 'sweets', '🍦'], ['チョコアイス', 'sweets', '🍦'], ['抹茶アイス', 'sweets', '🍦'], ['いちごアイス', 'sweets', '🍨'],
    ['いちごパフェ', 'sweets', '🍓'], ['チョコパフェ', 'sweets', '🍫'], ['抹茶パフェ', 'sweets', '🍵'], ['くりパフェ', 'sweets', '🌰'],
    ['どら焼き', 'sweets', '🥮'], ['みたらし団子', 'sweets', '🍡'], ['あんみつ', 'sweets', '🍧'], ['かき氷いちご', 'sweets', '🍧'], ['かき氷メロン', 'sweets', '🍧'],
    ['クッキー', 'sweets', '🍪'], ['マカロン', 'sweets', '🌈'], ['ドーナツ', 'sweets', '🍩'], ['チョコドーナツ', 'sweets', '🍩'], ['シュークリーム', 'sweets', '🥯'],
    // ---- ごはん ----
    ['オムライス', 'meal', '🍳'], ['カレーライス', 'meal', '🍛'], ['カツカレー', 'meal', '🍛'], ['きのこカレー', 'meal', '🍄'], ['ハヤシライス', 'meal', '🍛'],
    ['ナポリタン', 'meal', '🍝'], ['ミートソース', 'meal', '🍝'], ['カルボナーラ', 'meal', '🍝'], ['きのこパスタ', 'meal', '🍄'],
    ['ハンバーグ', 'meal', '🥩'], ['チーズハンバーグ', 'meal', '🧀'], ['エビフライ', 'meal', '🍤'], ['からあげ', 'meal', '🍗'],
    ['グラタン', 'meal', '🧀'], ['ドリア', 'meal', '🍲'], ['ピザトースト', 'meal', '🍕'], ['きのこピザ', 'meal', '🍕'],
    ['きのこスープ', 'meal', '🍄'], ['かぼちゃスープ', 'meal', '🎃'], ['コーンスープ', 'meal', '🌽'], ['トマトスープ', 'meal', '🍅'],
    ['鮭おにぎり', 'meal', '🍙'], ['梅おにぎり', 'meal', '🍙'], ['焼きおにぎり', 'meal', '🍙'], ['グリーンサラダ', 'meal', '🥗'], ['ポテトサラダ', 'meal', '🥔'],
    // ---- パン・軽食 ----
    ['たまごサンド', 'bread', '🥪'], ['ハムサンド', 'bread', '🥪'], ['フルーツサンド', 'bread', '🍓'], ['カツサンド', 'bread', '🥪'],
    ['ホットドッグ', 'bread', '🌭'], ['ハンバーガー', 'bread', '🍔'], ['チーズバーガー', 'bread', '🍔'], ['フライドポテト', 'bread', '🍟'],
    ['クロワッサン', 'bread', '🥐'], ['チョコクロワッサン', 'bread', '🥐'], ['メロンパン', 'bread', '🍈'], ['あんパン', 'bread', '🍞'],
    ['カレーパン', 'bread', '🍛'], ['クリームパン', 'bread', '🍞'], ['バタートースト', 'bread', '🍞'], ['はちみつトースト', 'bread', '🍯']
  ];
  var MENU = RAW.map(function (r, i) { return { id: i + 1, n: r[0], c: r[1], e: r[2], t: r[3] || '' }; });
  var BY_ID = {};
  MENU.forEach(function (m) { BY_ID[m.id] = m; });

  function item(id) { return BY_ID[id]; }
  function shuffle(a, rng) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // クリアに必要な「手札0枚の人数」
  function threshold(n) { return n <= 2 ? 1 : n <= 4 ? 2 : 3; }
  function firstChar(s) { return Array.from(s)[0]; }
  function lastChar(s) { var a = Array.from(s); return a[a.length - 1]; }

  // 新しいレベル（注文 = レベル × 人数、均等に配る）
  // opts: { startIdx, helpUsed(共有オブジェクト：ゲーム中1回モード用), allowDiscardLast }
  function newLevel(pids, level, rng, opts) {
    rng = rng || Math.random; opts = opts || {};
    var n = pids.length;
    if (n < 2 || n > 6) throw new Error('プレイ人数は2〜6人です');
    if (level < 1 || level > 7) throw new Error('レベルは1〜7です');
    var total = level * n;
    var ids = shuffle(MENU.map(function (m) { return m.id; }), rng).slice(0, total);
    var orders = ids.slice();                       // 覚える順番
    var deck = shuffle(ids.slice(), rng);           // シャッフルして配る
    var hands = {}, out = {};
    pids.forEach(function (p) { hands[p] = []; out[p] = false; });
    var start = ((opts.startIdx || 0) % n + n) % n;
    deck.forEach(function (id, k) { hands[pids[(start + k) % n]].push(id); });
    var dealt = {};
    pids.forEach(function (p) { dealt[p] = hands[p].slice(); });
    return {
      level: level, pids: pids.slice(), orders: orders, hands: hands, dealt: dealt, out: out, turnIdx: start,
      phase: 'memorize', moves: 0, need: threshold(n), helpUsed: opts.helpUsed || {}, allowDiscardLast: !!opts.allowDiscardLast, history: []
    };
  }
  function startPlay(L) { if (L.phase === 'memorize') L.phase = 'play'; return L; }
  function currentPid(L) { return L.phase === 'play' ? L.pids[L.turnIdx] : null; }
  function zeroCount(L) { return L.pids.filter(function (p) { return L.hands[p].length === 0; }).length; }
  function activeCount(L) { return L.pids.filter(function (p) { return !L.out[p]; }).length; }
  function holderOf(L, id) { for (var i = 0; i < L.pids.length; i++) if (L.hands[L.pids[i]].indexOf(id) >= 0) return L.pids[i]; return null; }

  function checkEnd(L) {
    if (zeroCount(L) >= L.need) { L.phase = 'clear'; return; }
    if (activeCount(L) === 0) L.phase = 'fail';
  }
  function advance(L) {
    if (L.phase !== 'play') return;
    var n = L.pids.length;
    for (var k = 1; k <= n; k++) {
      var i = (L.turnIdx + k) % n;
      if (!L.out[L.pids[i]]) { L.turnIdx = i; return; }
    }
    L.phase = 'fail';
  }

  // 宣言：他の誰かが持っていれば成功。持っていなければ（自分だけが持っている場合も）失敗→脱落
  function declare(L, pid, id) {
    if (L.phase !== 'play') throw new Error('いまは宣言できません');
    if (currentPid(L) !== pid) throw new Error('あなたの番ではありません');
    if (!BY_ID[id]) throw new Error('メニューにない品目です');
    var holder = holderOf(L, id);
    var ev = { type: 'declare', by: pid, item: id, level: L.level };
    if (holder !== null && holder !== pid) {
      L.hands[holder].splice(L.hands[holder].indexOf(id), 1);
      ev.result = 'hit'; ev.holder = holder;
    } else {
      L.out[pid] = true;
      ev.result = 'miss'; ev.selfHeld = holder === pid;
    }
    L.moves++;
    checkEnd(L);
    if (L.phase === 'play') advance(L);
    ev.phase = L.phase;
    L.history.push(ev);
    return ev;
  }

  function canHelp(L, pid) {
    return L.phase === 'play' && currentPid(L) === pid && !L.out[pid] && !L.helpUsed[pid];
  }
  // お助け（a）（b）：相手の手札すべての「最初の文字」/「最後の文字」を見る（並びは五十音順にして手札の順番を隠す）
  function helpPeek(L, pid, target, which) {
    if (!canHelp(L, pid)) throw new Error('お助けは使えません');
    if (target === pid || L.pids.indexOf(target) < 0) throw new Error('相手を選んでください');
    var chars = L.hands[target].map(function (id) { var n = BY_ID[id].n; return which === 'last' ? lastChar(n) : firstChar(n); });
    chars.sort(function (a, b) { return a.localeCompare(b, 'ja'); });
    L.helpUsed[pid] = true; L.moves++;
    var ev = { type: 'help', by: pid, kind: which === 'last' ? 'last' : 'first', target: target, level: L.level };
    L.history.push(ev);
    return { ev: ev, chars: chars };
  }
  // お助け（c）：自分の手札を1枚捨てる（最後の1枚は不可。オプションで可）
  function canDiscard(L, pid) { return L.hands[pid].length >= (L.allowDiscardLast ? 1 : 2); }
  function helpDiscard(L, pid, id) {
    if (!canHelp(L, pid)) throw new Error('お助けは使えません');
    var h = L.hands[pid], k = h.indexOf(id);
    if (k < 0) throw new Error('その注文は持っていません');
    if (!canDiscard(L, pid)) throw new Error('最後の1枚は捨てられません');
    h.splice(k, 1);
    L.helpUsed[pid] = true; L.moves++;
    var ev = { type: 'help', by: pid, kind: 'discard', level: L.level };
    checkEnd(L);
    ev.phase = L.phase;
    L.history.push(ev);
    return { ev: ev, discarded: id };
  }
  // 手番の人をスキップ（接続切れ対策・ペナルティなし）
  function skip(L) { if (L.phase === 'play') { L.moves++; advance(L); } }

  return {
    CATS: CATS, MENU: MENU, item: item, shuffle: shuffle, threshold: threshold, firstChar: firstChar, lastChar: lastChar,
    newLevel: newLevel, startPlay: startPlay, currentPid: currentPid, zeroCount: zeroCount, activeCount: activeCount, holderOf: holderOf,
    declare: declare, canHelp: canHelp, helpPeek: helpPeek, canDiscard: canDiscard, helpDiscard: helpDiscard, skip: skip
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = OrderGame;
