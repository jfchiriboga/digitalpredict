/* Adaptador mínimo del motor `dash` de claude.ai para correr la misma página en Vercel.
   Provee: dash.data, dash.calc, dash.draw, dash.onData, dash.params/setParams/resetParams, dash.colors. */
(function () {
  'use strict';
  var DEFAULTS = { categoria: 'BANCOS', desde: '2026-01-01', plataforma: '' };
  var JSON_KEYS = { marca: 1, competidores: 1 };
  var params = Object.assign({}, DEFAULTS);
  var listeners = [], draws = new Map(), calcs = new Map(), scheduled = false;

  function readUrl() {
    var out = {};
    new URLSearchParams(location.search).forEach(function (v, k) {
      if (JSON_KEYS[k]) { try { out[k] = JSON.parse(v); } catch (e) { /* se ignora */ } }
      else if (k in DEFAULTS) out[k] = v;
    });
    return out;
  }
  function writeUrl() {
    var u = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v == null || v === DEFAULTS[k]) return;
      u.set(k, JSON_KEYS[k] ? JSON.stringify(v) : v);
    });
    var s = u.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch (e) { /* sin historial */ }
  }
  Object.assign(params, readUrl());

  function key() { try { return sessionStorage.getItem('dkey') || ''; } catch (e) { return ''; } }
  function qs(o) { return Object.keys(o).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }

  var SOURCES = {
    cats: {
      key: function () { return 'cats'; },
      url: function () { return '/api/data?tipo=cats'; },
      parse: function (j) { return (j.cats || []).map(function (c) { return { categoria: c }; }); },
    },
    serie: {
      key: function () { return [params.categoria, params.desde, params.plataforma || ''].join('|'); },
      url: function () { return '/api/data?' + qs({ tipo: 'serie', categoria: params.categoria || '', desde: params.desde || '', plataforma: params.plataforma || '' }); },
      parse: function (j) {
        return j.r.map(function (r) {
          return { fecha: r[0], categorias: j.categoria, marcas: j.m[r[1]], plataformas: j.p[r[2]], digital_predict: r[3], timesfm: r[4] };
        });
      },
    },
  };
  var state = {};
  Object.keys(SOURCES).forEach(function (id) { state[id] = { status: 'loading', data: [], message: '', key: null }; });

  function load(id) {
    var s = SOURCES[id], st = state[id], k = s.key();
    if (st.key === k) return;
    st.key = k; st.status = 'loading'; st.data = []; st.message = '';
    fetch(s.url(), { headers: { 'x-dashboard-key': encodeURIComponent(key().trim()) } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); })
      .then(function (x) {
        if (st.key !== k) return;
        if (x.r.status === 401) {
          st.status = 'error'; st.message = 'auth'; st.key = null;
          if (window.__dashNeedLogin) window.__dashNeedLogin();
        } else if (!x.r.ok) { st.status = 'error'; st.message = x.j.error || 'HTTP ' + x.r.status; st.key = null; }
        else { st.data = s.parse(x.j); st.status = 'ok'; }
        schedule();
      })
      .catch(function (e) { if (st.key !== k) return; st.status = 'error'; st.message = String(e && e.message || e); st.key = null; schedule(); });
  }
  function loadAll() { Object.keys(SOURCES).forEach(load); }

  function get(id) {
    if (state[id]) return { status: state[id].status, data: state[id].data, message: state[id].message };
    var c = calcs.get(id);
    if (!c) return { status: 'missing', data: [], message: 'sin fuente' };
    var ins = c.inputs.map(get);
    for (var i = 0; i < ins.length; i++) if (ins[i].status !== 'ok') return { status: ins[i].status, data: [], message: ins[i].message };
    if (!c.deps || ins.some(function (x, n) { return x.data !== c.deps[n]; })) {
      try { c.out = c.fn.apply(null, ins.map(function (x) { return x.data; })); c.deps = ins.map(function (x) { return x.data; }); c.err = null; }
      catch (e) { c.deps = null; c.err = e; }
    }
    return c.err ? { status: 'error', data: [], message: String(c.err.message) } : { status: 'ok', data: c.out, message: '' };
  }

  function render() {
    scheduled = false;
    listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
    draws.forEach(function (fn, name) {
      document.querySelectorAll('[data-draw="' + name + '"]').forEach(function (el) { try { fn(el); } catch (e) { console.error(name, e); } });
    });
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(render); } }

  function setParams(o) {
    Object.keys(o).forEach(function (k) { if (o[k] !== undefined) params[k] = Array.isArray(o[k]) ? o[k].slice() : o[k]; });
    writeUrl(); loadAll(); schedule();
  }

  window.dash = {
    data: get,
    calc: function (id, def) { calcs.set(id, { inputs: def.inputs, fn: def.fn }); },
    loader: function () {},
    draw: function (name, fn) { draws.set(name, fn); },
    onData: function (fn) { listeners.push(fn); },
    params: function () { return Object.assign({}, params); },
    setParams: setParams,
    resetParams: function () { params = Object.assign({}, DEFAULTS); writeUrl(); loadAll(); schedule(); },
    refresh: function () { Object.keys(SOURCES).forEach(function (id) { state[id].key = null; }); loadAll(); },
    retry: function () { Object.keys(SOURCES).forEach(function (id) { if (state[id].status === 'error') state[id].key = null; }); loadAll(); schedule(); },
    start: function () {
      var root = document.getElementById('dash-root'), w = root.clientWidth, t;
      new ResizeObserver(function () {
        if (root.clientWidth === w) return;
        w = root.clientWidth; clearTimeout(t); t = setTimeout(schedule, 120);
      }).observe(root);
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
      loadAll(); schedule();
    },
  };
  Object.defineProperty(window.dash, 'colors', {
    get: function () {
      var cs = getComputedStyle(document.documentElement), out = [];
      for (var i = 0; i < 8; i++) out.push(cs.getPropertyValue('--c' + i).trim());
      return out;
    },
  });
})();
