/* ioclick — tiny SPA: hash router + self-contained markdown renderer.
   No build step, no external libraries. Add a post = add a .md file +
   one entry in posts/index.json. */

/* ---------------- theme ---------------- */
(function () {
  var saved = localStorage.getItem('ioclick-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
})();
var themeBtn = document.getElementById('themeToggle');
if (themeBtn) {
  themeBtn.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ioclick-theme', next);
  });
}

var yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------------- reading progress ---------------- */
var progressEl = document.getElementById('progress');
window.addEventListener('scroll', function () {
  if (!progressEl) return;
  var h = document.documentElement;
  var max = h.scrollHeight - h.clientHeight;
  progressEl.style.width = max > 0 ? (h.scrollTop / max * 100) + '%' : '0';
});

/* ---------------- helpers ---------------- */
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtDate(iso) {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US',
      { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) { return iso; }
}
function updateMetaTags(title, desc, url) {
  document.title = title;
  var metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc && desc) metaDesc.setAttribute('content', desc);
  var ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  var ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc && desc) ogDesc.setAttribute('content', desc);
  var ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', url || location.href);
}
function toBase64(str) {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
      return String.fromCharCode('0x' + p1);
    }));
  } catch (e) {
    return btoa(unescape(encodeURIComponent(str)));
  }
}
function fromBase64(str) {
  try {
    return decodeURIComponent(Array.prototype.map.call(atob(str.replace(/\s/g, '')), function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  } catch (e) {
    return decodeURIComponent(escape(atob(str.replace(/\s/g, ''))));
  }
}

/* ---------------- markdown ---------------- */
/* Supports: # ## ### headings, fenced ```code```, > blockquote, --- hr,
   - / * / 1. lists, | tables |, inline **bold** *italic* `code` [link](url). */
/* Placeholders use \uE000..\uE001 markers so later passes never re-scan them. */
function stasher() {
  var store = [];
  return {
    // one Private-Use char per stash => no digits/letters for later passes to re-match
    keep: function (html) { store.push(html); return String.fromCharCode(0xE000 + store.length - 1); },
    restore: function (str) {
      return str.replace(/[\uE000-\uF8FF]/g, function (ch) { return store[ch.charCodeAt(0) - 0xE000]; });
    }
  };
}

function highlightCode(code) {
  var out = esc(code);                 // escape &,<,> once
  var st = stasher();
  // 1) protect comments and strings BEFORE any other pass
  out = out.replace(/\/\/[^\n]*/g, function (m) { return st.keep('<span class="tok-com">' + m + '</span>'); });
  out = out.replace(/\/\*[\s\S]*?\*\//g, function (m) { return st.keep('<span class="tok-com">' + m + '</span>'); });
  out = out.replace(/"[^"\n]*"|'[^'\n]*'/g, function (m) { return st.keep('<span class="tok-str">' + m + '</span>'); });
  // 2) remaining text is pure code — safe to highlight
  out = out.replace(/\b(public|private|protected|static|final|abstract|void|new|return|class|interface|enum|extends|implements|import|package|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|throws|int|long|double|float|boolean|char|byte|short|var|this|super|null|true|false)\b/g,
    '<span class="tok-key">$1</span>');
  out = out.replace(/\b([A-Z][A-Za-z0-9_]*)\b/g, '<span class="tok-typ">$1</span>');
  out = out.replace(/\b(0x[0-9A-Fa-f]+|\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
  // 3) restore comments/strings (nothing scans after this)
  return st.restore(out);
}

function inline(s) {
  var out = esc(s);
  var st = stasher();
  // protect inline code first (its content is already escaped)
  out = out.replace(/`([^`]+)`/g, function (_, c) { return st.keep('<code>' + c + '</code>'); });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, text, url) {
    var cleanUrl = url.trim();
    if (/^(javascript:|data:|vbscript:)/i.test(cleanUrl)) {
      cleanUrl = '#';
    }
    return '<a href="' + cleanUrl + '" target="_blank" rel="noopener">' + text + '</a>';
  });
  return st.restore(out);
}

function markdown(src) {
  if (!src) return '';
  var lines = String(src).replace(/\r\n/g, '\n').split('\n');
  var html = '', i = 0;
  function flushList(type, items) {
    html += '<' + type + '>' + items.map(function (it) {
      return '<li>' + inline(it) + '</li>';
    }).join('') + '</' + type + '>';
  }
  while (i < lines.length) {
    var line = lines[i];

    // fenced code
    var fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      var buf = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      // keep the fence language on the element so an edit round-trip can restore it
      html += '<pre><code' + (fence[1] ? ' data-lang="' + esc(fence[1]) + '"' : '') + '>' + highlightCode(buf.join('\n')) + '</code></pre>';
      continue;
    }
    // heading
    var h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { var lv = h[1].length; html += '<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>'; i++; continue; }
    // hr
    if (/^(\s*[-*_]){3,}\s*$/.test(line) && line.trim().replace(/\s/g, '').length >= 3) {
      html += '<hr>'; i++; continue;
    }
    // blockquote
    if (/^>\s?/.test(line)) {
      var q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      html += '<blockquote>' + markdown(q.join('\n')) + '</blockquote>';
      continue;
    }
    // table
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      var head = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
      i += 2; var rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map(function (c) { return c.trim(); })); i++;
      }
      html += '<table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table>';
      continue;
    }
    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      var items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      flushList('ul', items); continue;
    }
    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      var oi = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { oi.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; }
      flushList('ol', oi); continue;
    }
    // blank
    if (/^\s*$/.test(line)) { i++; continue; }
    // paragraph (gather until blank / block)
    var para = [line]; i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !/^(#{1,4}\s|>|```|\s*[-*]\s|\s*\d+\.\s|\|)/.test(lines[i])) {
      para.push(lines[i]); i++;
    }
    html += '<p>' + inline(para.join('\n')) + '</p>';
  }
  return html;
}

/* ---------------- data ---------------- */
var POSTS = null;
function loadPosts() {
  if (POSTS) return Promise.resolve(POSTS);
  var rootPath = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
  if (rootPath.indexOf('/post/') !== -1 || location.pathname.indexOf('/write') !== -1 || location.pathname.indexOf('/about') !== -1) {
    rootPath = '/';
  }

  var primaryUrl = rootPath + 'posts/index.json?v=' + Date.now();
  var fallbackUrl1 = './posts/index.json?v=' + Date.now();
  var fallbackUrl2 = 'https://raw.githubusercontent.com/CherupallyPremkumar/ioclick/main/posts/index.json?v=' + Date.now();

  function parseRes(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  return fetch(primaryUrl)
    .then(parseRes)
    .catch(function () {
      return fetch(fallbackUrl1).then(parseRes);
    })
    .catch(function () {
      return fetch(fallbackUrl2).then(parseRes);
    })
    .then(function (d) {
      POSTS = (d || []).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      return POSTS;
    })
    .catch(function (err) {
      console.error('All post loading attempts failed:', err);
      return [];
    });
}

/* ---------------- views ---------------- */
var app = document.getElementById('app');
var lastPostSlug = null;

function renderHome() {
  return loadPosts().then(function (posts) {
    // Collect all unique tags across posts
    var allTags = [];
    posts.forEach(function (p) {
      (p.tags || []).forEach(function (t) {
        if (allTags.indexOf(t) === -1) allTags.push(t);
      });
    });
    allTags.sort();

    var customSelectHtml =
      '<div class="custom-select" id="customSelect">' +
        '<button type="button" class="custom-select-btn" id="customSelectBtn">' +
          '<span id="customSelectLabel">All Topics</span>' +
          '<span class="chevron">▾</span>' +
        '</button>' +
        '<div class="custom-select-menu" id="customSelectMenu">' +
          '<div class="custom-option active" data-value="">All Topics</div>' +
          allTags.map(function (t) {
            return '<div class="custom-option" data-value="' + esc(t) + '">' + esc(t) + '</div>';
          }).join('') +
        '</div>' +
      '</div>';

    var top =
      '<div class="home-top"><div class="home-top-inner">' +
      '<div class="hero"><h1>Notes</h1></div>' +
      '<div class="filter-controls">' +
        '<div class="search">' +
          '<span class="sic">⌕</span><input id="q" type="text" placeholder="Search posts…" autocomplete="off">' +
          '<span class="count" id="count"></span>' +
        '</div>' +
        customSelectHtml +
      '</div>' +
      '</div></div>';

    var list = '<div class="list-wrap"><div id="postlist"></div></div>';

    app.innerHTML = top + list;

    var listEl = document.getElementById('postlist');
    var qEl = document.getElementById('q');
    var countEl = document.getElementById('count');

    var customSelectEl = document.getElementById('customSelect');
    var customSelectBtn = document.getElementById('customSelectBtn');
    var customSelectLabel = document.getElementById('customSelectLabel');
    var selectedTag = '';

    // Custom dropdown toggle
    if (customSelectBtn && customSelectEl) {
      customSelectBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        customSelectEl.classList.toggle('open');
      });
    }

    document.addEventListener('click', function (e) {
      if (customSelectEl && !customSelectEl.contains(e.target)) {
        customSelectEl.classList.remove('open');
      }
    });

    document.querySelectorAll('.custom-option').forEach(function (opt) {
      opt.addEventListener('click', function (e) {
        e.stopPropagation();
        document.querySelectorAll('.custom-option').forEach(function (o) { o.classList.remove('active'); });
        opt.classList.add('active');
        selectedTag = opt.getAttribute('data-value') || '';
        customSelectLabel.textContent = selectedTag || 'All Topics';
        customSelectEl.classList.remove('open');
        draw();
      });
    });

    function draw() {
      if (!listEl || !countEl || !qEl) return;
      var f = (qEl.value || '').toLowerCase().trim();

      var shown = posts.filter(function (p) {
        if (p.draft) return false;
        var matchesQ = !f || (p.title + ' ' + (p.excerpt || '') + ' ' + (p.tags || []).join(' ')).toLowerCase().indexOf(f) > -1;
        var matchesTag = !selectedTag || (p.tags || []).indexOf(selectedTag) > -1;
        return matchesQ && matchesTag;
      });

      countEl.textContent = shown.length + ' post' + (shown.length === 1 ? '' : 's');
      if (!shown.length) {
        listEl.innerHTML = '<div class="empty">No posts match your filters.</div>';
        return;
      }

      // group posts by year → vertical timeline
      var html = '<div class="timeline">', curYear = null;
      shown.forEach(function (p) {
        var yr = (p.date || '').slice(0, 4);
        if (yr !== curYear) { curYear = yr; html += '<div class="tl-year">' + esc(yr) + '</div>'; }
        html += '<a class="tl-item" href="/post/' + p.slug + '" data-slug="' + p.slug + '">' +
          '<div class="tl-card">' +
            '<div class="tl-date"><time>' + fmtDate(p.date) + (p.updated && p.updated !== p.date ? ' <small style="opacity:0.75;font-weight:normal;">(Updated ' + fmtDate(p.updated) + ')</small>' : '') + '</time>' +
              (p.read ? '<span class="dot">·</span><span>' + esc(p.read) + '</span>' : '') + '</div>' +
            '<div class="tl-title">' + esc(p.title) + '</div>' +
            '<p class="tl-excerpt">' + esc(p.excerpt || '') + '</p>' +
            '<div class="tl-tags">' + (p.tags || []).map(function (t) { return '<span class="badge">' + esc(t) + '</span>'; }).join('') + '</div>' +
          '</div></a>';
      });
      html += '</div>';
      listEl.innerHTML = html;
    }

    draw();
    if (qEl) qEl.addEventListener('input', draw);

    // the top bar is position:fixed — push the list down by its height so nothing hides under it
    function fitTop() {
      var t = document.querySelector('.home-top');
      var lw = document.querySelector('.list-wrap');
      if (t && lw) {
        lw.style.marginTop = (t.offsetHeight + 12) + 'px';
      }
    }
    fitTop();
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(fitTop); }
    setTimeout(fitTop, 250);
    if (!window.__ioFitBound) {
      window.addEventListener('resize', fitTop);
      window.__ioFitBound = true;
    }

    // scroll to target post card in timeline if returning from a post
    if (lastPostSlug) {
      var targetSlug = lastPostSlug;
      lastPostSlug = null;
      setTimeout(function () {
        var card = document.querySelector('.tl-item[data-slug="' + targetSlug + '"]');
        if (card) {
          var topBar = document.querySelector('.home-top');
          var topH = (topBar ? topBar.offsetHeight : 0) + 70;
          var rect = card.getBoundingClientRect();
          var targetY = window.pageYOffset + rect.top - topH;
          window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        }
      }, 50);
    }
  }).catch(function () {
    app.innerHTML = '<div class="list-wrap"><div class="empty">Could not load posts.</div></div>';
  });
}

/* ---------------- rail tooltip ---------------- */
var railTip = document.getElementById('rail-tip');
if (!railTip) {
  railTip = document.createElement('div');
  railTip.id = 'rail-tip';
  railTip.className = 'rail-tip';
  document.body.appendChild(railTip);
}

function attachRailTipEvents() {
  document.querySelectorAll('.mini-dot').forEach(function (dot) {
    dot.addEventListener('mouseenter', function () {
      var title = dot.getAttribute('data-title');
      var date = dot.getAttribute('data-date');
      if (!title) return;
      railTip.innerHTML = '<b>' + title + '</b><small>' + date + '</small>';
      var rect = dot.getBoundingClientRect();
      railTip.style.top = (rect.top + rect.height / 2) + 'px';
      railTip.style.left = (rect.right + 12) + 'px';
      railTip.classList.add('visible');
    });
    dot.addEventListener('mouseleave', function () {
      railTip.classList.remove('visible');
    });
  });
}

function renderPost(slug) {
  lastPostSlug = slug;
  return loadPosts().then(function (posts) {
    var meta = posts.filter(function (p) { return p.slug === slug; })[0];
    if (!meta || meta.draft) { app.innerHTML = '<div class="article"><a class="back" href="/">← All posts</a><p>Post not found.</p></div>'; return; }
    updateMetaTags(meta.title + ' - ioclick', meta.excerpt || 'Deep engineering note on ' + meta.title + ' by Prem Kumar.', 'https://ioclick.me/post/' + slug);
    var rootPath = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
    if (rootPath.indexOf('/post/') !== -1) rootPath = '/';
    return fetch(rootPath + 'posts/' + slug + '.md').then(function (r) { return r.text(); }).then(function (md) {
      // strip an optional leading H1 (we render the title ourselves)
      md = md.replace(/^\s*#\s+.*\n/, '');
      // compact dot-timeline of visible (non-draft) posts; scrollable if many posts
      var visiblePosts = posts.filter(function (p) { return !p.draft; });
      var rail = '<nav class="mini-rail" aria-label="All posts"><span class="mini-line"></span>' +
        visiblePosts.map(function (p) {
          return '<a class="mini-dot' + (p.slug === slug ? ' active' : '') + '" href="/post/' + p.slug + '" data-title="' + esc(p.title) + '" data-date="' + fmtDate(p.date) + '">' +
            '<span class="d"></span>' +
            '</a>';
        }).join('') + '</nav>';
      app.innerHTML =
        rail +
        '<div class="post-bar"><div class="post-bar-inner"><a class="back" href="/">← All posts</a></div></div>' +
        '<article class="article">' +
        '<div class="a-meta"><time>' + fmtDate(meta.date) + (meta.updated && meta.updated !== meta.date ? ' <small style="opacity:0.75;font-weight:normal;">(Updated ' + fmtDate(meta.updated) + ')</small>' : '') + '</time>' +
        (meta.read ? '<span>· ' + meta.read + '</span>' : '') + '</div>' +
        '<h1 class="a-title">' + esc(meta.title) + '</h1>' +
        (meta.excerpt ? '<p class="a-sub">' + esc(meta.excerpt) + '</p>' : '') +
        '<div class="a-tags">' + (meta.tags || []).map(function (t) { return '<span class="badge">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<div class="divider"></div>' +
        '<div class="prose">' + markdown(md) + '</div>' +
        '</article>';
      var activeDot = document.querySelector('.mini-dot.active');
      if (activeDot) {
        try { activeDot.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      }
      attachRailTipEvents();
      window.scrollTo(0, 0);
    });
  });
}

function renderAbout() {
  updateMetaTags('About - ioclick', 'About Prem Kumar - Software engineer passionate about backend systems, JVM memory, Kafka, and system design.', 'https://ioclick.me/about');
  app.innerHTML =
    '<section class="about"><h1>About</h1><div class="prose">' +
    '<p>Hey, I’m Prem. 👋</p>' +
    '<p>I’m a software engineer who loves building backend systems and understanding how things work under the hood.</p>' +
    '<p>I started <strong>ioclick</strong> to write down clear technical notes on topics I work with, like Java JVM memory, HashMap internals, Kafka rebalancing, and system design.</p>' +
    '<p>My goal is simple: explain complex tech in plain English so it actually makes sense. If an article here helps you understand something faster, that’s awesome.</p>' +
    '<p>Outside of coding, I enjoy building side projects, reading engineering postmortems, and learning new tools.</p>' +
    '<p>Feel free to connect with me on <a href="https://www.linkedin.com/in/cherupallypremkumar/" target="_blank" rel="noopener">LinkedIn</a>.</p>' +
    '</div></section>';
  window.scrollTo(0, 0);
}

function htmlToMarkdown(node) {
  if (!node) return '';
  if (typeof node === 'string') {
    var temp = document.createElement('div');
    temp.innerHTML = node;
    node = temp;
  }
  var output = '';
  for (var i = 0; i < node.childNodes.length; i++) {
    var child = node.childNodes[i];
    if (child.nodeType === 3) {
      output += child.nodeValue;
    } else if (child.nodeType === 1) {
      var tag = child.tagName.toLowerCase();
      var inner = htmlToMarkdown(child);
      if (tag === 'h1' || tag === 'h2') output += '\n\n## ' + inner.trim() + '\n\n';
      else if (tag === 'h3') output += '\n\n### ' + inner.trim() + '\n\n';
      else if (tag === 'p' || tag === 'div') output += '\n\n' + inner.trim() + '\n\n';
      else if (tag === 'strong' || tag === 'b') output += '**' + inner + '**';
      else if (tag === 'em' || tag === 'i') output += '*' + inner + '*';
      else if (tag === 'code' && (!child.parentNode || !child.parentNode.tagName || child.parentNode.tagName.toLowerCase() !== 'pre')) output += '`' + inner + '`';
      else if (tag === 'pre') output += '\n\n```\n' + child.textContent.trim() + '\n```\n\n';
      else if (tag === 'ul') output += '\n\n' + inner + '\n\n';
      else if (tag === 'li') output += '- ' + inner.trim() + '\n';
      else if (tag === 'blockquote') output += '\n\n> ' + inner.trim() + '\n\n';
      else if (tag === 'a') output += '[' + inner + '](' + (child.getAttribute('href') || '') + ')';
      else if (tag === 'br') output += '\n';
      else output += inner;
    }
  }
  return output.replace(/\n{3,}/g, '\n\n').trim();
}

function sha256Hex(str) {
  var buffer = new TextEncoder().encode(str);
  return window.crypto.subtle.digest('SHA-256', buffer).then(function (hash) {
    return Array.from(new Uint8Array(hash)).map(function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  });
}

function renderWrite() {
  updateMetaTags('Write - ioclick', 'In-browser blog post writer studio for ioclick.', 'https://ioclick.me/write');
  var ADMIN_HASH = '9a900403ac313ba27a1bc81f0932652b8020dac92c234d98fa0b06bf0040ecfd';
  var savedPassHash = localStorage.getItem('ioclick-admin-hash');

  if (savedPassHash !== ADMIN_HASH) {
    app.innerHTML =
      '<div class="admin-lock-screen" style="max-width:400px;margin:80px auto;padding:32px 24px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius);text-align:center;">' +
        '<div style="width:48px;height:48px;border-radius:50%;background:var(--muted);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px;">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        '</div>' +
        '<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;">Write Studio Protected</h2>' +
        '<p style="color:var(--muted-foreground);font-size:13.5px;margin-bottom:20px;line-height:1.5;">Enter your admin access passcode to unlock the blog writing studio.</p>' +
        '<form id="passForm">' +
          '<input type="password" id="passInput" placeholder="Enter Access Passcode..." required style="width:100%;margin-bottom:14px;height:42px;padding:0 14px;font-size:14px;background:var(--background);border:1px solid var(--input);border-radius:var(--radius);color:var(--foreground);outline:none;box-sizing:border-box;">' +
          '<div id="passErr" style="color:#ef4444;font-size:12.5px;margin-bottom:12px;display:none;">Incorrect passcode. Access denied.</div>' +
          '<button type="submit" class="btn-publish" style="width:100%;justify-content:center;margin:0;">Unlock Studio</button>' +
        '</form>' +
      '</div>';

    setTimeout(function () {
      var passForm = document.getElementById('passForm');
      var passInput = document.getElementById('passInput');
      var passErr = document.getElementById('passErr');
      if (passForm && passInput) {
        passInput.focus();
        passForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var val = passInput.value.trim();
          sha256Hex(val).then(function (hash) {
            if (hash === ADMIN_HASH) {
              localStorage.setItem('ioclick-admin-hash', hash);
              renderWrite();
            } else {
              if (passErr) passErr.style.display = 'block';
              passInput.value = '';
            }
          });
        });
      }
    }, 50);
    return Promise.resolve();
  }

  var savedToken = localStorage.getItem('ioclick-gh-token') || '';
  var savedDraft = {};
  try {
    var rawDraft = localStorage.getItem('ioclick-draft');
    if (rawDraft) savedDraft = JSON.parse(rawDraft);
  } catch (e) {
    savedDraft = {};
  }
  var today = new Date().toISOString().slice(0, 10);

  return loadPosts().catch(function () { return []; }).then(function (posts) {
    posts = Array.isArray(posts) ? posts : [];

    // Edit target survives reloads/re-renders alongside the autosaved draft,
    // otherwise a restored draft publishes itself as a brand new post.
    var editingSlug = (savedDraft && savedDraft.editingSlug) || null;
    if (editingSlug && !posts.filter(function (p) { return p.slug === editingSlug; }).length) {
      editingSlug = null;
    }

    var defaultTechStack = ['Java', 'Kafka', 'System Design', 'Distributed Systems', 'Architecture', 'JVM Internals', 'Spring Boot', 'Backend', 'Performance', 'Microservices', 'Databases', 'Concurrency'];
    var knownTags = defaultTechStack.slice();
    posts.forEach(function (p) {
      (p.tags || []).forEach(function (t) {
        if (t && knownTags.indexOf(t) === -1) knownTags.push(t);
      });
    });
    knownTags.sort();
    var manageListHtml = posts.map(function (p) {
      var isDraft = !!p.draft;
      return '<div class="manage-post-item" data-slug="' + p.slug + '">' +
        '<div class="manage-post-info">' +
          '<span class="status-badge ' + (isDraft ? 'status-draft' : 'status-active') + '">' +
            '<span class="badge-dot ' + (isDraft ? 'dot-draft' : 'dot-active') + '"></span>' +
            (isDraft ? 'Draft' : 'Active') +
          '</span>' +
          '<strong class="manage-title">' + esc(p.title) + '</strong>' +
          '<small class="manage-meta">' + fmtDate(p.date) + ' · ' + esc(p.read || '') + '</small>' +
        '</div>' +
        '<div class="manage-post-actions">' +
          '<button type="button" class="action-sm-btn btn-edit-post" data-slug="' + p.slug + '"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>Edit</button>' +
          '<button type="button" class="action-sm-btn btn-toggle-draft" data-slug="' + p.slug + '">' + (isDraft ? 'Publish' : 'Hide') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    app.innerHTML =
      '<section class="write-page" id="writePage">' +
        '<!-- Manage Existing Posts Drawer -->' +
        '<details class="manage-drawer">' +
          '<summary class="manage-summary"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:-2px;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>Manage All Posts (' + posts.length + ')</summary>' +
          '<div class="manage-post-list" id="managePostList">' + manageListHtml + '</div>' +
        '</details>' +

        '<form id="writeForm" class="write-form">' +
          '<!-- Header Toolbar: Zen Mode, Draft Status & Stats -->' +
          '<div class="write-header-bar">' +
            '<div class="write-stats" id="writeStats">words: 0 · chars: 0 · 1 min read</div>' +
            '<div class="write-actions-top">' +
              '<span class="draft-tag" id="draftStatus">Draft Saved</span>' +
              '<button type="button" class="action-sm-btn" id="btnZen" title="Toggle Distraction-Free Zen Mode"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 2 2h3"/></svg>Zen Mode</button>' +
              '<button type="button" class="action-sm-btn" id="btnCopyMd" title="Copy Raw Markdown"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>Copy MD</button>' +
              '<button type="button" class="action-sm-btn text-danger" id="btnClearDraft" title="Clear Saved Draft"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>Clear Draft</button>' +
            '</div>' +
          '</div>' +

          '<!-- Mobile View Switcher Tabs (Mobile Only) -->' +
          '<div class="mobile-write-tabs">' +
            '<button type="button" class="m-tab active" id="tabEditor"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-2px;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>Editor</button>' +
            '<button type="button" class="m-tab" id="tabPreview"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-2px;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Preview</button>' +
          '</div>' +

          '<!-- Edit Mode Banner: shows which post will be overwritten -->' +
          '<div class="edit-mode-bar" id="editModeBar" style="display:none;">' +
            '<span class="edit-mode-text">Editing existing post · saves to <code id="editModeSlug"></code> (URL stays the same even if you change the title)</span>' +
            '<button type="button" class="action-sm-btn" id="btnCancelEdit">Cancel edit &amp; start new</button>' +
          '</div>' +

          '<!-- Compact Title & Token Row -->' +
          '<div class="form-row main-title-row">' +
            '<div class="form-group flex-2">' +
              '<label>Title</label>' +
              '<input type="text" id="wTitle" class="input-title" placeholder="e.g. How Service A talks to Service B" value="' + esc(savedDraft.title || '') + '" required>' +
            '</div>' +
            '<div class="form-group flex-1">' +
              '<label>GitHub Token (<a href="https://github.com/settings/tokens" target="_blank" rel="noopener">Get Token</a>)</label>' +
              '<input type="password" id="wToken" class="input-compact" value="' + esc(savedToken) + '" placeholder="ghp_xxxxxxxxxxxx" required>' +
            '</div>' +
          '</div>' +

          '<!-- Clean 2-Column System-Automated Metadata Strip -->' +
          '<div class="meta-strip">' +
            '<div class="form-group flex-2">' +
              '<label>Tech Stack</label>' +
              '<div class="job-tag-picker-row" style="display:flex;gap:10px;align-items:center;width:100%;">' +
                '<!-- Left: Selected Tag Chips Box -->' +
                '<div class="selected-tags-box" id="selectedTagsBox" style="flex:1;min-width:0;">' +
                  '<div id="chipContainer" style="display:inline-flex;flex-wrap:nowrap;white-space:nowrap;gap:6px;flex-shrink:0;"></div>' +
                  '<input type="text" id="tagInput" class="tag-search-input" placeholder="Type custom tag + Enter..." autocomplete="off">' +
                '</div>' +
                '<!-- Right: Tech Stack Dropdown Button -->' +
                '<div class="custom-select" id="tagDropdownSelect" style="width:160px;flex:none;">' +
                  '<button type="button" class="custom-select-btn" id="tagDropdownBtn" style="width:100%;justify-content:space-between;">' +
                    '<span>Tech Stack</span>' +
                    '<span class="chevron">▾</span>' +
                  '</button>' +
                  '<div class="custom-select-menu" id="tagDropdownMenu" style="min-width:180px;right:0;left:auto;">' +
                    knownTags.map(function (t) {
                      return '<div class="custom-option tag-option-item" data-tag="' + esc(t) + '">' + esc(t) + '</div>';
                    }).join('') +
                  '</div>' +
                '</div>' +
                '<input type="hidden" id="wTags" value="' + esc(savedDraft.tags || '') + '">' +
              '</div>' +
            '</div>' +
            '<div class="form-group flex-2">' +
              '<label>Short Summary</label>' +
              '<input type="text" id="wExcerpt" class="input-compact" placeholder="1-2 sentence overview for home feed card" value="' + esc(savedDraft.excerpt || '') + '">' +
            '</div>' +
          '</div>' +

          '<!-- Split Screen: Big Writer + Big Live Preview -->' +
          '<div class="editor-split" id="editorSplit">' +
            '<!-- Left side: Visual Toolbar & Writer -->' +
            '<div class="editor-left" id="editorLeft">' +
              '<div class="editor-toolbar">' +
                '<button type="button" class="tb-btn" data-action="bold" title="Bold (⌘B)">B</button>' +
                '<button type="button" class="tb-btn" data-action="italic" title="Italic (⌘I)">I</button>' +
                '<button type="button" class="tb-btn" data-action="h2" title="Heading 2">H2</button>' +
                '<button type="button" class="tb-btn" data-action="h3" title="Heading 3">H3</button>' +
                '<button type="button" class="tb-btn" data-action="code" title="Code Block">Code</button>' +
                '<button type="button" class="tb-btn" data-action="list" title="Bullet List">List</button>' +
                '<button type="button" class="tb-btn" data-action="quote" title="Quote">Quote</button>' +
                '<button type="button" class="tb-btn" data-action="link" title="Insert Link (⌘K)">Link</button>' +
              '</div>' +
              '<div contenteditable="true" id="wContent" class="rich-editor-canvas" data-placeholder="Start typing your article here... Click toolbar buttons (B, I, H2, H3, Code, List, Quote, Link) to format directly!"></div>' +
            '</div>' +

            '<!-- Right side: Real Live Blog Preview -->' +
            '<div class="editor-right" id="editorRight">' +
              '<div class="preview-head">Live Post Preview</div>' +
              '<div id="wPreview" class="article-preview">' +
                '<article class="article" style="margin:0;padding:0;">' +
                  '<div class="a-meta"><time id="pDate">' + fmtDate(today) + '</time><span id="pRead">· 5 min read</span></div>' +
                  '<h1 class="a-title" id="pTitle">How Service A talks to Service B</h1>' +
                  '<p class="a-sub" id="pExcerpt"></p>' +
                  '<div class="a-tags" id="pTags"></div>' +
                  '<div class="divider"></div>' +
                  '<div class="prose" id="pProse"></div>' +
                '</article>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div id="wStatus" class="write-status"></div>' +
          '<button type="submit" id="wBtn" class="btn-publish">Publish post</button>' +
        '</form>' +
      '</section>';

    window.scrollTo(0, 0);

    var titleEl = document.getElementById('wTitle');
    var tagsEl = document.getElementById('wTags');
    var excerptEl = document.getElementById('wExcerpt');
    var contentEl = document.getElementById('wContent');
    var chipContainer = document.getElementById('chipContainer');
    var tagInput = document.getElementById('tagInput');

    var tagDropdownSelect = document.getElementById('tagDropdownSelect');
    var tagDropdownBtn = document.getElementById('tagDropdownBtn');

    if (tagDropdownBtn && tagDropdownSelect) {
      tagDropdownBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        tagDropdownSelect.classList.toggle('open');
      });

      document.addEventListener('click', function (e) {
        if (!tagDropdownSelect.contains(e.target)) {
          tagDropdownSelect.classList.remove('open');
        }
      });
    }

    if (savedDraft.content && contentEl) {
      contentEl.innerHTML = markdown(savedDraft.content);
    }

    var writeStatsEl = document.getElementById('writeStats');
    var draftStatusEl = document.getElementById('draftStatus');
    var writePageEl = document.getElementById('writePage');

    function getMarkdownFromEditor() {
      if (!contentEl) return '';
      if (contentEl.tagName === 'TEXTAREA') return contentEl.value;
      var clone = contentEl.cloneNode(true);
      function parseNode(node) {
        if (!node) return '';
        if (node.nodeType === 3) return node.nodeValue;
        if (node.nodeType !== 1) return '';
        var tag = node.tagName.toLowerCase();
        var children = Array.from(node.childNodes).map(parseNode).join('');
        if (tag === 'h1' || tag === 'h2') return '\n\n## ' + children.trim() + '\n\n';
        if (tag === 'h3') return '\n\n### ' + children.trim() + '\n\n';
        if (tag === 'p') return '\n\n' + children.trim() + '\n\n';
        if (tag === 'strong' || tag === 'b') return '**' + children + '**';
        if (tag === 'em' || tag === 'i') return '*' + children + '*';
        if (tag === 'code') return '`' + children + '`';
        if (tag === 'pre') {
          var codeEl = node.querySelector('code');
          var lang = codeEl ? (codeEl.getAttribute('data-lang') || '') : '';
          return '\n\n```' + lang + '\n' + node.textContent.replace(/^\n+/, '').replace(/\s+$/, '') + '\n```\n\n';
        }
        if (tag === 'hr') return '\n\n---\n\n';
        if (tag === 'blockquote') {
          return '\n\n' + children.trim().split('\n').map(function (l) {
            return l.trim() ? '> ' + l.trim() : '>';
          }).join('\n') + '\n\n';
        }
        // Recurse into <li> rather than reading textContent, or bold/code/links
        // inside list items are flattened to plain text on every save.
        if (tag === 'ul' || tag === 'ol') {
          var lis = Array.from(node.children).filter(function (c) { return c.tagName.toLowerCase() === 'li'; });
          return '\n\n' + lis.map(function (li, idx) {
            var marker = tag === 'ol' ? (idx + 1) + '. ' : '- ';
            return marker + parseNode(li).replace(/\s+/g, ' ').trim();
          }).join('\n') + '\n\n';
        }
        if (tag === 'table') {
          var rows = Array.from(node.querySelectorAll('tr'));
          if (!rows.length) return children;
          var out = rows.map(function (tr) {
            return '| ' + Array.from(tr.children).map(function (cell) {
              return parseNode(cell).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
            }).join(' | ') + ' |';
          });
          var sep = [];
          for (var ci = 0; ci < rows[0].children.length; ci++) sep.push('---');
          out.splice(1, 0, '| ' + sep.join(' | ') + ' |');
          return '\n\n' + out.join('\n') + '\n\n';
        }
        if (tag === 'a') return '[' + children + '](' + (node.getAttribute('href') || '#') + ')';
        if (tag === 'div' || tag === 'br') return '\n' + children;
        return children;
      }
      return parseNode(clone).replace(/\n{3,}/g, '\n\n').trim();
    }

    function applyToolbarAction(action) {
      if (!contentEl) return;
      contentEl.focus();
      if (action === 'bold') document.execCommand('bold');
      else if (action === 'italic') document.execCommand('italic');
      else if (action === 'h2') document.execCommand('formatBlock', false, '<h2>');
      else if (action === 'h3') document.execCommand('formatBlock', false, '<h3>');
      else if (action === 'list') document.execCommand('insertUnorderedList');
      else if (action === 'quote') document.execCommand('formatBlock', false, '<blockquote>');
      else if (action === 'link') {
        var url = prompt('Enter link URL (e.g. https://example.com):');
        if (url) document.execCommand('createLink', false, url);
      } else if (action === 'code') {
        var pre = document.createElement('pre');
        var code = document.createElement('code');
        code.textContent = '// Insert your code here';
        pre.appendChild(code);
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          var range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(pre);
        } else {
          contentEl.appendChild(pre);
        }
      }
      updatePreview();
    }

    document.querySelectorAll('.tb-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var action = btn.getAttribute('data-action');
        applyToolbarAction(action);
      });
    });

    function renderTagChips() {
      if (!tagsEl || !chipContainer) return;
      var tagsArr = tagsEl.value ? tagsEl.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
      
      chipContainer.innerHTML = tagsArr.map(function (t) {
        return '<span class="job-tag-chip">' + esc(t) + '<button type="button" class="chip-x" data-tag="' + esc(t) + '">×</button></span>';
      }).join('');

      var selectedTagsBox = document.getElementById('selectedTagsBox');
      if (selectedTagsBox) {
        setTimeout(function () { selectedTagsBox.scrollLeft = selectedTagsBox.scrollWidth; }, 20);
      }

      document.querySelectorAll('.tag-option-item').forEach(function (btn) {
        var t = btn.getAttribute('data-tag');
        if (tagsArr.indexOf(t) !== -1) {
          btn.classList.add('active');
          btn.textContent = '✓ ' + t;
        } else {
          btn.classList.remove('active');
          btn.textContent = t;
        }
      });

      chipContainer.querySelectorAll('.chip-x').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var tagToRemove = btn.getAttribute('data-tag');
          var current = tagsEl.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
          var idx = current.indexOf(tagToRemove);
          if (idx > -1) current.splice(idx, 1);
          tagsEl.value = current.join(', ');
          renderTagChips();
          updatePreview();
        });
      });
    }

    document.querySelectorAll('.tag-option-item').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var tag = btn.getAttribute('data-tag');
        if (!tag || !tagsEl) return;
        var current = tagsEl.value ? tagsEl.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
        var idx = current.indexOf(tag);
        if (idx > -1) {
          current.splice(idx, 1);
        } else {
          current.push(tag);
        }
        tagsEl.value = current.join(', ');
        renderTagChips();
        updatePreview();
      });
    });

    if (tagInput) {
      tagInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          var newTag = tagInput.value.replace(/,/g, '').trim();
          if (newTag && tagsEl) {
            var current = tagsEl.value ? tagsEl.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
            if (current.indexOf(newTag) === -1) {
              current.push(newTag);
              tagsEl.value = current.join(', ');
              renderTagChips();
              updatePreview();
            }
            tagInput.value = '';
          }
        }
      });
    }

    renderTagChips();

    function updatePreview() {
      var title = titleEl ? (titleEl.value || 'How Service A talks to Service B') : '';
      var text = contentEl ? (contentEl.textContent || '') : '';
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;
      var chars = text.length;
      var estRead = Math.max(1, Math.ceil(words / 200)) + ' min read';
      var date = today;
      var read = estRead;
      var tagsRaw = tagsEl ? (tagsEl.value || '') : '';
      var excerpt = excerptEl ? (excerptEl.value || '') : '';

      var pTitle = document.getElementById('pTitle');
      var pDate = document.getElementById('pDate');
      var pRead = document.getElementById('pRead');
      var pExcerpt = document.getElementById('pExcerpt');
      var pTags = document.getElementById('pTags');
      var pProse = document.getElementById('pProse');

      if (pTitle) pTitle.textContent = title;
      if (pDate) pDate.textContent = fmtDate(date);
      if (pRead) pRead.textContent = '· ' + read;
      if (pExcerpt) pExcerpt.textContent = excerpt;

      var tagsArr = tagsRaw ? tagsRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
      if (pTags) {
        pTags.innerHTML = tagsArr.map(function (t) {
          return '<span class="badge">' + esc(t) + '</span>';
        }).join('');
      }

      if (pProse) {
        var htmlContent = contentEl ? contentEl.innerHTML : '';
        pProse.innerHTML = htmlContent.trim() ? htmlContent : '<p style="color:var(--muted-foreground);font-style:italic;">Your live blog preview will appear here as you type...</p>';
      }

      if (writeStatsEl) writeStatsEl.textContent = 'words: ' + words + ' · chars: ' + chars + ' · ' + estRead;

      var mdText = getMarkdownFromEditor();
      var draftObj = { title: title, date: date, read: read, tags: tagsRaw, excerpt: excerpt, content: mdText, editingSlug: editingSlug };
      localStorage.setItem('ioclick-draft', JSON.stringify(draftObj));
      if (draftStatusEl) draftStatusEl.textContent = 'Draft Saved';
    }

    [titleEl, tagsEl, excerptEl].forEach(function (el) {
      if (el) el.addEventListener('input', updatePreview);
    });

    if (contentEl) {
      contentEl.addEventListener('input', updatePreview);
      contentEl.addEventListener('keyup', updatePreview);
    }

    updatePreview();

    var isSyncing = false;
    if (contentEl) {
      contentEl.addEventListener('scroll', function () {
        if (isSyncing) return;
        isSyncing = true;
        var previewContainer = document.getElementById('wPreview');
        if (previewContainer && contentEl.scrollHeight > contentEl.clientHeight) {
          var pct = contentEl.scrollTop / (contentEl.scrollHeight - contentEl.clientHeight);
          previewContainer.scrollTop = pct * (previewContainer.scrollHeight - previewContainer.clientHeight);
        }
        setTimeout(function () { isSyncing = false; }, 40);
      });

      contentEl.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
          e.preventDefault();
          var start = contentEl.selectionStart || 0;
          var end = contentEl.selectionEnd || 0;
          contentEl.value = contentEl.value.substring(0, start) + '  ' + contentEl.value.substring(end);
          contentEl.selectionStart = contentEl.selectionEnd = start + 2;
          updatePreview();
          return;
        }
        if (e.metaKey || e.ctrlKey) {
          var key = e.key.toLowerCase();
          if (key === 'b') { e.preventDefault(); applyToolbarAction('bold'); }
          else if (key === 'i') { e.preventDefault(); applyToolbarAction('italic'); }
          else if (key === 'k') { e.preventDefault(); applyToolbarAction('link'); }
        }
      });
    }

    var tabEditor = document.getElementById('tabEditor');
    var tabPreview = document.getElementById('tabPreview');
    var editorLeft = document.getElementById('editorLeft');
    var editorRight = document.getElementById('editorRight');

    if (tabEditor && tabPreview && editorLeft && editorRight) {
      tabEditor.addEventListener('click', function () {
        tabEditor.classList.add('active');
        tabPreview.classList.remove('active');
        editorLeft.style.display = 'flex';
        editorRight.style.display = 'none';
      });
      tabPreview.addEventListener('click', function () {
        tabPreview.classList.add('active');
        tabEditor.classList.remove('active');
        editorLeft.style.display = 'none';
        editorRight.style.display = 'block';
      });
    }

    var zenIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 2 2h3"/></svg>';
    var copyIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    var checkIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;vertical-align:-1px;"><polyline points="20 6 9 17 4 12"/></svg>';

    var btnZen = document.getElementById('btnZen');
    if (btnZen && writePageEl) {
      btnZen.addEventListener('click', function () {
        writePageEl.classList.toggle('zen-mode');
        btnZen.innerHTML = writePageEl.classList.contains('zen-mode') ? 'Exit Zen' : (zenIcon + 'Zen Mode');
      });
    }

    var btnCopyMd = document.getElementById('btnCopyMd');
    if (btnCopyMd && titleEl && contentEl) {
      btnCopyMd.addEventListener('click', function () {
        var mdFull = '# ' + (titleEl.value || 'Title') + '\n\n' + (contentEl.value || '');
        navigator.clipboard.writeText(mdFull).then(function () {
          btnCopyMd.innerHTML = checkIcon + 'Copied!';
          setTimeout(function () { btnCopyMd.innerHTML = copyIcon + 'Copy MD'; }, 1800);
        });
      });
    }

    var btnClearDraft = document.getElementById('btnClearDraft');
    if (btnClearDraft && titleEl && excerptEl && tagsEl && contentEl) {
      btnClearDraft.addEventListener('click', function () {
        if (confirm('Clear saved draft?')) {
          resetComposer();
          localStorage.removeItem('ioclick-draft');
        }
      });
    }

    if (form) {
      form.querySelectorAll('input').forEach(function (inputEl) {
        inputEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            return false;
          }
        });
      });
    }

    function applyToolbarAction(action) {
      if (!contentEl) return;
      var start = contentEl.selectionStart || 0;
      var end = contentEl.selectionEnd || 0;
      var val = contentEl.value || '';
      var sel = val.substring(start, end);
      var replacement = '';

      if (action === 'bold') replacement = '**' + (sel || 'bold text') + '**';
      else if (action === 'italic') replacement = '*' + (sel || 'italic text') + '*';
      else if (action === 'h2') replacement = '\n## ' + (sel || 'Heading 2') + '\n';
      else if (action === 'h3') replacement = '\n### ' + (sel || 'Heading 3') + '\n';
      else if (action === 'code') replacement = '\n```java\n' + (sel || '// Your code here') + '\n```\n';
      else if (action === 'list') replacement = '\n- ' + (sel || 'First item') + '\n- Second item\n';
      else if (action === 'quote') replacement = '\n> ' + (sel || 'Quote text here') + '\n';
      else if (action === 'link') {
        var url = prompt('Enter URL:', 'https://');
        if (url) {
          var cleanUrl = url.trim();
          if (/^(javascript:|data:|vbscript:)/i.test(cleanUrl)) cleanUrl = '#';
          replacement = '[' + (sel || 'link text') + '](' + cleanUrl + ')';
        } else return;
      }

      contentEl.value = val.substring(0, start) + replacement + val.substring(end);
      contentEl.focus();
      contentEl.selectionStart = start + replacement.length;
      contentEl.selectionEnd = start + replacement.length;
      updatePreview();
    }

    document.querySelectorAll('.tb-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyToolbarAction(btn.getAttribute('data-action'));
      });
    });

    var form = document.getElementById('writeForm');
    var statusEl = document.getElementById('wStatus');
    var btnPublish = document.getElementById('wBtn');
    var isPublishButtonClicked = false;

    function setEditMode(slug) {
      editingSlug = slug || null;
      if (btnPublish) btnPublish.textContent = editingSlug ? 'Save Changes to Post' : 'Publish post';
      var bar = document.getElementById('editModeBar');
      var slugEl = document.getElementById('editModeSlug');
      if (bar) bar.style.display = editingSlug ? 'flex' : 'none';
      if (slugEl && editingSlug) slugEl.textContent = '/post/' + editingSlug;
      updatePreview();
    }

    function resetComposer() {
      if (titleEl) titleEl.value = '';
      if (excerptEl) excerptEl.value = '';
      if (tagsEl) tagsEl.value = '';
      if (contentEl) contentEl.innerHTML = '';
      renderTagChips();
      setEditMode(null);
    }

    // Restore the banner/button state for an edit session recovered from localStorage.
    setEditMode(editingSlug);

    var btnCancelEdit = document.getElementById('btnCancelEdit');
    if (btnCancelEdit) {
      btnCancelEdit.addEventListener('click', function () {
        if (confirm('Stop editing this post and clear the composer for a new one?')) {
          resetComposer();
        }
      });
    }

    btnPublish.addEventListener('click', function () {
      isPublishButtonClicked = true;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!isPublishButtonClicked) {
        return false;
      }
      isPublishButtonClicked = false;

      var confirmPass = prompt('Security Authorization: Enter Admin Passcode to authorize this change:');
      if (!confirmPass) {
        statusEl.className = 'write-status error';
        statusEl.textContent = 'Change cancelled. Admin passcode authorization required.';
        return;
      }

      sha256Hex(confirmPass.trim()).then(function (hash) {
        if (hash !== ADMIN_HASH) {
          statusEl.className = 'write-status error';
          statusEl.textContent = 'Access Denied: Invalid Admin Passcode.';
          return;
        }

        var title = titleEl ? titleEl.value.trim() : '';
        var content = getMarkdownFromEditor();
        var words = content.trim() ? content.trim().split(/\s+/).length : 0;
        var read = Math.max(1, Math.ceil(words / 200)) + ' min read';
        var date = today;
        var tagsRaw = tagsEl ? tagsEl.value.trim() : '';
        var excerpt = excerptEl ? excerptEl.value.trim() : '';
        var tokenInput = document.getElementById('wToken');
        var token = tokenInput ? tokenInput.value.trim() : '';
        if (!token) {
          token = prompt('Enter your GitHub Personal Access Token (ghp_xxxx) to publish to GitHub:');
          if (token && tokenInput) tokenInput.value = token.trim();
        }
        if (!token) {
          statusEl.className = 'write-status error';
          statusEl.textContent = 'Publish cancelled. GitHub Personal Access Token required.';
          return;
        }

        var slug = editingSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (!slug) {
          statusEl.className = 'write-status error';
          statusEl.textContent = 'Please enter a valid title.';
          return;
        }

      var tags = tagsRaw ? tagsRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];

      btnPublish.disabled = true;
      btnPublish.textContent = 'Saving to GitHub...';
      statusEl.className = 'write-status info';
      statusEl.textContent = 'Checking existing Markdown file on GitHub...';

      var repoOwner = 'CherupallyPremkumar';
      var repoName = 'ioclick';
      var mdPath = 'posts/' + slug + '.md';
      var mdContent = '# ' + title + '\n\n' + content;
      var mdBase64 = toBase64(mdContent);

      // Step 1: Check if .md file exists to grab sha (required by GitHub for updates)
      fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName + '/contents/' + mdPath, {
        headers: { 'Authorization': 'token ' + token }
      }).then(function (r) {
        if (r.ok) return r.json();
        return null;
      }).then(function (fileInfo) {
        var putBody = {
          message: (fileInfo ? 'Update' : 'Add') + ' blog post: ' + title,
          content: mdBase64
        };
        if (fileInfo && fileInfo.sha) putBody.sha = fileInfo.sha;

        statusEl.textContent = (fileInfo ? 'Updating' : 'Creating') + ' Markdown file on GitHub...';
        return fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName + '/contents/' + mdPath, {
          method: 'PUT',
          headers: {
            'Authorization': 'token ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(putBody)
        });
      }).then(function (r) {
        if (!r.ok) throw new Error('Failed to save .md file. Check token repo permissions.');
        statusEl.textContent = 'Updating posts/index.json...';
        return fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName + '/contents/posts/index.json', {
          headers: { 'Authorization': 'token ' + token }
        });
      }).then(function (r) {
        return r.json();
      }).then(function (jsonRes) {
        var sha = jsonRes.sha;
        var existingJson = JSON.parse(fromBase64(jsonRes.content));
        var foundIdx = -1;
        for (var i = 0; i < existingJson.length; i++) {
          if (existingJson[i].slug === slug || (editingSlug && existingJson[i].slug === editingSlug)) {
            foundIdx = i;
            break;
          }
        }

        var isEdit = foundIdx !== -1;
        var originalDate = (isEdit && existingJson[foundIdx].date) ? existingJson[foundIdx].date : date;
        var updatedDate = isEdit ? today : null;

        var entry = {
          slug: slug,
          title: title,
          date: originalDate,
          read: read,
          tags: tags,
          excerpt: excerpt
        };
        if (updatedDate && updatedDate !== originalDate) {
          entry.updated = updatedDate;
        }
        if (editingSlug && isEdit && existingJson[foundIdx].draft) {
          entry.draft = true;
        }

        if (foundIdx !== -1) {
          existingJson[foundIdx] = entry;
        } else {
          existingJson.unshift(entry);
        }

        var updatedJsonStr = JSON.stringify(existingJson, null, 2);
        var updatedJsonBase64 = toBase64(updatedJsonStr);

        return fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName + '/contents/posts/index.json', {
          method: 'PUT',
          headers: {
            'Authorization': 'token ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'Update posts/index.json for: ' + title,
            content: updatedJsonBase64,
            sha: sha
          })
        });
      }).then(function (r) {
        if (!r.ok) throw new Error('Failed to update index.json on GitHub.');
        statusEl.textContent = 'Updating sitemap.xml...';
        return fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName + '/contents/sitemap.xml', {
          headers: { 'Authorization': 'token ' + token }
        });
      }).then(function (r) {
        return r.json();
      }).then(function (sitemapRes) {
        var sitemapSha = sitemapRes.sha;
        var sitemapXml = fromBase64(sitemapRes.content);
        var targetLoc = 'https://ioclick.me/post/' + slug;
        var updatedXml = sitemapXml;

        if (sitemapXml.indexOf(targetLoc) !== -1) {
          var reg = new RegExp('(<loc>' + targetLoc.replace(/\//g, '\\/') + '<\\/loc>\\s*<lastmod>)[^<]+(<\\/lastmod>)');
          updatedXml = sitemapXml.replace(reg, '$1' + date + '$2');
        } else {
          var newUrlXml = '  <url>\n    <loc>' + targetLoc + '</loc>\n    <lastmod>' + date + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n</urlset>';
          updatedXml = sitemapXml.replace('</urlset>', newUrlXml);
        }

        var updatedXmlBase64 = toBase64(updatedXml);

        return fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName + '/contents/sitemap.xml', {
          method: 'PUT',
          headers: {
            'Authorization': 'token ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'Update sitemap.xml for: ' + title,
            content: updatedXmlBase64,
            sha: sitemapSha
          })
        });
      }).then(function () {
        statusEl.className = 'write-status success';
        statusEl.textContent = 'Published live successfully! Redirecting...';
        POSTS = null;
        // Drop the autosaved draft, else returning to /write reloads this post
        // with no edit target and republishes it as a duplicate.
        localStorage.removeItem('ioclick-draft');
        editingSlug = null;
        setTimeout(function () { navigate('/', true); }, 1500);
      }).catch(function (err) {
        btnPublish.disabled = false;
        btnPublish.textContent = editingSlug ? 'Save Changes to Post' : 'Publish post';
        statusEl.className = 'write-status error';
        statusEl.textContent = err.message || 'Error publishing post.';
      });
      });
    });

    document.querySelectorAll('.btn-edit-post').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slug = btn.getAttribute('data-slug');
        var p = posts.filter(function (x) { return x.slug === slug; })[0];
        if (!p) return;
        if (titleEl) titleEl.value = p.title || '';
        if (tagsEl) tagsEl.value = (p.tags || []).join(', ');
        renderTagChips();
        if (excerptEl) excerptEl.value = p.excerpt || '';
        setEditMode(slug);

        var rootPath = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
        if (rootPath.indexOf('/post/') !== -1) rootPath = '/';

        fetch(rootPath + 'posts/' + slug + '.md').then(function (r) { return r.text(); }).then(function (md) {
          if (contentEl) contentEl.innerHTML = markdown((md || '').replace(/^\s*#\s+.*\n/, ''));
          updatePreview();
          var details = document.querySelector('.manage-drawer');
          if (details) details.open = false;
          window.scrollTo({ top: 180, behavior: 'smooth' });
        });
      });
    });

    document.querySelectorAll('.btn-toggle-draft').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var confirmPass = prompt('Security Authorization: Enter Admin Passcode to authorize status change:');
        if (!confirmPass) return;

        sha256Hex(confirmPass.trim()).then(function (hash) {
          if (hash !== ADMIN_HASH) {
            alert('Access Denied: Invalid Admin Passcode.');
            return;
          }

          var slug = btn.getAttribute('data-slug');
          var token = document.getElementById('wToken').value.trim() || savedToken;
          if (!token) {
            alert('Please enter your GitHub Token first to toggle post status.');
            return;
          }
          var p = posts.filter(function (x) { return x.slug === slug; })[0];
          if (!p) return;
          var newDraftState = !p.draft;
          btn.disabled = true;
          btn.textContent = 'Updating...';

          var repoOwner = 'CherupallyPremkumar';
          var repoName = 'ioclick';

          fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName + '/contents/posts/index.json', {
            headers: { 'Authorization': 'token ' + token }
          }).then(function (r) { return r.json(); }).then(function (jsonRes) {
            var sha = jsonRes.sha;
            var list = JSON.parse(fromBase64(jsonRes.content));
            list.forEach(function (item) {
              if (item.slug === slug) item.draft = newDraftState;
            });
            var updatedBase64 = toBase64(JSON.stringify(list, null, 2));
            return fetch('https://api.github.com/repos/' + repoOwner + '/' + repoName + '/contents/posts/index.json', {
              method: 'PUT',
              headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: (newDraftState ? 'Hide' : 'Show') + ' post: ' + slug, content: updatedBase64, sha: sha })
            });
          }).then(function (r) {
            if (!r.ok) throw new Error('Failed to update index.json');
            POSTS = null;
            alert('Post status updated successfully! Reloading...');
            renderWrite();
          }).catch(function (err) {
            btn.disabled = false;
            btn.textContent = p.draft ? 'Publish' : 'Hide';
            alert('Error updating post status: ' + err.message);
          });
        });
      });
    });
  }).catch(function (err) {
    console.error('renderWrite error:', err);
    app.innerHTML = '<div class="article" style="padding:40px;color:#ef4444;"><h3>Debug Info:</h3><pre style="background:var(--card);padding:16px;border-radius:6px;overflow-x:auto;">' + esc(err.stack || err.message || String(err)) + '</pre></div>';
  });
}

/* ---------------- router ---------------- */
function getPath() {
  var s = location.search;
  if (s && s.indexOf('?/') === 0) {
    return s.slice(1);
  }
  var h = location.hash;
  if (h && h.indexOf('#/') === 0) {
    return h.slice(1);
  }
  var p = location.pathname;
  if (!p || p === '/index.html') return '/';
  return p;
}

function navigate(url, animate) {
  if (url !== getPath()) {
    history.pushState({}, '', url);
  }
  route(animate !== false);
}

function setActiveNav() {
  var path = getPath();
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    var href = a.getAttribute('href');
    var isActive = href === path || (path.indexOf('/post/') === 0 && href === '/');
    a.classList.toggle('active', isActive);
  });
}

function doRender() {
  var path = getPath();
  var p;
  if (path.indexOf('/post/') === 0) { p = renderPost(path.slice('/post/'.length)); }
  else if (path === '/about') { p = renderAbout(); }
  else if (path === '/write') { p = renderWrite(); }
  else {
    updateMetaTags('ioclick - engineering notes by Prem Kumar', 'Deep, practical engineering notes on Java, JVM internals, Kafka, system design, and backend performance by Prem Kumar.', 'https://ioclick.me/');
    p = renderHome();
  }
  setActiveNav();
  return p;
}

function route(animate) {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var path = getPath();
  var dir = (path === '/' || path === '') ? 'back' : 'fwd';
  document.documentElement.setAttribute('data-vt', dir);
  if (animate && document.startViewTransition && !reduce) {
    document.startViewTransition(function () {
      if (dir === 'fwd') window.scrollTo(0, 0);
      if (progressEl) progressEl.style.width = '0';
      return doRender();
    });
  } else {
    if (dir === 'fwd') window.scrollTo(0, 0);
    if (progressEl) progressEl.style.width = '0';
    doRender();
  }
}

// Global click interceptor for clean internal links
document.addEventListener('click', function (e) {
  var link = e.target.closest('a');
  if (!link) return;
  var href = link.getAttribute('href');
  if (!href) return;

  if (href.indexOf('#/') === 0) {
    href = href.slice(1);
  }

  if (href.indexOf('/') === 0 && link.target !== '_blank') {
    e.preventDefault();
    navigate(href, true);
  }
});

window.addEventListener('popstate', function () { route(true); });
window.addEventListener('hashchange', function () { route(true); });
route(false); // initial load

